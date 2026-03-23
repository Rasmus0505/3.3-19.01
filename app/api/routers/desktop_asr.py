from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import BASE_TMP_DIR
from app.core.errors import error_response, map_media_error
from app.services.asr_dashscope import AsrError, transcribe_audio_file
from app.services.media import MediaError, cleanup_dir, create_request_dir, extract_audio_for_asr, probe_audio_duration_ms, validate_suffix


router = APIRouter(prefix="/api/desktop-asr", tags=["desktop-asr"])


class DesktopAsrTranscribeRequest(BaseModel):
    model_key: str = Field(min_length=1, max_length=100)
    source_path: str = Field(min_length=1, max_length=4096)
    source_filename: str = Field(default="", max_length=255)


def _resolve_local_source_path(raw_path: str) -> Path:
    normalized = str(raw_path or "").strip()
    if not normalized:
        raise MediaError("LOCAL_SOURCE_PATH_MISSING", "本机素材路径缺失", "source_path is empty")
    candidate = Path(normalized).expanduser()
    try:
        resolved = candidate.resolve(strict=True)
    except FileNotFoundError as exc:
        raise MediaError("LOCAL_SOURCE_NOT_FOUND", "本机素材不存在", normalized) from exc
    if not resolved.is_file():
        raise MediaError("LOCAL_SOURCE_NOT_FILE", "本机素材不是文件", str(resolved))
    return resolved


@router.post("/transcribe")
def transcribe_desktop_local_asr(payload: DesktopAsrTranscribeRequest):
    selected_model = str(payload.model_key or "").strip()
    source_path = _resolve_local_source_path(payload.source_path)
    source_filename = str(payload.source_filename or "").strip() or source_path.name

    req_dir = create_request_dir(BASE_TMP_DIR)
    audio_path = req_dir / "desktop_input.opus"
    try:
        validate_suffix(source_filename or source_path.name)
        source_duration_ms = max(1, probe_audio_duration_ms(source_path))
        extract_audio_for_asr(source_path, audio_path)
        asr_result = transcribe_audio_file(str(audio_path), model=selected_model, known_duration_ms=source_duration_ms)
        return {
            "ok": True,
            "model_key": selected_model,
            "runtime_kind": "desktop_local",
            "source_filename": source_filename,
            "source_path": str(source_path),
            "source_duration_ms": source_duration_ms,
            "preview_text": str(asr_result.get("preview_text") or ""),
            "task_status": str(asr_result.get("task_status") or "SUCCEEDED"),
            "usage_seconds": int(asr_result.get("usage_seconds") or 0),
            "asr_result_json": dict(asr_result.get("asr_result_json") or {}),
        }
    except MediaError as exc:
        return map_media_error(exc)
    except AsrError as exc:
        if exc.code == "INVALID_MODEL":
            return error_response(400, exc.code, exc.message, {"input_model": selected_model})
        if exc.code == "ASR_MODEL_NOT_READY":
            return error_response(409, exc.code, exc.message, exc.detail)
        return error_response(502, exc.code, exc.message, exc.detail)
    except Exception as exc:
        return error_response(500, "DESKTOP_LOCAL_ASR_FAILED", "本机 Bottle 1.0 转写失败", str(exc)[:1200])
    finally:
        cleanup_dir(req_dir)
