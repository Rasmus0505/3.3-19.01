from __future__ import annotations

import json
import time
from typing import Any

import dashscope
import requests
from dashscope.audio.qwen_asr import QwenTranscription
from dashscope.files import Files

from app.core.config import ASR_TASK_POLL_SECONDS
from app.services.asr_model_registry import QWEN_ASR_MODEL, get_supported_transcribe_asr_model_keys
from app.services.faster_whisper_asr import (
    FASTER_WHISPER_ASR_MODEL,
    FasterWhisperModelNotReadyError,
    get_faster_whisper_model_status,
    transcribe_audio_file_with_faster_whisper,
)


DEFAULT_MODEL = QWEN_ASR_MODEL
QWEN_DEFAULT_MODEL = QWEN_ASR_MODEL
SUPPORTED_MODELS = set(get_supported_transcribe_asr_model_keys())


class AsrError(RuntimeError):
    def __init__(self, code: str, message: str, detail: str = ""):
        super().__init__(message)
        self.code = code
        self.message = message
        self.detail = detail


def setup_dashscope(api_key: str) -> None:
    dashscope.api_key = (api_key or "").strip()
    dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"


def _ensure_dashscope_api_key() -> str:
    api_key = str(getattr(dashscope, "api_key", "") or "").strip()
    if api_key:
        return api_key
    raise AsrError("ASR_API_KEY_MISSING", "DASHSCOPE_API_KEY 未配置")


def _to_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if hasattr(value, "to_dict"):
        try:
            res = value.to_dict()
            if isinstance(res, dict):
                return res
        except Exception:
            pass
    if value is None:
        return {}
    try:
        return json.loads(json.dumps(value, ensure_ascii=False, default=lambda x: getattr(x, "__dict__", str(x))))
    except Exception:
        return {"raw": str(value)}


def _resolve_file_id(upload_out: dict[str, Any]) -> str:
    uploaded_files = upload_out.get("uploaded_files")
    if isinstance(uploaded_files, list):
        for item in uploaded_files:
            if isinstance(item, dict):
                file_id = str(item.get("file_id") or "").strip()
                if file_id:
                    return file_id
    return str(upload_out.get("file_id") or "").strip()


def _resolve_signed_url(meta_out: dict[str, Any]) -> str:
    signed_url = str(meta_out.get("url") or "").strip()
    if signed_url:
        return signed_url
    files_payload = meta_out.get("files")
    if isinstance(files_payload, list):
        for item in files_payload:
            if isinstance(item, dict):
                candidate = str(item.get("url") or "").strip()
                if candidate:
                    return candidate
    return ""


def _extract_transcription_url(wait_out: dict[str, Any]) -> str:
    result = wait_out.get("result")
    if isinstance(result, dict):
        url = str(result.get("transcription_url") or "").strip()
        if url:
            return url
    results = wait_out.get("results")
    if isinstance(results, list):
        for item in results:
            if not isinstance(item, dict):
                continue
            if str(item.get("subtask_status") or "").strip().upper() != "SUCCEEDED":
                continue
            url = str(item.get("transcription_url") or "").strip()
            if url:
                return url
    return ""


def _extract_usage_seconds(wait_out: dict[str, Any], wait_resp: Any) -> int | None:
    candidates: list[Any] = []
    resp_usage = _to_dict(getattr(wait_resp, "usage", None))
    if resp_usage:
        candidates.append(resp_usage)
    top_level = _to_dict(wait_resp)
    if isinstance(top_level, dict) and top_level.get("usage") is not None:
        candidates.append(_to_dict(top_level.get("usage")))
    if wait_out.get("usage") is not None:
        candidates.append(_to_dict(wait_out.get("usage")))

    for usage in candidates:
        if not isinstance(usage, dict):
            continue
        raw = usage.get("seconds")
        if raw is None:
            continue
        try:
            seconds = int(float(raw))
        except Exception:
            continue
        if seconds > 0:
            return seconds
    return None


def _create_task(model: str, signed_url: str) -> Any:
    if model == QWEN_DEFAULT_MODEL:
        return QwenTranscription.async_call(
            model=model,
            file_url=signed_url,
            enable_words=True,
            enable_itn=False,
        )
    raise AsrError("INVALID_MODEL", "不支持的模型", model)


def _fetch_task(model: str, task_id: str) -> Any:
    if model == QWEN_DEFAULT_MODEL:
        return QwenTranscription.fetch(task=task_id)
    raise AsrError("INVALID_MODEL", "不支持的模型", model)


def _emit_task_progress(progress_callback, *, task_id: str, task_status: str, elapsed_seconds: int, poll_count: int) -> None:
    if not progress_callback:
        return
    try:
        progress_callback(
            {
                "task_id": task_id,
                "task_status": str(task_status or "").strip().upper(),
                "elapsed_seconds": max(0, int(elapsed_seconds or 0)),
                "poll_count": max(0, int(poll_count or 0)),
            }
        )
    except Exception:
        pass


def _transcribe_audio_file_with_qwen(
    audio_path: str,
    *,
    model: str,
    requests_timeout: int = 120,
    progress_callback=None,
) -> dict[str, Any]:
    _ensure_dashscope_api_key()

    try:
        upload_resp = Files.upload(file_path=audio_path, purpose="inference")
    except Exception as exc:
        raise AsrError("ASR_UPLOAD_FAILED", "上传音频到 DashScope 失败", str(exc)[:1200]) from exc
    upload_out = _to_dict(getattr(upload_resp, "output", None))

    file_id = _resolve_file_id(upload_out)
    if not file_id:
        raise AsrError("ASR_UPLOAD_FAILED", "上传音频成功但 file_id 为空", json.dumps(upload_out, ensure_ascii=False)[:1200])

    try:
        meta_resp = Files.get(file_id=file_id)
    except Exception as exc:
        raise AsrError("ASR_FILE_META_FAILED", "查询 DashScope 文件失败", str(exc)[:1200]) from exc
    meta_out = _to_dict(getattr(meta_resp, "output", None))

    signed_url = _resolve_signed_url(meta_out)
    if not signed_url:
        raise AsrError("ASR_FILE_META_FAILED", "查询文件成功但签名 URL 为空", json.dumps(meta_out, ensure_ascii=False)[:1200])

    try:
        task_resp = _create_task(model, signed_url)
    except AsrError:
        raise
    except Exception as exc:
        raise AsrError("ASR_TASK_CREATE_FAILED", "创建 ASR 任务失败", str(exc)[:1200]) from exc

    task_status_code = int(getattr(task_resp, "status_code", 200) or 200)
    task_out = _to_dict(getattr(task_resp, "output", None))
    if task_status_code >= 400:
        raise AsrError(
            "ASR_TASK_CREATE_FAILED",
            "创建 ASR 任务失败",
            json.dumps(
                {
                    "status_code": task_status_code,
                    "code": getattr(task_resp, "code", ""),
                    "message": getattr(task_resp, "message", ""),
                    "output": task_out,
                },
                ensure_ascii=False,
            )[:1200],
        )
    task_id = str(task_out.get("task_id") or "").strip()
    if not task_id:
        raise AsrError("ASR_TASK_CREATE_FAILED", "ASR 任务创建成功但 task_id 为空", json.dumps(task_out, ensure_ascii=False)[:1200])

    poll_interval_seconds = max(1, int(ASR_TASK_POLL_SECONDS))
    poll_count = 0
    started_monotonic = time.monotonic()
    _emit_task_progress(progress_callback, task_id=task_id, task_status="SUBMITTED", elapsed_seconds=0, poll_count=poll_count)

    while True:
        try:
            fetch_resp = _fetch_task(model, task_id)
        except AsrError:
            raise
        except Exception as exc:
            raise AsrError("ASR_TASK_WAIT_FAILED", "轮询 ASR 任务失败", str(exc)[:1200]) from exc

        response_status_code = int(getattr(fetch_resp, "status_code", 200) or 200)
        fetch_out = _to_dict(getattr(fetch_resp, "output", None))
        if response_status_code != 200:
            raise AsrError(
                "ASR_TASK_WAIT_FAILED",
                "轮询 ASR 任务失败",
                json.dumps(
                    {
                        "status_code": response_status_code,
                        "code": getattr(fetch_resp, "code", ""),
                        "message": getattr(fetch_resp, "message", ""),
                        "output": fetch_out,
                    },
                    ensure_ascii=False,
                )[:1200],
            )

        poll_count += 1
        elapsed_seconds = int(max(0, round(time.monotonic() - started_monotonic)))
        task_status = str(fetch_out.get("task_status") or "").strip().upper()
        _emit_task_progress(
            progress_callback,
            task_id=task_id,
            task_status=task_status or "RUNNING",
            elapsed_seconds=elapsed_seconds,
            poll_count=poll_count,
        )
        if task_status == "SUCCEEDED":
            break
        if task_status in {"FAILED", "CANCELED", "CANCELLED"}:
            sub_code = str(fetch_out.get("code") or "").strip()
            sub_msg = str(fetch_out.get("message") or "").strip()
            raise AsrError(
                "ASR_TASK_FAILED",
                "ASR 任务失败",
                json.dumps({"task_status": task_status, "subtask_code": sub_code, "subtask_message": sub_msg}, ensure_ascii=False),
            )
        time.sleep(poll_interval_seconds)

    usage_seconds = _extract_usage_seconds(fetch_out, fetch_resp)
    transcription_url = _extract_transcription_url(fetch_out)
    if not transcription_url:
        raise AsrError("ASR_RESULT_URL_MISSING", "ASR 任务成功但缺少 transcription_url", json.dumps(fetch_out, ensure_ascii=False)[:1200])

    try:
        result_resp = requests.get(transcription_url, timeout=requests_timeout)
    except Exception as exc:
        raise AsrError("ASR_RESULT_DOWNLOAD_FAILED", "下载转写结果失败", str(exc)[:1200]) from exc
    if result_resp.status_code != 200:
        raise AsrError("ASR_RESULT_DOWNLOAD_FAILED", f"下载转写结果失败（HTTP {result_resp.status_code}）", result_resp.text[:800])

    try:
        result_payload = result_resp.json()
    except Exception as exc:
        raise AsrError("ASR_RESULT_JSON_INVALID", "转写结果不是合法 JSON", str(exc)[:1200]) from exc

    preview_text = ""
    transcripts = result_payload.get("transcripts")
    if isinstance(transcripts, list):
        preview_text = " ".join(str(item.get("text") or "").strip() for item in transcripts[:3] if isinstance(item, dict)).strip()
    return {
        "model": model,
        "task_id": task_id,
        "task_status": "SUCCEEDED",
        "usage_seconds": usage_seconds,
        "transcription_url": transcription_url,
        "preview_text": preview_text,
        "asr_result_json": result_payload,
    }


def _transcribe_audio_file_with_faster_whisper(audio_path: str, *, known_duration_ms: int | None = None, progress_callback=None) -> dict[str, Any]:
    try:
        return transcribe_audio_file_with_faster_whisper(audio_path, progress_callback=progress_callback)
    except FasterWhisperModelNotReadyError as exc:
        status_payload = dict(getattr(exc, "status_payload", None) or get_faster_whisper_model_status())
        raise AsrError(
            "ASR_MODEL_NOT_READY",
            str(status_payload.get("message") or "Faster Whisper model is not ready"),
            json.dumps({"status": status_payload}, ensure_ascii=False)[:1200],
        ) from exc
    except AsrError:
        raise
    except Exception as exc:
        raise AsrError("FASTER_WHISPER_TRANSCRIBE_FAILED", "Faster Whisper transcribe failed", str(exc)[:1200]) from exc


def transcribe_audio_file(
    audio_path: str,
    *,
    model: str = DEFAULT_MODEL,
    requests_timeout: int = 120,
    known_duration_ms: int | None = None,
    progress_callback=None,
) -> dict[str, Any]:
    model_name = (model or "").strip()
    if model_name not in SUPPORTED_MODELS:
        raise AsrError("INVALID_MODEL", "不支持的模型", model_name)
    if model_name == FASTER_WHISPER_ASR_MODEL:
        return _transcribe_audio_file_with_faster_whisper(
            audio_path,
            known_duration_ms=known_duration_ms,
            progress_callback=progress_callback,
        )
    return _transcribe_audio_file_with_qwen(audio_path, model=model_name, requests_timeout=requests_timeout, progress_callback=progress_callback)
