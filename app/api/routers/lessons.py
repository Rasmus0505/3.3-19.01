from __future__ import annotations

import asyncio
import logging
import shutil
import threading

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers._helpers import require_lesson_owner
from app.api.serializers import to_lesson_detail_response, to_lesson_item_response
from app.core.config import BASE_DATA_DIR, BASE_TMP_DIR, LESSON_DEFAULT_ASR_MODEL, REQUEST_TIMEOUT_SECONDS, UPLOAD_MAX_BYTES
from app.core.errors import error_response, map_billing_error, map_media_error
from app.db import SessionLocal, get_db
from app.models import User, WalletLedger
from app.repositories.lessons import get_lesson_sentences, list_lessons_for_user, update_lesson_title_for_user
from app.schemas import (
    ErrorResponse,
    LessonCreateResponse,
    LessonDeleteResponse,
    LessonDetailResponse,
    LessonItemResponse,
    LessonRenameRequest,
    LessonTaskCreateResponse,
    LessonTaskResponse,
)
from app.services.asr_dashscope import AsrError, SUPPORTED_MODELS
from app.services.billing_service import BillingError
from app.services.lesson_service import LessonService
from app.services.lesson_task_manager import create_task, get_task, mark_task_failed, mark_task_succeeded, update_task_progress
from app.services.media import MediaError, cleanup_dir, create_request_dir, save_upload_file_stream, validate_suffix


router = APIRouter(prefix="/api/lessons", tags=["lessons"])
logger = logging.getLogger(__name__)


def _to_task_response(task: dict) -> LessonTaskResponse:
    return LessonTaskResponse(
        ok=True,
        task_id=task["task_id"],
        status=task["status"],
        overall_percent=int(task.get("overall_percent", 0)),
        current_text=str(task.get("current_text", "")),
        stages=list(task.get("stages", [])),
        counters=dict(task.get("counters", {})),
        lesson=task.get("lesson"),
        error_code=str(task.get("error_code", "")),
        message=str(task.get("message", "")),
    )


def _run_lesson_generation_task(
    *,
    task_id: str,
    owner_id: int,
    source_filename: str,
    source_path,
    req_dir,
    asr_model: str,
) -> None:
    db = SessionLocal()
    try:
        logger.info("[DEBUG] lessons.task.start task_id=%s owner_id=%s model=%s", task_id, owner_id, asr_model)

        def _progress(payload: dict) -> None:
            update_task_progress(
                task_id,
                stage_key=payload.get("stage_key"),
                stage_status=payload.get("stage_status"),
                overall_percent=payload.get("overall_percent"),
                current_text=payload.get("current_text"),
                counters=payload.get("counters"),
            )

        lesson = LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename=source_filename,
            req_dir=req_dir,
            owner_id=owner_id,
            asr_model=asr_model,
            db=db,
            progress_callback=_progress,
        )
        sentences = get_lesson_sentences(db, lesson.id)
        lesson_payload = to_lesson_detail_response(lesson, sentences).model_dump()
        mark_task_succeeded(task_id, lesson_payload=lesson_payload)
        logger.info("[DEBUG] lessons.task.succeeded task_id=%s lesson_id=%s", task_id, lesson.id)
    except BillingError as exc:
        db.rollback()
        mark_task_failed(task_id, error_code=exc.code, message=exc.message)
        logger.warning("[DEBUG] lessons.task.billing_failed task_id=%s code=%s", task_id, exc.code)
    except AsrError as exc:
        db.rollback()
        mark_task_failed(task_id, error_code=exc.code, message=exc.message)
        logger.warning("[DEBUG] lessons.task.asr_failed task_id=%s code=%s", task_id, exc.code)
    except MediaError as exc:
        db.rollback()
        mark_task_failed(task_id, error_code=exc.code, message=exc.message)
        logger.warning("[DEBUG] lessons.task.media_failed task_id=%s code=%s", task_id, exc.code)
    except Exception as exc:
        db.rollback()
        mark_task_failed(task_id, error_code="INTERNAL_ERROR", message="课程生成失败")
        logger.exception("[DEBUG] lessons.task.failed task_id=%s detail=%s", task_id, str(exc)[:400])
    finally:
        db.close()
        cleanup_dir(req_dir)


@router.post(
    "",
    response_model=LessonCreateResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def create_lesson(
    video_file: UploadFile = File(...),
    asr_model: str = Form(LESSON_DEFAULT_ASR_MODEL),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    selected_model = (asr_model or "").strip() or LESSON_DEFAULT_ASR_MODEL
    if selected_model not in SUPPORTED_MODELS:
        return error_response(400, "INVALID_MODEL", "不支持的模型", {"supported_models": sorted(SUPPORTED_MODELS), "input_model": selected_model})

    req_dir = create_request_dir(BASE_TMP_DIR)
    try:
        lesson = await asyncio.wait_for(
            asyncio.to_thread(LessonService.generate_from_upload, video_file, req_dir, current_user.id, selected_model, db),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
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
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def create_lesson_task(
    video_file: UploadFile = File(...),
    asr_model: str = Form(LESSON_DEFAULT_ASR_MODEL),
    current_user: User = Depends(get_current_user),
):
    selected_model = (asr_model or "").strip() or LESSON_DEFAULT_ASR_MODEL
    if selected_model not in SUPPORTED_MODELS:
        return error_response(400, "INVALID_MODEL", "不支持的模型", {"supported_models": sorted(SUPPORTED_MODELS), "input_model": selected_model})

    req_dir = create_request_dir(BASE_TMP_DIR)
    try:
        source_filename = (video_file.filename or "unknown")[:255]
        suffix = validate_suffix(source_filename)
        source_path = req_dir / f"source{suffix}"
        save_upload_file_stream(video_file, source_path, max_bytes=UPLOAD_MAX_BYTES)

        task_id = create_task(current_user.id, source_filename)
        thread = threading.Thread(
            target=_run_lesson_generation_task,
            kwargs={
                "task_id": task_id,
                "owner_id": current_user.id,
                "source_filename": source_filename,
                "source_path": source_path,
                "req_dir": req_dir,
                "asr_model": selected_model,
            },
            daemon=True,
        )
        thread.start()
        return LessonTaskCreateResponse(ok=True, task_id=task_id)
    except MediaError as exc:
        cleanup_dir(req_dir)
        return map_media_error(exc)
    except Exception as exc:
        cleanup_dir(req_dir)
        return error_response(500, "INTERNAL_ERROR", "任务创建失败", str(exc)[:1200])
    finally:
        await video_file.close()


@router.get(
    "/tasks/{task_id}",
    response_model=LessonTaskResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_lesson_task(task_id: str, current_user: User = Depends(get_current_user)):
    task = get_task(task_id)
    if not task or int(task.get("owner_user_id", 0)) != current_user.id:
        return error_response(404, "TASK_NOT_FOUND", "任务不存在")
    return _to_task_response(task)


@router.get("", response_model=list[LessonItemResponse], responses={401: {"model": ErrorResponse}})
def list_lessons(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lessons = list_lessons_for_user(db, current_user.id)
    return [to_lesson_item_response(item) for item in lessons]


@router.get("/{lesson_id}", response_model=LessonDetailResponse, responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}})
def get_lesson(lesson_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lesson = require_lesson_owner(db, lesson_id, current_user.id)
    sentences = get_lesson_sentences(db, lesson.id)
    return to_lesson_detail_response(lesson, sentences)


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
    lesson = update_lesson_title_for_user(db, lesson_id, current_user.id, title)
    if not lesson:
        return error_response(404, "LESSON_NOT_FOUND", "课程不存在")

    db.commit()
    db.refresh(lesson)
    logger.info("[DEBUG] lessons.rename.success lesson_id=%s user_id=%s", lesson_id, current_user.id)
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
    lesson_dir = BASE_DATA_DIR / f"lesson_{lesson_id}"

    try:
        logger.info("[DEBUG] lessons.delete.request lesson_id=%s user_id=%s", lesson_id, current_user.id)
        db.execute(update(WalletLedger).where(WalletLedger.lesson_id == lesson.id).values(lesson_id=None))
        db.delete(lesson)
        db.commit()
    except Exception as exc:
        logger.exception("lessons.delete.failed lesson_id=%s user_id=%s", lesson_id, current_user.id)
        db.rollback()
        return error_response(500, "INTERNAL_ERROR", "删除课程失败", str(exc)[:1200])

    if lesson_dir.exists():
        try:
            shutil.rmtree(lesson_dir)
        except Exception as exc:
            logger.warning("lesson_delete.cleanup_failed lesson_id=%s dir=%s error=%s", lesson_id, lesson_dir, exc)

    logger.info("[DEBUG] lessons.delete.success lesson_id=%s user_id=%s", lesson_id, current_user.id)
    return LessonDeleteResponse(ok=True, lesson_id=lesson_id)
