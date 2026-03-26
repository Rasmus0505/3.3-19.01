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
from app.services.lesson_task_manager import is_task_terminate_requested, wait_for_task_terminate_request


DEFAULT_MODEL = QWEN_ASR_MODEL
QWEN_DEFAULT_MODEL = QWEN_ASR_MODEL
SUPPORTED_MODELS = set(get_supported_transcribe_asr_model_keys())


def _transcribe_audio_file_with_faster_whisper(
    audio_path: str,
    *,
    known_duration_ms: int | None = None,
    progress_callback=None,
) -> dict[str, Any]:
    from app.services.faster_whisper_asr import transcribe_audio_file_with_faster_whisper

    return transcribe_audio_file_with_faster_whisper(
        audio_path,
        known_duration_ms=known_duration_ms,
        progress_callback=progress_callback,
    )


class AsrError(RuntimeError):
    def __init__(self, code: str, message: str, detail: str = ""):
        super().__init__(message)
        self.code = code
        self.message = message
        self.detail = detail


class AsrCancellationRequested(RuntimeError):
    pass


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


def _raise_if_cancel_requested(*, audio_path: str | None = None) -> None:
    if is_task_terminate_requested(path=audio_path):
        raise AsrCancellationRequested("terminate requested")


def _call_with_optional_request_timeout(func, /, *args, request_timeout: int | None = None, **kwargs):
    if request_timeout is None:
        return func(*args, **kwargs)
    try:
        return func(*args, request_timeout=request_timeout, **kwargs)
    except TypeError as exc:
        if "unexpected keyword argument" not in str(exc):
            raise
        return func(*args, **kwargs)


def _create_task(model: str, signed_url: str, *, request_timeout: int | None = None) -> Any:
    if model == QWEN_DEFAULT_MODEL:
        headers: dict[str, str] = {}
        if str(signed_url or "").strip().startswith("oss://"):
            headers["X-DashScope-OssResourceResolve"] = "enable"
        return _call_with_optional_request_timeout(
            QwenTranscription.async_call,
            model=model,
            file_url=signed_url,
            enable_words=True,
            enable_itn=False,
            headers=headers or None,
            request_timeout=request_timeout,
        )
    raise AsrError("INVALID_MODEL", "不支持的模型", model)


def _fetch_task(model: str, task_id: str, *, request_timeout: int | None = None) -> Any:
    if model == QWEN_DEFAULT_MODEL:
        return _call_with_optional_request_timeout(QwenTranscription.fetch, task=task_id, request_timeout=request_timeout)
    raise AsrError("INVALID_MODEL", "不支持的模型", model)


def _emit_task_progress(
    progress_callback,
    *,
    task_id: str,
    task_status: str,
    elapsed_seconds: int,
    poll_count: int,
    audio_path: str | None = None,
) -> None:
    _raise_if_cancel_requested(audio_path=audio_path)
    if not progress_callback:
        return
    progress_callback(
        {
            "task_id": task_id,
            "task_status": str(task_status or "").strip().upper(),
            "elapsed_seconds": max(0, int(elapsed_seconds or 0)),
            "poll_count": max(0, int(poll_count or 0)),
        }
    )
    _raise_if_cancel_requested(audio_path=audio_path)


def _transcribe_audio_file_with_qwen(
    audio_path: str,
    *,
    model: str,
    requests_timeout: int = 120,
    progress_callback=None,
) -> dict[str, Any]:
    _ensure_dashscope_api_key()
    request_timeout = max(5, int(requests_timeout or 120))
    _raise_if_cancel_requested(audio_path=audio_path)

    try:
        upload_resp = _call_with_optional_request_timeout(
            Files.upload,
            file_path=audio_path,
            purpose="inference",
            request_timeout=request_timeout,
        )
    except Exception as exc:
        raise AsrError("ASR_UPLOAD_FAILED", "上传音频到 DashScope 失败", str(exc)[:1200]) from exc
    _raise_if_cancel_requested(audio_path=audio_path)
    upload_out = _to_dict(getattr(upload_resp, "output", None))

    file_id = _resolve_file_id(upload_out)
    if not file_id:
        raise AsrError("ASR_UPLOAD_FAILED", "上传音频成功但 file_id 为空", json.dumps(upload_out, ensure_ascii=False)[:1200])

    try:
        meta_resp = _call_with_optional_request_timeout(Files.get, file_id=file_id, request_timeout=request_timeout)
    except Exception as exc:
        raise AsrError("ASR_FILE_META_FAILED", "查询 DashScope 文件失败", str(exc)[:1200]) from exc
    _raise_if_cancel_requested(audio_path=audio_path)
    meta_out = _to_dict(getattr(meta_resp, "output", None))

    signed_url = _resolve_signed_url(meta_out)
    if not signed_url:
        raise AsrError("ASR_FILE_META_FAILED", "查询文件成功但签名 URL 为空", json.dumps(meta_out, ensure_ascii=False)[:1200])

    try:
        task_resp = _call_with_optional_request_timeout(
            _create_task,
            model,
            signed_url,
            request_timeout=request_timeout,
        )
    except AsrError:
        raise
    except Exception as exc:
        raise AsrError("ASR_TASK_CREATE_FAILED", "创建 ASR 任务失败", str(exc)[:1200]) from exc
    _raise_if_cancel_requested(audio_path=audio_path)

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
    _emit_task_progress(
        progress_callback,
        task_id=task_id,
        task_status="SUBMITTED",
        elapsed_seconds=0,
        poll_count=poll_count,
        audio_path=audio_path,
    )

    while True:
        _raise_if_cancel_requested(audio_path=audio_path)
        try:
            fetch_resp = _call_with_optional_request_timeout(
                _fetch_task,
                model,
                task_id,
                request_timeout=request_timeout,
            )
        except AsrError:
            raise
        except Exception as exc:
            raise AsrError("ASR_TASK_WAIT_FAILED", "轮询 ASR 任务失败", str(exc)[:1200]) from exc
        _raise_if_cancel_requested(audio_path=audio_path)

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
            audio_path=audio_path,
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
        if wait_for_task_terminate_request(poll_interval_seconds, path=audio_path):
            _raise_if_cancel_requested(audio_path=audio_path)

    usage_seconds = _extract_usage_seconds(fetch_out, fetch_resp)
    transcription_url = _extract_transcription_url(fetch_out)
    if not transcription_url:
        raise AsrError("ASR_RESULT_URL_MISSING", "ASR 任务成功但缺少 transcription_url", json.dumps(fetch_out, ensure_ascii=False)[:1200])

    try:
        result_resp = requests.get(transcription_url, timeout=requests_timeout)
    except Exception as exc:
        raise AsrError("ASR_RESULT_DOWNLOAD_FAILED", "下载转写结果失败", str(exc)[:1200]) from exc
    _raise_if_cancel_requested(audio_path=audio_path)
    if result_resp.status_code != 200:
        raise AsrError("ASR_RESULT_DOWNLOAD_FAILED", f"下载转写结果失败（HTTP {result_resp.status_code}）", result_resp.text[:800])

    try:
        result_payload = result_resp.json()
    except Exception as exc:
        raise AsrError("ASR_RESULT_JSON_INVALID", "转写结果不是合法 JSON", str(exc)[:1200]) from exc
    _raise_if_cancel_requested(audio_path=audio_path)

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
    if model_name == "faster-whisper-medium":
        return _transcribe_audio_file_with_faster_whisper(
            audio_path,
            known_duration_ms=known_duration_ms,
            progress_callback=progress_callback,
        )
    return _transcribe_audio_file_with_qwen(audio_path, model=model_name, requests_timeout=requests_timeout, progress_callback=progress_callback)


def transcribe_signed_url(
    signed_url: str,
    *,
    model: str = DEFAULT_MODEL,
    requests_timeout: int = 120,
    audio_path_for_cancel: str | None = None,
    progress_callback=None,
) -> dict[str, Any]:
    """Transcribe audio directly from a pre-signed URL (skip DashScope file upload).

    This is the counterpart of ``transcribe_audio_file`` for the pre-signed upload flow.
    When the file has already been uploaded to DashScope OSS (e.g. via front-end
    direct upload), this function skips the Files.upload step and uses the provided
    signed URL directly to create the ASR task.

    Args:
        signed_url: Pre-signed URL obtained from dashscope_storage.get_file_signed_url().
        model: ASR model name (must be in SUPPORTED_MODELS).
        requests_timeout: Request timeout in seconds for each API call.
        audio_path_for_cancel: Optional path passed to the cancellation check mechanism.
            When a terminate request arrives for this path the function raises
            AsrCancellationRequested.  Pass None when there is no local file path
            associated with this operation.
        progress_callback: Optional callback invoked with task progress dicts.

    Returns:
        Dict containing the same keys as the result of transcribe_audio_file:
        ``model``, ``task_id``, ``task_status``, ``usage_seconds``,
        ``transcription_url``, ``preview_text``, ``asr_result_json``.

    Raises:
        AsrError: On any ASR pipeline failure.
        AsrCancellationRequested: When a terminate request is detected.
    """
    model_name = (model or "").strip()
    if model_name not in SUPPORTED_MODELS:
        raise AsrError("INVALID_MODEL", "不支持的模型", model_name)

    _ensure_dashscope_api_key()
    request_timeout = max(5, int(requests_timeout or 120))
    _raise_if_cancel_requested(audio_path=audio_path_for_cancel)

    try:
        task_resp = _call_with_optional_request_timeout(
            _create_task,
            model_name,
            signed_url,
            request_timeout=request_timeout,
        )
    except AsrError:
        raise
    except Exception as exc:
        raise AsrError("ASR_TASK_CREATE_FAILED", "创建 ASR 任务失败", str(exc)[:1200]) from exc
    _raise_if_cancel_requested(audio_path=audio_path_for_cancel)

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
    _emit_task_progress(
        progress_callback,
        task_id=task_id,
        task_status="SUBMITTED",
        elapsed_seconds=0,
        poll_count=poll_count,
        audio_path=audio_path_for_cancel,
    )

    while True:
        _raise_if_cancel_requested(audio_path=audio_path_for_cancel)
        try:
            fetch_resp = _call_with_optional_request_timeout(
                _fetch_task,
                model_name,
                task_id,
                request_timeout=request_timeout,
            )
        except AsrError:
            raise
        except Exception as exc:
            raise AsrError("ASR_TASK_WAIT_FAILED", "轮询 ASR 任务失败", str(exc)[:1200]) from exc
        _raise_if_cancel_requested(audio_path=audio_path_for_cancel)

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
            audio_path=audio_path_for_cancel,
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
        if is_task_terminate_requested(poll_interval_seconds, path=audio_path_for_cancel):
            _raise_if_cancel_requested(audio_path=audio_path_for_cancel)

    usage_seconds = _extract_usage_seconds(fetch_out, fetch_resp)
    transcription_url = _extract_transcription_url(fetch_out)
    if not transcription_url:
        raise AsrError("ASR_RESULT_URL_MISSING", "ASR 任务成功但缺少 transcription_url", json.dumps(fetch_out, ensure_ascii=False)[:1200])

    try:
        result_resp = requests.get(transcription_url, timeout=requests_timeout)
    except Exception as exc:
        raise AsrError("ASR_RESULT_DOWNLOAD_FAILED", "下载转写结果失败", str(exc)[:1200]) from exc
    _raise_if_cancel_requested(audio_path=audio_path_for_cancel)
    if result_resp.status_code != 200:
        raise AsrError("ASR_RESULT_DOWNLOAD_FAILED", f"下载转写结果失败（HTTP {result_resp.status_code}）", result_resp.text[:800])

    try:
        result_payload = result_resp.json()
    except Exception as exc:
        raise AsrError("ASR_RESULT_JSON_INVALID", "转写结果不是合法 JSON", str(exc)[:1200]) from exc
    _raise_if_cancel_requested(audio_path=audio_path_for_cancel)

    preview_text = ""
    transcripts = result_payload.get("transcripts")
    if isinstance(transcripts, list):
        preview_text = " ".join(str(item.get("text") or "").strip() for item in transcripts[:3] if isinstance(item, dict)).strip()
    return {
        "model": model_name,
        "task_id": task_id,
        "task_status": "SUCCEEDED",
        "usage_seconds": usage_seconds,
        "transcription_url": transcription_url,
        "preview_text": preview_text,
        "asr_result_json": result_payload,
    }
