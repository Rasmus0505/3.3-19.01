from __future__ import annotations

import json
from typing import Any

import dashscope
import requests
from dashscope.audio.qwen_asr import QwenTranscription
from dashscope.files import Files


MODEL_NAME = "qwen3-asr-flash-filetrans"


class AsrError(RuntimeError):
    def __init__(self, code: str, message: str, detail: str = ""):
        super().__init__(message)
        self.code = code
        self.message = message
        self.detail = detail


def setup_dashscope(api_key: str) -> None:
    dashscope.api_key = api_key
    dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"


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


def _build_preview_text(payload: dict[str, Any], max_items: int = 3) -> str:
    texts: list[str] = []
    transcripts = payload.get("transcripts")
    if isinstance(transcripts, list):
        for item in transcripts:
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or "").strip()
            if text:
                texts.append(text)
            if len(texts) >= max_items:
                break
    if not texts:
        sentences = payload.get("sentences")
        if isinstance(sentences, list):
            for item in sentences:
                if not isinstance(item, dict):
                    continue
                text = str(item.get("text") or "").strip()
                if text:
                    texts.append(text)
                if len(texts) >= max_items:
                    break
    return " ".join(texts).strip()


def transcribe_audio_file(audio_wav_path: str, *, requests_timeout: int = 120) -> dict[str, Any]:
    try:
        upload_resp = Files.upload(file_path=audio_wav_path, purpose="inference")
    except Exception as exc:
        raise AsrError("ASR_UPLOAD_FAILED", "上传音频到 DashScope 失败", str(exc)[:1200]) from exc
    upload_out = _to_dict(getattr(upload_resp, "output", None))

    file_id = _resolve_file_id(upload_out)
    if not file_id:
        raise AsrError(
            "ASR_UPLOAD_FAILED",
            "上传音频成功但 file_id 为空",
            json.dumps(upload_out, ensure_ascii=False)[:1200],
        )

    try:
        meta_resp = Files.get(file_id=file_id)
    except Exception as exc:
        raise AsrError("ASR_FILE_META_FAILED", "查询 DashScope 文件失败", str(exc)[:1200]) from exc
    meta_out = _to_dict(getattr(meta_resp, "output", None))

    signed_url = _resolve_signed_url(meta_out)
    if not signed_url:
        raise AsrError(
            "ASR_FILE_META_FAILED",
            "查询文件成功但签名 URL 为空",
            json.dumps(meta_out, ensure_ascii=False)[:1200],
        )

    try:
        task_resp = QwenTranscription.async_call(
            model=MODEL_NAME,
            file_url=signed_url,
            enable_words=True,
            enable_itn=False,
        )
    except Exception as exc:
        raise AsrError("ASR_TASK_CREATE_FAILED", "创建 ASR 任务失败", str(exc)[:1200]) from exc

    task_out = _to_dict(getattr(task_resp, "output", None))
    task_id = str(task_out.get("task_id") or "").strip()
    if not task_id:
        raise AsrError(
            "ASR_TASK_CREATE_FAILED",
            "ASR 任务创建成功但 task_id 为空",
            json.dumps(task_out, ensure_ascii=False)[:1200],
        )

    try:
        wait_resp = QwenTranscription.wait(task=task_id)
    except Exception as exc:
        raise AsrError("ASR_TASK_WAIT_FAILED", "轮询 ASR 任务失败", str(exc)[:1200]) from exc

    wait_out = _to_dict(getattr(wait_resp, "output", None))
    task_status = str(wait_out.get("task_status") or "").strip().upper()
    if task_status != "SUCCEEDED":
        sub_code = str(wait_out.get("code") or "").strip()
        sub_msg = str(wait_out.get("message") or "").strip()
        raise AsrError(
            "ASR_TASK_FAILED",
            "ASR 任务失败",
            json.dumps({"task_status": task_status, "subtask_code": sub_code, "subtask_message": sub_msg}, ensure_ascii=False),
        )

    transcription_url = _extract_transcription_url(wait_out)
    if not transcription_url:
        raise AsrError(
            "ASR_RESULT_URL_MISSING",
            "ASR 任务成功但缺少 transcription_url",
            json.dumps(wait_out, ensure_ascii=False)[:1200],
        )

    try:
        result_resp = requests.get(transcription_url, timeout=requests_timeout)
    except Exception as exc:
        raise AsrError("ASR_RESULT_DOWNLOAD_FAILED", "下载转写结果失败", str(exc)[:1200]) from exc
    if result_resp.status_code != 200:
        raise AsrError(
            "ASR_RESULT_DOWNLOAD_FAILED",
            f"下载转写结果失败（HTTP {result_resp.status_code}）",
            result_resp.text[:800],
        )

    try:
        result_payload = result_resp.json()
    except Exception as exc:
        raise AsrError("ASR_RESULT_JSON_INVALID", "转写结果不是合法 JSON", str(exc)[:1200]) from exc

    preview_text = _build_preview_text(result_payload)
    return {
        "model": MODEL_NAME,
        "task_id": task_id,
        "task_status": task_status,
        "transcription_url": transcription_url,
        "preview_text": preview_text,
        "asr_result_json": result_payload,
    }
