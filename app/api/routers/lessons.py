from __future__ import annotations

import asyncio
import json
import logging
import queue
import threading
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers.lessons.helpers import require_lesson_owner
from app.api.serializers import to_lesson_detail_response, to_lesson_item_response
from app.core.config import BASE_TMP_DIR, REQUEST_TIMEOUT_SECONDS, UPLOAD_MAX_BYTES
from app.core.errors import error_response, map_billing_error, map_media_error
from app.db import SessionLocal, get_db
from app.models import Lesson, User
from app.repositories.lessons import get_lesson_sentences, list_lessons_for_user
from app.schemas import (
    ErrorResponse,
    LessonCatalogResponse,
    LessonCreateResponse,
    LessonBulkDeleteRequest,
    LessonBulkDeleteResponse,
    LessonDeleteResponse,
    LessonDetailResponse,
    LessonItemResponse,
    LessonRenameRequest,
    LessonSubtitleVariantErrorEvent,
    LessonSubtitleVariantProgressEvent,
    LessonSubtitleVariantRequest,
    LessonSubtitleVariantResponse,
    LessonTaskCreateResponse,
    LessonTaskDebugReportResponse,
    LessonTaskControlResponse,
    LessonTaskBatchTerminateResponse,
    LocalAsrLessonTaskCreateRequest,
    LessonTaskResumeResponse,
    LessonTaskResponse,
)
from app.services.asr_model_registry import (
    get_supported_local_browser_asr_model_keys,
    get_supported_local_desktop_asr_model_keys,
    get_supported_upload_asr_model_keys,
)
from app.services.asr_dashscope import AsrError
from app.services.billing_service import BillingError, get_default_asr_model
from app.services.lesson_command_service import (
    LessonTaskAdmissionError,
    create_completed_lesson_from_local_generation,
    create_lesson_task_from_dashscope_file,
    create_lesson_task_from_local_asr,
    bulk_delete_lessons_for_user,
    delete_lesson_for_user,
    invalidate_lesson_related_queries,
    request_lesson_task_control_for_user,
    rename_lesson_for_user,
    resume_lesson_task_for_user,
    terminate_active_lesson_tasks_for_user,
    run_lesson_generation_task as _run_lesson_generation_task,
)
from app.services.lesson_query_service import get_lesson_catalog_payload, get_lesson_detail_payload
from app.services.lesson_service import LessonService
from app.services.lesson_task_manager import (
    LessonTaskStorageNotReadyError,
    build_task_debug_report,
    ensure_lesson_task_storage_ready,
    get_task,
    upsert_lesson_workspace_summary,
)
from app.services.media import MediaError, cleanup_dir, create_request_dir, extract_audio_for_asr, save_upload_file_stream


router = APIRouter(prefix="/api/lessons", tags=["lessons"])
logger = logging.getLogger(__name__)


def _to_lesson_subtitle_variant_response(lesson_id: int, variant: dict) -> LessonSubtitleVariantResponse:
    return LessonSubtitleVariantResponse(
        ok=True,
        lesson_id=lesson_id,
        semantic_split_enabled=bool(variant.get("semantic_split_enabled")),
        split_mode=str(variant.get("split_mode") or ""),
        source_word_count=int(variant.get("source_word_count", 0)),
        strategy_version=int(variant.get("strategy_version", 1)),
        sentences=list(variant.get("sentences") or []),
    )


def _format_sse_event(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _build_task_lesson_response(task: dict, db: Session) -> LessonDetailResponse | None:
    lesson_id = int(task.get("lesson_id") or 0)
    if lesson_id <= 0:
        return None
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        return None
    lesson.subtitle_cache_seed = task.get("subtitle_cache_seed")
    sentences = get_lesson_sentences(db, lesson_id)
    return to_lesson_detail_response(lesson, sentences)


def _to_task_response(task: dict, db: Session) -> LessonTaskResponse:
    status = str(task.get("status") or "").strip().lower()
    result_kind = str(task.get("result_kind") or "").strip().lower()
    completion_kind = "partial" if result_kind == "asr_only" else "full"
    response_message = str(task.get("message") or "")
    if not response_message and status == "succeeded":
        response_message = str(task.get("result_message") or "")
    response_result_kind = result_kind if status == "succeeded" and result_kind in {"full_success", "asr_only"} else ""
    response_result_label = str(task.get("result_label") or "") if status == "succeeded" else ""
    response_result_message = str(task.get("result_message") or "") if status == "succeeded" else ""
    return LessonTaskResponse(
        ok=True,
        task_id=task["task_id"],
        requested_asr_model=str(task.get("requested_asr_model") or ""),
        effective_asr_model=str(task.get("effective_asr_model") or ""),
        model_fallback_applied=bool(task.get("model_fallback_applied")),
        model_fallback_reason=str(task.get("model_fallback_reason") or ""),
        completion_kind=completion_kind,
        result_kind=response_result_kind,
        result_label=response_result_label,
        result_message=response_result_message,
        partial_failure_stage=str(task.get("partial_failure_stage") or ""),
        partial_failure_code=str(task.get("partial_failure_code") or ""),
        partial_failure_message=str(task.get("partial_failure_message") or ""),
        status=task["status"],
        overall_percent=int(task.get("overall_percent", 0)),
        current_text=str(task.get("current_text", "")),
        stages=list(task.get("stages", [])),
        counters=dict(task.get("counters", {})),
        lesson=_build_task_lesson_response(task, db),
        subtitle_cache_seed=task.get("subtitle_cache_seed"),
        translation_debug=task.get("translation_debug"),
        failure_debug=task.get("failure_debug"),
        error_code=str(task.get("error_code", "")),
        message=response_message,
        resume_available=bool(task.get("resume_available")),
        resume_stage=str(task.get("resume_stage") or ""),
        artifact_expires_at=task.get("artifact_expires_at"),
        control_action=str(task.get("control_action") or ""),
        paused_at=task.get("paused_at"),
        terminated_at=task.get("terminated_at"),
        can_pause=bool(task.get("can_pause")),
        can_terminate=bool(task.get("can_terminate")),
    )


@router.post(
    "",
    response_model=LessonCreateResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def create_lesson(
    video_file: UploadFile = File(...),
    asr_model: str = Form(""),
    semantic_split_enabled: bool | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    selected_model = (asr_model or "").strip() or get_default_asr_model(db)
    if selected_model not in set(get_supported_upload_asr_model_keys()):
        return error_response(
            400,
            "INVALID_MODEL",
            "不支持的模型",
            {"supported_models": sorted(get_supported_upload_asr_model_keys()), "input_model": selected_model},
        )

    req_dir = create_request_dir(BASE_TMP_DIR)
    try:
        lesson = await asyncio.wait_for(
            asyncio.to_thread(
                LessonService.generate_from_upload,
                video_file,
                req_dir,
                current_user.id,
                selected_model,
                db,
                None,
                semantic_split_enabled,
            ),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        invalidate_lesson_related_queries(current_user.id)
        sentences = get_lesson_sentences(db, lesson.id)
        return LessonCreateResponse(ok=True, lesson=to_lesson_detail_response(lesson, sentences))
    except asyncio.TimeoutError:
        return error_response(504, "REQUEST_TIMEOUT", "课程生成超时", f"超过 {REQUEST_TIMEOUT_SECONDS} 秒")
    except BillingError as exc:
        return map_billing_error(exc)
    except AsrError as exc:
        return error_response(502, exc.code, exc.message, exc.detail)
    except Exception as exc:
        if isinstance(exc, MediaError):
            return map_media_error(exc)
        db.rollback()
        return error_response(500, "INTERNAL_ERROR", "课程生成失败", str(exc)[:1200])
    finally:
        cleanup_dir(req_dir)
        await video_file.close()


@router.post(
    "/tasks",
    response_model=LessonTaskCreateResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 429: {"model": ErrorResponse}, 500: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
async def create_lesson_task(
    asr_model: str = Form(""),
    semantic_split_enabled: bool | None = Form(None),
    dashscope_file_id: str = Form(...),
    dashscope_file_url: str = Form(""),
    source_filename: str = Form(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    selected_model = (asr_model or "").strip() or get_default_asr_model(db)
    if selected_model not in set(get_supported_upload_asr_model_keys()):
        return error_response(
            400,
            "INVALID_MODEL",
            "不支持的模型",
            {"supported_models": sorted(get_supported_upload_asr_model_keys()), "input_model": selected_model},
        )
    normalized_dashscope_file_id = str(dashscope_file_id or "").strip()
    normalized_dashscope_file_url = str(dashscope_file_url or "").strip()
    normalized_source_filename = str(source_filename or "").strip()
    if not normalized_dashscope_file_id:
        return error_response(400, "DASHSCOPE_FILE_ID_REQUIRED", "缺少 DashScope 文件 ID")
    try:
        payload = create_lesson_task_from_dashscope_file(
            owner_user_id=current_user.id,
            asr_model=selected_model,
            semantic_split_enabled=semantic_split_enabled,
            dashscope_file_id=normalized_dashscope_file_id,
            dashscope_file_url=normalized_dashscope_file_url or None,
            source_filename=normalized_source_filename or None,
            db=db,
        )
        response_payload = LessonTaskCreateResponse(
            ok=True,
            task_id=str(payload["task_id"]),
            requested_asr_model=str(payload.get("requested_asr_model") or ""),
            effective_asr_model=str(payload.get("effective_asr_model") or ""),
            model_fallback_applied=bool(payload.get("model_fallback_applied")),
            model_fallback_reason=str(payload.get("model_fallback_reason") or ""),
        ).model_dump(mode="json")
        admission = dict(payload.get("admission") or {})
        if admission:
            response_payload["admission"] = admission
            response_payload["queued"] = str(admission.get("state") or "") == "queued"
            response_payload["status"] = "pending"
        task_snapshot = get_task(str(payload["task_id"]), db=db)
        if task_snapshot and task_snapshot.get("workspace"):
            response_payload["workspace"] = task_snapshot["workspace"]
        return JSONResponse(status_code=200, content=response_payload)
    except MediaError as exc:
        return map_media_error(exc)
    except LessonTaskStorageNotReadyError as exc:
        return error_response(503, exc.code, exc.message, exc.detail)
    except LessonTaskAdmissionError as exc:
        return error_response(429, exc.code, exc.message, exc.detail)
    except BillingError as exc:
        return map_billing_error(exc)
    except ValueError as exc:
        return error_response(400, "DASHSCOPE_FILE_ID_REQUIRED", "缺少 DashScope 文件 ID", str(exc)[:1200])
    except Exception as exc:
        return error_response(500, "INTERNAL_ERROR", "任务创建失败", str(exc)[:1200])


@router.post(
    "/local-asr/audio-extract",
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 413: {"model": ErrorResponse}, 500: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
async def extract_local_asr_audio(
    background_tasks: BackgroundTasks,
    video_file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    req_dir = create_request_dir(BASE_TMP_DIR)
    source_suffix = Path(video_file.filename or "").suffix or ".bin"
    source_path = req_dir / f"source{source_suffix}"
    output_path = req_dir / "local_asr_audio.opus"
    try:
        save_upload_file_stream(video_file, source_path, max_bytes=UPLOAD_MAX_BYTES)
        logger.info("[DEBUG] lesson.local_asr.extract_audio start source=%s", video_file.filename or "unknown")
        extract_audio_for_asr(source_path, output_path)
        await video_file.close()
        background_tasks.add_task(cleanup_dir, req_dir)
        return FileResponse(path=str(output_path), media_type="audio/ogg", filename=output_path.name)
    except MediaError as exc:
        cleanup_dir(req_dir)
        await video_file.close()
        return map_media_error(exc)
    except Exception as exc:
        cleanup_dir(req_dir)
        await video_file.close()
        return error_response(500, "INTERNAL_ERROR", "本地音轨提取失败", str(exc)[:1200])


@router.post(
    "/tasks/local-asr",
    response_model=LessonTaskCreateResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 429: {"model": ErrorResponse}, 500: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def create_local_asr_lesson_task(
    payload: LocalAsrLessonTaskCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    selected_model = str(payload.asr_model or "").strip()
    supported_local_models = set(get_supported_local_browser_asr_model_keys()) | set(get_supported_local_desktop_asr_model_keys())
    if selected_model not in supported_local_models:
        return error_response(
            400,
            "INVALID_LOCAL_ASR_MODEL",
            "不支持的本地模型",
            {"supported_models": sorted(supported_local_models), "input_model": selected_model},
        )
    try:
        task_payload = create_lesson_task_from_local_asr(
            source_filename=str(payload.source_filename or "").strip(),
            source_duration_ms=int(payload.source_duration_ms or 0),
            runtime_kind=str(payload.runtime_kind or "").strip() or "local_browser",
            asr_payload=dict(payload.asr_payload or {}),
            owner_user_id=current_user.id,
            asr_model=selected_model,
            semantic_split_enabled=False,
            db=db,
        )
        response_payload = LessonTaskCreateResponse(
            ok=True,
            task_id=str(task_payload["task_id"]),
            requested_asr_model=str(task_payload.get("requested_asr_model") or ""),
            effective_asr_model=str(task_payload.get("effective_asr_model") or ""),
            model_fallback_applied=bool(task_payload.get("model_fallback_applied")),
            model_fallback_reason=str(task_payload.get("model_fallback_reason") or ""),
        ).model_dump(mode="json")
        admission = dict(task_payload.get("admission") or {})
        if admission:
            response_payload["admission"] = admission
            response_payload["queued"] = str(admission.get("state") or "") == "queued"
            response_payload["status"] = "pending"
        task_snapshot = get_task(str(task_payload["task_id"]), db=db)
        if task_snapshot and task_snapshot.get("workspace"):
            response_payload["workspace"] = task_snapshot["workspace"]
        return JSONResponse(status_code=200, content=response_payload)
    except LessonTaskStorageNotReadyError as exc:
        return error_response(503, exc.code, exc.message, exc.detail)
    except LessonTaskAdmissionError as exc:
        return error_response(429, exc.code, exc.message, exc.detail)
    except BillingError as exc:
        return map_billing_error(exc)
    except Exception as exc:
        return error_response(500, "INTERNAL_ERROR", "本地 ASR 任务创建失败", str(exc)[:1200])


@router.post(
    "/local-asr/complete",
    response_model=LessonCreateResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def create_local_generated_lesson(
    payload: LocalAsrLessonTaskCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    selected_model = str(payload.asr_model or "").strip()
    supported_local_models = set(get_supported_local_browser_asr_model_keys()) | set(get_supported_local_desktop_asr_model_keys())
    if selected_model not in supported_local_models:
        return error_response(
            400,
            "INVALID_LOCAL_ASR_MODEL",
            "不支持的本地模型",
            {"supported_models": sorted(supported_local_models), "input_model": selected_model},
        )
    try:
        lesson = create_completed_lesson_from_local_generation(
            source_filename=str(payload.source_filename or "").strip(),
            source_duration_ms=int(payload.source_duration_ms or 0),
            runtime_kind=str(payload.runtime_kind or "").strip() or "local_browser",
            asr_payload=dict(payload.asr_payload or {}),
            owner_user_id=current_user.id,
            asr_model=selected_model,
            db=db,
        )
        sentences = get_lesson_sentences(db, lesson.id)
        response_payload = LessonCreateResponse(ok=True, lesson=to_lesson_detail_response(lesson, sentences)).model_dump(mode="json")
        response_payload.update(
            {
                "completion_kind": "partial" if str(getattr(lesson, "task_result_kind", "") or "") == "asr_only" else "full",
                "result_kind": str(getattr(lesson, "task_result_kind", "") or ""),
                "result_message": str(getattr(lesson, "task_result_message", "") or ""),
                "partial_failure_stage": str(getattr(lesson, "task_partial_failure_stage", "") or ""),
                "partial_failure_code": str(getattr(lesson, "task_partial_failure_code", "") or ""),
                "partial_failure_message": str(getattr(lesson, "task_partial_failure_message", "") or ""),
                "subtitle_cache_seed": getattr(lesson, "subtitle_cache_seed", None),
                "translation_debug": getattr(lesson, "translation_debug", None),
                "runtime_kind": str((getattr(lesson, "subtitle_cache_seed", {}) or {}).get("runtime_kind") or payload.runtime_kind or ""),
            }
        )
        response_payload["workspace"] = getattr(lesson, "workspace_summary", None) or upsert_lesson_workspace_summary(
            owner_user_id=current_user.id,
            lesson_id=int(lesson.id),
            source_filename=str(payload.source_filename or ""),
            source_duration_ms=int(payload.source_duration_ms or 0),
            runtime_kind=str(payload.runtime_kind or ""),
            subtitle_cache_seed=getattr(lesson, "subtitle_cache_seed", None),
            translation_debug=getattr(lesson, "translation_debug", None),
        )
        return JSONResponse(status_code=200, content=response_payload)
    except BillingError as exc:
        return map_billing_error(exc)
    except MediaError as exc:
        return map_media_error(exc)
    except Exception as exc:
        return error_response(500, "INTERNAL_ERROR", "本地生成课程保存失败", str(exc)[:1200])


@router.get(
    "/tasks/{task_id}",
    response_model=LessonTaskResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def get_lesson_task(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        ensure_lesson_task_storage_ready(db)
    except LessonTaskStorageNotReadyError as exc:
        return error_response(503, exc.code, exc.message, exc.detail)
    task = get_task(task_id, db=db)
    if not task or int(task.get("owner_user_id", 0)) != current_user.id:
        return error_response(404, "TASK_NOT_FOUND", "任务不存在")
    response_payload = _to_task_response(task, db).model_dump(mode="json")
    admission = _build_task_admission_detail(task)
    if admission:
        response_payload["admission"] = admission
    if task.get("workspace"):
        response_payload["workspace"] = task["workspace"]
    return JSONResponse(status_code=200, content=response_payload)


@router.get(
    "/tasks/{task_id}/debug-report",
    response_model=LessonTaskDebugReportResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def get_lesson_task_debug_report(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        ensure_lesson_task_storage_ready(db)
    except LessonTaskStorageNotReadyError as exc:
        return error_response(503, exc.code, exc.message, exc.detail)
    task = get_task(task_id, db=db)
    if not task or int(task.get("owner_user_id", 0)) != current_user.id:
        return error_response(404, "TASK_NOT_FOUND", "任务不存在")
    result_kind = str(task.get("result_kind") or "full_success").strip().lower()
    completion_kind = "partial" if result_kind == "asr_only" else "full"
    return LessonTaskDebugReportResponse(
        ok=True,
        task_id=task_id,
        completion_kind=completion_kind,
        report_text=build_task_debug_report(task),
    )


def _build_task_admission_detail(task: dict | None) -> dict[str, object] | None:
    artifacts = dict((task or {}).get("artifacts") or {})
    state = str(artifacts.get("admission_state") or "").strip().lower()
    if state not in {"admitted", "queued"}:
        return None
    return {
        "state": state,
        "active_task_count": int(artifacts.get("active_task_count") or 0),
        "queued_task_count": int(artifacts.get("queued_task_count") or 0),
        "max_active_tasks": int(artifacts.get("max_active_tasks") or 0),
        "max_queued_tasks": int(artifacts.get("max_queued_tasks") or 0),
        "queue_position": int(artifacts.get("queue_position") or 0),
    }


@router.post(
    "/tasks/terminate-active",
    response_model=LessonTaskBatchTerminateResponse,
    responses={401: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def terminate_active_lesson_tasks(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        payload = terminate_active_lesson_tasks_for_user(user_id=current_user.id, db=db)
    except LessonTaskStorageNotReadyError as exc:
        return error_response(503, exc.code, exc.message, exc.detail)
    return LessonTaskBatchTerminateResponse(
        ok=True,
        requested_task_ids=[str(item) for item in payload.get("requested_task_ids") or []],
        requested_count=int(payload.get("requested_count") or 0),
    )


@router.post(
    "/tasks/{task_id}/resume",
    response_model=LessonTaskResumeResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 429: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def resume_lesson_task(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        payload = resume_lesson_task_for_user(task_id=task_id, user_id=current_user.id, db=db)
    except LessonTaskStorageNotReadyError as exc:
        return error_response(503, exc.code, exc.message, exc.detail)
    except LessonTaskAdmissionError as exc:
        return error_response(429, exc.code, exc.message, exc.detail)
    if payload is None:
        return error_response(404, "TASK_NOT_FOUND", "任务不存在")
    if payload.get("resumed") is None:
        return error_response(400, "TASK_RESUME_UNAVAILABLE", "当前任务不可继续生成")
    if payload.get("artifact_missing"):
        return error_response(400, "TASK_ARTIFACT_MISSING", "素材已过期，请重新上传素材")
    response_payload = LessonTaskResumeResponse(ok=True, task_id=task_id).model_dump(mode="json")
    admission = dict(payload.get("admission") or {})
    if admission:
        response_payload["admission"] = admission
        response_payload["queued"] = str(admission.get("state") or "") == "queued"
        response_payload["status"] = "pending"
    return JSONResponse(status_code=200, content=response_payload)


@router.post(
    "/tasks/{task_id}/pause",
    response_model=LessonTaskControlResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def pause_lesson_task(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        payload = request_lesson_task_control_for_user(task_id=task_id, user_id=current_user.id, action="pause", db=db)
    except LessonTaskStorageNotReadyError as exc:
        return error_response(503, exc.code, exc.message, exc.detail)
    if payload is None:
        return error_response(404, "TASK_NOT_FOUND", "任务不存在")
    requested = payload.get("requested")
    if requested is None:
        return error_response(400, "TASK_PAUSE_UNAVAILABLE", "当前任务不可暂停")
    return LessonTaskControlResponse(ok=True, task_id=task_id, status=str(requested.get("status") or "pausing"))


@router.post(
    "/tasks/{task_id}/terminate",
    response_model=LessonTaskControlResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def terminate_lesson_task(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        payload = request_lesson_task_control_for_user(task_id=task_id, user_id=current_user.id, action="terminate", db=db)
    except LessonTaskStorageNotReadyError as exc:
        return error_response(503, exc.code, exc.message, exc.detail)
    if payload is None:
        return error_response(404, "TASK_NOT_FOUND", "任务不存在")
    requested = payload.get("requested")
    if requested is None:
        return error_response(400, "TASK_TERMINATE_UNAVAILABLE", "当前任务不可终止")
    return LessonTaskControlResponse(ok=True, task_id=task_id, status=str(requested.get("status") or "terminating"))


@router.get("/catalog", response_model=LessonCatalogResponse, responses={401: {"model": ErrorResponse}})
def list_lesson_catalog(
    page: int = 1,
    page_size: int = 20,
    q: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = get_lesson_catalog_payload(db, user_id=current_user.id, page=page, page_size=page_size, query=q)
    return LessonCatalogResponse(ok=True, **payload)


@router.get("", response_model=list[LessonItemResponse], responses={401: {"model": ErrorResponse}})
def list_lessons(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lessons = list_lessons_for_user(db, current_user.id)
    return [to_lesson_item_response(item) for item in lessons]


@router.get("/{lesson_id}", response_model=LessonDetailResponse, responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}})
def get_lesson(lesson_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    payload = get_lesson_detail_payload(db, lesson_id=lesson_id, user_id=current_user.id)
    if payload is None:
        return error_response(404, "LESSON_NOT_FOUND", "课程不存在")
    return payload


@router.post(
    "/{lesson_id}/subtitle-variants",
    response_model=LessonSubtitleVariantResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def regenerate_lesson_subtitle_variant(
    lesson_id: int,
    payload: LessonSubtitleVariantRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lesson = require_lesson_owner(db, lesson_id, current_user.id)
    try:
        variant = LessonService.build_subtitle_variant(
            asr_payload=payload.asr_payload,
            db=db,
            semantic_split_enabled=payload.semantic_split_enabled,
        )
        logger.info(
            "[DEBUG] lessons.subtitle_variant.success lesson_id=%s user_id=%s semantic_split_enabled=%s split_mode=%s",
            lesson.id,
            current_user.id,
            bool(variant.get("semantic_split_enabled")),
            str(variant.get("split_mode") or ""),
        )
        return _to_lesson_subtitle_variant_response(lesson.id, variant)
    except MediaError as exc:
        return map_media_error(exc)
    except Exception as exc:
        return error_response(500, "INTERNAL_ERROR", "重新生成字幕失败", str(exc)[:1200])


@router.post(
    "/{lesson_id}/subtitle-variants/stream",
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def regenerate_lesson_subtitle_variant_stream(
    lesson_id: int,
    payload: LessonSubtitleVariantRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lesson = require_lesson_owner(db, lesson_id, current_user.id)
    bind = db.get_bind()
    event_queue: queue.Queue[tuple[str, dict] | None] = queue.Queue()

    def _worker() -> None:
        worker_db = Session(bind=bind, future=True)
        try:
            def _progress(progress_payload: dict) -> None:
                event = LessonSubtitleVariantProgressEvent(
                    stage=str(progress_payload.get("stage") or ""),
                    message=str(progress_payload.get("message") or ""),
                    translate_done=int(progress_payload.get("translate_done", 0) or 0),
                    translate_total=int(progress_payload.get("translate_total", 0) or 0),
                    semantic_split_enabled=bool(progress_payload.get("semantic_split_enabled")),
                )
                event_queue.put(("progress", event.model_dump()))

            variant = LessonService.build_subtitle_variant(
                asr_payload=payload.asr_payload,
                db=worker_db,
                semantic_split_enabled=payload.semantic_split_enabled,
                progress_callback=_progress,
            )
            logger.info(
                "[DEBUG] lessons.subtitle_variant.stream.success lesson_id=%s user_id=%s semantic_split_enabled=%s split_mode=%s",
                lesson.id,
                current_user.id,
                bool(variant.get("semantic_split_enabled")),
                str(variant.get("split_mode") or ""),
            )
            event_queue.put(("result", _to_lesson_subtitle_variant_response(lesson.id, variant).model_dump()))
        except MediaError as exc:
            event = LessonSubtitleVariantErrorEvent(error_code=exc.code, message=exc.message, detail=exc.detail or "")
            event_queue.put(("error", event.model_dump()))
        except Exception as exc:
            logger.exception("[DEBUG] lessons.subtitle_variant.stream.failed lesson_id=%s detail=%s", lesson.id, str(exc)[:400])
            event = LessonSubtitleVariantErrorEvent(error_code="INTERNAL_ERROR", message="重新生成字幕失败", detail=str(exc)[:1200])
            event_queue.put(("error", event.model_dump()))
        finally:
            worker_db.close()
            event_queue.put(None)

    def _stream():
        while True:
            item = event_queue.get()
            if item is None:
                break
            event_name, event_payload = item
            yield _format_sse_event(event_name, event_payload)

    threading.Thread(target=_worker, daemon=True).start()
    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.patch(
    "/{lesson_id}",
    response_model=LessonItemResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def rename_lesson(
    lesson_id: int,
    payload: LessonRenameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    title = str(payload.title or "").strip()
    if not title:
        return error_response(400, "INVALID_TITLE", "课程标题不能为空")
    if len(title) > 255:
        return error_response(400, "INVALID_TITLE", "课程标题长度不能超过 255")

    logger.info("[DEBUG] lessons.rename.request lesson_id=%s user_id=%s", lesson_id, current_user.id)
    require_lesson_owner(db, lesson_id, current_user.id)
    lesson = rename_lesson_for_user(db=db, lesson_id=lesson_id, user_id=current_user.id, title=title)
    if not lesson:
        return error_response(404, "LESSON_NOT_FOUND", "课程不存在")
    return to_lesson_item_response(lesson)


@router.delete(
    "/{lesson_id}",
    response_model=LessonDeleteResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def delete_lesson(
    lesson_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lesson = require_lesson_owner(db, lesson_id, current_user.id)
    try:
        logger.info("[DEBUG] lessons.delete.request lesson_id=%s user_id=%s", lesson_id, current_user.id)
        delete_lesson_for_user(db=db, lesson=lesson)
    except Exception as exc:
        logger.exception("lessons.delete.failed lesson_id=%s user_id=%s", lesson_id, current_user.id)
        db.rollback()
        return error_response(500, "INTERNAL_ERROR", "删除课程失败", str(exc)[:1200])

    logger.info("[DEBUG] lessons.delete.success lesson_id=%s user_id=%s", lesson_id, current_user.id)
    return LessonDeleteResponse(ok=True, lesson_id=lesson_id)


@router.post(
    "/bulk-delete",
    response_model=LessonBulkDeleteResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def bulk_delete_lessons(
    payload: LessonBulkDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    normalized_ids = sorted({int(item) for item in list(payload.lesson_ids or []) if int(item) > 0})
    delete_all = bool(payload.delete_all)
    if not delete_all and not normalized_ids:
        return error_response(400, "EMPTY_DELETE_SELECTION", "请先选择要删除的历史记录")

    try:
        logger.info(
            "[DEBUG] lessons.bulk_delete.request user_id=%s delete_all=%s count=%s",
            current_user.id,
            delete_all,
            len(normalized_ids),
        )
        result = bulk_delete_lessons_for_user(
            db=db,
            user_id=current_user.id,
            lesson_ids=normalized_ids,
            delete_all=delete_all,
        )
    except Exception as exc:
        logger.exception("lessons.bulk_delete.failed user_id=%s", current_user.id)
        db.rollback()
        return error_response(500, "INTERNAL_ERROR", "批量删除历史失败", str(exc)[:1200])

    deleted_ids = [int(item) for item in list(result.get("deleted_ids") or [])]
    failed_ids = [int(item) for item in list(result.get("failed_ids") or [])]
    logger.info(
        "[DEBUG] lessons.bulk_delete.success user_id=%s deleted_count=%s failed_count=%s",
        current_user.id,
        len(deleted_ids),
        len(failed_ids),
    )
    return LessonBulkDeleteResponse(
        ok=True,
        deleted_ids=deleted_ids,
        deleted_count=int(result.get("deleted_count") or len(deleted_ids)),
        failed_ids=failed_ids,
    )
