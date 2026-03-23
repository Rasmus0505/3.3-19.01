from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel, Field

from app.core.config import BASE_TMP_DIR, UPLOAD_MAX_BYTES
from app.db import SessionLocal
from app.core.errors import error_response, map_media_error
from app.services.asr_dashscope import AsrError, transcribe_audio_file
from app.services.media import MediaError, cleanup_dir, create_request_dir, extract_audio_for_asr, probe_audio_duration_ms, validate_suffix
from app.services.lesson_service import LessonService


router = APIRouter(prefix="/api/desktop-asr", tags=["desktop-asr"])


class DesktopAsrTranscribeRequest(BaseModel):
    model_key: str = Field(min_length=1, max_length=100)
    source_path: str = Field(min_length=1, max_length=4096)
    source_filename: str = Field(default="", max_length=255)


class DesktopAsrGenerateRequest(BaseModel):
    model_key: str = Field(min_length=1, max_length=100)
    source_path: str = Field(min_length=1, max_length=4096)
    source_filename: str = Field(default="", max_length=255)
    runtime_kind: str = Field(default="desktop_local", min_length=1, max_length=64)


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


def _build_local_generation_response(*, source_path: Path, source_filename: str, selected_model: str, runtime_kind: str) -> dict[str, object]:
    req_dir = create_request_dir(BASE_TMP_DIR)
    audio_path = req_dir / "desktop_input.opus"
    try:
        validate_suffix(source_filename or source_path.name)
        source_duration_ms = max(1, probe_audio_duration_ms(source_path))
        extract_audio_for_asr(source_path, audio_path)
        asr_result = transcribe_audio_file(str(audio_path), model=selected_model, known_duration_ms=source_duration_ms)
        asr_payload = dict(asr_result.get("asr_result_json") or {})
        with SessionLocal() as db:
            local_generation_result = LessonService.build_local_generation_result(
                asr_payload=asr_payload,
                runtime_kind=runtime_kind,
                asr_model=selected_model,
                source_duration_ms=source_duration_ms,
                db=db,
                semantic_split_enabled=False,
            )
        return {
            "ok": True,
            "model_key": selected_model,
            "runtime_kind": str(local_generation_result.get("runtime_kind") or runtime_kind or "desktop_local"),
            "source_filename": source_filename,
            "source_path": str(source_path),
            "source_duration_ms": source_duration_ms,
            "preview_text": str(asr_result.get("preview_text") or ""),
            "task_status": str(asr_result.get("task_status") or "SUCCEEDED"),
            "usage_seconds": int(asr_result.get("usage_seconds") or 0),
            "asr_result_json": asr_payload,
            "local_generation_result": local_generation_result,
        }
    finally:
        cleanup_dir(req_dir)


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


@router.post("/generate")
def generate_desktop_local_lesson(payload: DesktopAsrGenerateRequest):
    selected_model = str(payload.model_key or "").strip()
    source_path = _resolve_local_source_path(payload.source_path)
    source_filename = str(payload.source_filename or "").strip() or source_path.name
    runtime_kind = str(payload.runtime_kind or "desktop_local").strip() or "desktop_local"
    try:
        return _build_local_generation_response(
            source_path=source_path,
            source_filename=source_filename,
            selected_model=selected_model,
            runtime_kind=runtime_kind,
        )
    except MediaError as exc:
        return map_media_error(exc)
    except AsrError as exc:
        if exc.code == "INVALID_MODEL":
            return error_response(400, exc.code, exc.message, {"input_model": selected_model})
        if exc.code == "ASR_MODEL_NOT_READY":
            return error_response(409, exc.code, exc.message, exc.detail)
        return error_response(502, exc.code, exc.message, exc.detail)
    except Exception as exc:
        return error_response(500, "DESKTOP_LOCAL_GENERATE_FAILED", "本机 Bottle 1.0 生成失败", str(exc)[:1200])


@router.post("/generate-upload")
async def generate_browser_local_lesson(
    video_file: UploadFile = File(...),
    model_key: str = Form(...),
    runtime_kind: str = Form("browser_local"),
):
    req_dir = create_request_dir(BASE_TMP_DIR)
    source_suffix = Path(video_file.filename or "").suffix or ".bin"
    source_path = req_dir / f"source{source_suffix}"
    try:
        save_upload_file_stream(video_file, source_path, max_bytes=UPLOAD_MAX_BYTES)
        source_filename = str(video_file.filename or "").strip() or source_path.name
        return _build_local_generation_response(
            source_path=source_path,
            source_filename=source_filename,
            selected_model=str(model_key or "").strip(),
            runtime_kind=str(runtime_kind or "browser_local").strip() or "browser_local",
        )
    except MediaError as exc:
        return map_media_error(exc)
    except AsrError as exc:
        if exc.code == "INVALID_MODEL":
            return error_response(400, exc.code, exc.message, {"input_model": str(model_key or "").strip()})
        if exc.code == "ASR_MODEL_NOT_READY":
            return error_response(409, exc.code, exc.message, exc.detail)
        return error_response(502, exc.code, exc.message, exc.detail)
    except Exception as exc:
        return error_response(500, "BROWSER_LOCAL_GENERATE_FAILED", "本地网站 Bottle 1.0 生成失败", str(exc)[:1200])
    finally:
        cleanup_dir(req_dir)
        await video_file.close()
