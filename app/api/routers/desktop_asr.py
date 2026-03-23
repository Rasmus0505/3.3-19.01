from __future__ import annotations

import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.core.config import BASE_TMP_DIR, UPLOAD_MAX_BYTES
from app.core.errors import error_response, map_media_error
from app.db import SessionLocal
from app.services.asr_dashscope import AsrError, transcribe_audio_file
from app.services.lesson_service import LessonService
from app.services.media import (
    MediaError,
    cleanup_dir,
    create_request_dir,
    extract_audio_for_asr,
    probe_audio_duration_ms,
    save_upload_file_stream,
    validate_suffix,
)
from app.services.media_url_import import download_public_media, validate_public_media_url


router = APIRouter(prefix="/api/desktop-asr", tags=["desktop-asr"])

_URL_IMPORT_TASKS: dict[str, dict[str, object]] = {}
_URL_IMPORT_TASKS_LOCK = threading.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _map_url_import_error(exc: MediaError):
    if exc.code in {
        "URL_IMPORT_EMPTY",
        "URL_IMPORT_TOO_LONG",
        "URL_IMPORT_INVALID",
        "URL_IMPORT_PLAYLIST_NOT_SUPPORTED",
        "URL_IMPORT_AUTH_REQUIRED",
        "URL_IMPORT_UNSUPPORTED",
    }:
        return error_response(400, exc.code, exc.message, exc.detail)
    if exc.code == "URL_IMPORT_NOT_FOUND":
        return error_response(404, exc.code, exc.message, exc.detail)
    if exc.code == "URL_IMPORT_DEPENDENCY_MISSING":
        return error_response(503, exc.code, exc.message, exc.detail)
    if exc.code == "URL_IMPORT_TIMEOUT":
        return error_response(504, exc.code, exc.message, exc.detail)
    return error_response(502, exc.code, exc.message, exc.detail)


class DesktopAsrTranscribeRequest(BaseModel):
    model_key: str = Field(min_length=1, max_length=100)
    source_path: str = Field(min_length=1, max_length=4096)
    source_filename: str = Field(default="", max_length=255)


class DesktopAsrGenerateRequest(BaseModel):
    model_key: str = Field(min_length=1, max_length=100)
    source_path: str = Field(min_length=1, max_length=4096)
    source_filename: str = Field(default="", max_length=255)
    runtime_kind: str = Field(default="desktop_local", min_length=1, max_length=64)


class DesktopAsrUrlImportRequest(BaseModel):
    source_url: str = Field(min_length=1, max_length=4096)


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


def _build_url_import_task_snapshot(record: dict[str, object]) -> dict[str, object]:
    return {
        "ok": True,
        "task_id": str(record.get("task_id") or ""),
        "status": str(record.get("status") or "pending"),
        "progress_percent": max(0, min(100, int(record.get("progress_percent") or 0))),
        "status_text": str(record.get("status_text") or ""),
        "source_url": str(record.get("source_url") or ""),
        "source_path": str(record.get("source_path") or ""),
        "source_filename": str(record.get("source_filename") or ""),
        "content_type": str(record.get("content_type") or ""),
        "downloaded_bytes": max(0, int(record.get("downloaded_bytes") or 0)),
        "total_bytes": max(0, int(record.get("total_bytes") or 0)),
        "duration_seconds": max(0, int(record.get("duration_seconds") or 0)),
        "webpage_url": str(record.get("webpage_url") or ""),
        "extractor_key": str(record.get("extractor_key") or ""),
        "error_code": str(record.get("error_code") or ""),
        "error_message": str(record.get("error_message") or ""),
        "created_at": str(record.get("created_at") or ""),
        "updated_at": str(record.get("updated_at") or ""),
    }


def _get_url_import_task_record(task_id: str) -> dict[str, object] | None:
    with _URL_IMPORT_TASKS_LOCK:
        record = _URL_IMPORT_TASKS.get(task_id)
        return dict(record) if record else None


def _update_url_import_task(task_id: str, **patch: object) -> dict[str, object] | None:
    with _URL_IMPORT_TASKS_LOCK:
        current = _URL_IMPORT_TASKS.get(task_id)
        if not current:
            return None
        next_record = {
            **current,
            **patch,
            "updated_at": _now_iso(),
        }
        _URL_IMPORT_TASKS[task_id] = next_record
        return dict(next_record)


def _run_url_import_task(task_id: str, source_url: str, task_dir: Path, cancel_event: threading.Event) -> None:
    try:
        _update_url_import_task(task_id, status="running", status_text="正在解析链接", progress_percent=0)
        result = download_public_media(
            source_url,
            task_dir,
            cancel_event=cancel_event,
            progress_callback=lambda payload: _update_url_import_task(
                task_id,
                status=str(payload.get("status") or "running"),
                progress_percent=max(0, min(100, int(payload.get("progress_percent") or 0))),
                status_text=str(payload.get("status_text") or "正在下载素材"),
                downloaded_bytes=max(0, int(payload.get("downloaded_bytes") or 0)),
                total_bytes=max(0, int(payload.get("total_bytes") or 0)),
                source_filename=str(payload.get("source_filename") or ""),
            ),
        )
        _update_url_import_task(
            task_id,
            status="succeeded",
            progress_percent=100,
            status_text="素材下载完成，可开始生成",
            source_path=str(result.get("source_path") or ""),
            source_filename=str(result.get("source_filename") or ""),
            content_type=str(result.get("content_type") or ""),
            duration_seconds=max(0, int(result.get("duration_seconds") or 0)),
            webpage_url=str(result.get("webpage_url") or ""),
            extractor_key=str(result.get("extractor_key") or ""),
            error_code="",
            error_message="",
        )
    except MediaError as exc:
        cleanup_dir(task_dir)
        next_status = "cancelled" if exc.code == "URL_IMPORT_CANCELLED" else "failed"
        existing_record = _get_url_import_task_record(task_id) or {}
        _update_url_import_task(
            task_id,
            status=next_status,
            progress_percent=0 if next_status == "failed" else int(existing_record.get("progress_percent") or 0),
            status_text=exc.message,
            error_code=exc.code,
            error_message=exc.message,
            source_path="",
            source_filename="",
            content_type="",
            duration_seconds=0,
        )
    except Exception as exc:
        cleanup_dir(task_dir)
        _update_url_import_task(
            task_id,
            status="failed",
            progress_percent=0,
            status_text="下载链接素材失败",
            error_code="URL_IMPORT_TASK_FAILED",
            error_message=str(exc)[:1200],
            source_path="",
            source_filename="",
            content_type="",
            duration_seconds=0,
        )


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


@router.post("/url-import/tasks")
def create_desktop_url_import_task(payload: DesktopAsrUrlImportRequest):
    try:
        source_url = validate_public_media_url(payload.source_url)
    except MediaError as exc:
        return _map_url_import_error(exc)

    task_id = uuid4().hex
    task_dir = create_request_dir(BASE_TMP_DIR)
    cancel_event = threading.Event()
    created_at = _now_iso()
    record = {
        "task_id": task_id,
        "status": "pending",
        "progress_percent": 0,
        "status_text": "等待开始下载",
        "source_url": source_url,
        "source_path": "",
        "source_filename": "",
        "content_type": "",
        "downloaded_bytes": 0,
        "total_bytes": 0,
        "duration_seconds": 0,
        "webpage_url": "",
        "extractor_key": "",
        "error_code": "",
        "error_message": "",
        "created_at": created_at,
        "updated_at": created_at,
        "_task_dir": str(task_dir),
        "_cancel_event": cancel_event,
    }
    with _URL_IMPORT_TASKS_LOCK:
        _URL_IMPORT_TASKS[task_id] = record

    worker = threading.Thread(target=_run_url_import_task, args=(task_id, source_url, task_dir, cancel_event), daemon=True)
    with _URL_IMPORT_TASKS_LOCK:
        _URL_IMPORT_TASKS[task_id]["_worker"] = worker
    worker.start()
    return _build_url_import_task_snapshot(record)


@router.get("/url-import/tasks/{task_id}")
def get_desktop_url_import_task(task_id: str):
    record = _get_url_import_task_record(task_id)
    if not record:
        return error_response(404, "URL_IMPORT_TASK_NOT_FOUND", "链接下载任务不存在", {"task_id": task_id})
    return _build_url_import_task_snapshot(record)


@router.post("/url-import/tasks/{task_id}/cancel")
def cancel_desktop_url_import_task(task_id: str):
    record = _get_url_import_task_record(task_id)
    if not record:
        return error_response(404, "URL_IMPORT_TASK_NOT_FOUND", "链接下载任务不存在", {"task_id": task_id})

    current_status = str(record.get("status") or "")
    if current_status in {"succeeded", "failed", "cancelled"}:
        return _build_url_import_task_snapshot(record)

    cancel_event = record.get("_cancel_event")
    if isinstance(cancel_event, threading.Event):
        cancel_event.set()
    next_record = _update_url_import_task(task_id, status="cancelling", status_text="正在取消下载")
    return _build_url_import_task_snapshot(next_record or record)


@router.get("/url-import/tasks/{task_id}/file")
def read_desktop_url_import_task_file(task_id: str):
    record = _get_url_import_task_record(task_id)
    if not record:
        return error_response(404, "URL_IMPORT_TASK_NOT_FOUND", "链接下载任务不存在", {"task_id": task_id})
    if str(record.get("status") or "") != "succeeded":
        return error_response(
            409,
            "URL_IMPORT_TASK_NOT_READY",
            "链接素材尚未下载完成",
            {"task_id": task_id, "status": str(record.get("status") or "")},
        )

    try:
        source_path = _resolve_local_source_path(str(record.get("source_path") or ""))
    except MediaError as exc:
        return map_media_error(exc)

    return FileResponse(
        source_path,
        media_type=str(record.get("content_type") or "application/octet-stream"),
        filename=str(record.get("source_filename") or source_path.name),
    )
