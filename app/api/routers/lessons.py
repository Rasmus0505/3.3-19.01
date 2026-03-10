from __future__ import annotations

import asyncio
import json
import logging
import queue
import shutil
import threading
import traceback
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import update
from sqlalchemy.orm import Session, sessionmaker

from app.api.deps.auth import get_current_user
from app.api.routers._helpers import require_lesson_owner
from app.api.serializers import to_lesson_detail_response, to_lesson_item_response
from app.core.config import BASE_DATA_DIR, BASE_TMP_DIR, LESSON_DEFAULT_ASR_MODEL, REQUEST_TIMEOUT_SECONDS, UPLOAD_MAX_BYTES
from app.core.errors import error_response, map_billing_error, map_media_error
from app.db import SessionLocal, get_db
from app.models import Lesson, User, WalletLedger
from app.repositories.lessons import get_lesson_sentences, list_lessons_for_user, update_lesson_title_for_user
from app.schemas import (
    ErrorResponse,
    LessonCreateResponse,
    LessonDeleteResponse,
    LessonDetailResponse,
    LessonItemResponse,
    LessonRenameRequest,
    LessonSubtitleVariantErrorEvent,
    LessonSubtitleVariantProgressEvent,
    LessonSubtitleVariantRequest,
    LessonSubtitleVariantResponse,
    LessonTaskCreateResponse,
    LessonTaskResumeResponse,
    LessonTaskResponse,
)
from app.services.asr_dashscope import AsrError, SUPPORTED_MODELS
from app.services.billing_service import BillingError
from app.services.lesson_service import LessonService
from app.services.lesson_task_manager import (
    build_task_id,
    create_task,
    get_task,
    mark_task_failed,
    mark_task_succeeded,
    reset_failed_task_for_restart,
    reset_task_for_resume,
    update_task_progress,
)
from app.services.media import MediaError, cleanup_dir, create_request_dir, save_upload_file_stream, validate_suffix


router = APIRouter(prefix="/api/lessons", tags=["lessons"])
logger = logging.getLogger(__name__)


def _build_session_factory(bind) -> sessionmaker[Session]:
    return sessionmaker(autocommit=False, autoflush=False, bind=bind, class_=Session, future=True)


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
    return LessonTaskResponse(
        ok=True,
        task_id=task["task_id"],
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
        message=str(task.get("message", "")),
        resume_available=bool(task.get("resume_available")),
        resume_stage=str(task.get("resume_stage") or ""),
        artifact_expires_at=task.get("artifact_expires_at"),
    )


def _run_lesson_generation_task(
    *,
    task_id: str,
    owner_id: int,
    source_filename: str,
    source_path,
    req_dir,
    asr_model: str,
    semantic_split_enabled: bool | None = None,
    session_factory: sessionmaker[Session] | None = None,
) -> None:
    db = session_factory() if session_factory else SessionLocal()
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
                translation_debug=payload.get("translation_debug"),
                session_factory=session_factory,
            )

        lesson = LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename=source_filename,
            req_dir=req_dir,
            owner_id=owner_id,
            asr_model=asr_model,
            task_id=task_id,
            semantic_split_enabled=semantic_split_enabled,
            db=db,
            progress_callback=_progress,
        )
        mark_task_succeeded(
            task_id,
            lesson_id=lesson.id,
            subtitle_cache_seed=getattr(lesson, "subtitle_cache_seed", None),
            session_factory=session_factory,
        )
        logger.info("[DEBUG] lessons.task.succeeded task_id=%s lesson_id=%s", task_id, lesson.id)
    except BillingError as exc:
        db.rollback()
        mark_task_failed(
            task_id,
            error_code=exc.code,
            message=exc.message,
            exception_type=exc.__class__.__name__,
            detail_excerpt=str(getattr(exc, "detail", "") or exc.message or exc),
            traceback_excerpt=traceback.format_exc(),
            session_factory=session_factory,
        )
        logger.warning("[DEBUG] lessons.task.billing_failed task_id=%s code=%s", task_id, exc.code)
    except AsrError as exc:
        db.rollback()
        mark_task_failed(
            task_id,
            error_code=exc.code,
            message=exc.message,
            exception_type=exc.__class__.__name__,
            detail_excerpt=str(getattr(exc, "detail", "") or exc.message or exc),
            traceback_excerpt=traceback.format_exc(),
            session_factory=session_factory,
        )
        logger.warning("[DEBUG] lessons.task.asr_failed task_id=%s code=%s", task_id, exc.code)
    except MediaError as exc:
        db.rollback()
        mark_task_failed(
            task_id,
            error_code=exc.code,
            message=exc.message,
            exception_type=exc.__class__.__name__,
            detail_excerpt=str(getattr(exc, "detail", "") or exc.message or exc),
            traceback_excerpt=traceback.format_exc(),
            session_factory=session_factory,
        )
        logger.warning("[DEBUG] lessons.task.media_failed task_id=%s code=%s", task_id, exc.code)
    except Exception as exc:
        db.rollback()
        mark_task_failed(
            task_id,
            error_code="INTERNAL_ERROR",
            message="课程生成失败",
            exception_type=exc.__class__.__name__,
            detail_excerpt=str(exc)[:1200],
            traceback_excerpt=traceback.format_exc(),
            session_factory=session_factory,
        )
        logger.exception("[DEBUG] lessons.task.failed task_id=%s detail=%s", task_id, str(exc)[:400])
    finally:
        db.close()


@router.post(
    "",
    response_model=LessonCreateResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def create_lesson(
    video_file: UploadFile = File(...),
    asr_model: str = Form(LESSON_DEFAULT_ASR_MODEL),
    semantic_split_enabled: bool | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    selected_model = (asr_model or "").strip() or LESSON_DEFAULT_ASR_MODEL
    if selected_model not in SUPPORTED_MODELS:
        return error_response(400, "INVALID_MODEL", "不支持的模型", {"supported_models": sorted(SUPPORTED_MODELS), "input_model": selected_model})

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
    semantic_split_enabled: bool | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    selected_model = (asr_model or "").strip() or LESSON_DEFAULT_ASR_MODEL
    if selected_model not in SUPPORTED_MODELS:
        return error_response(400, "INVALID_MODEL", "不支持的模型", {"supported_models": sorted(SUPPORTED_MODELS), "input_model": selected_model})

    task_id = build_task_id()
    req_dir = BASE_TMP_DIR / task_id
    req_dir.mkdir(parents=True, exist_ok=True)
    task_session_factory = _build_session_factory(db.get_bind())
    try:
        source_filename = (video_file.filename or "unknown")[:255]
        suffix = validate_suffix(source_filename)
        source_path = req_dir / f"source{suffix}"
        save_upload_file_stream(video_file, source_path, max_bytes=UPLOAD_MAX_BYTES)

        create_task(
            task_id=task_id,
            owner_user_id=current_user.id,
            source_filename=source_filename,
            asr_model=selected_model,
            semantic_split_enabled=semantic_split_enabled,
            work_dir=str(req_dir),
            source_path=str(source_path),
            db=db,
        )
        thread = threading.Thread(
            target=_run_lesson_generation_task,
            kwargs={
                "task_id": task_id,
                "owner_id": current_user.id,
                "source_filename": source_filename,
                "source_path": source_path,
                "req_dir": req_dir,
                "asr_model": selected_model,
                "semantic_split_enabled": semantic_split_enabled,
                "session_factory": task_session_factory,
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
def get_lesson_task(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = get_task(task_id, db=db)
    if not task or int(task.get("owner_user_id", 0)) != current_user.id:
        return error_response(404, "TASK_NOT_FOUND", "任务不存在")
    return _to_task_response(task, db)


@router.post(
    "/tasks/{task_id}/resume",
    response_model=LessonTaskResumeResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def resume_lesson_task(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = get_task(task_id, db=db)
    if not task or int(task.get("owner_user_id", 0)) != current_user.id:
        return error_response(404, "TASK_NOT_FOUND", "任务不存在")

    task_status = str(task.get("status") or "").strip().lower()
    retry_mode = ""
    resumed = None
    if bool(task.get("resume_available")):
        resumed = reset_task_for_resume(task_id, db=db)
        retry_mode = "resume"

    if not resumed and task_status == "failed":
        resumed = reset_failed_task_for_restart(task_id, db=db)
        retry_mode = "restart"

    if not resumed:
        logger.info(
            "[DEBUG] lessons.task.retry.unavailable task_id=%s user_id=%s status=%s resume_available=%s",
            task_id,
            current_user.id,
            task_status,
            bool(task.get("resume_available")),
        )
        return error_response(400, "TASK_RESUME_UNAVAILABLE", "当前任务不可继续生成")

    artifacts = dict(resumed.get("artifacts") or {})
    req_dir = Path(str(artifacts.get("work_dir") or "").strip())
    source_path = Path(str(artifacts.get("source_path") or resumed.get("source_path") or "").strip())
    logger.info(
        "[DEBUG] lessons.task.retry.prepare task_id=%s user_id=%s mode=%s req_dir_exists=%s source_exists=%s",
        task_id,
        current_user.id,
        retry_mode or "unknown",
        req_dir.exists(),
        source_path.exists(),
    )
    if not req_dir.exists() or not source_path.exists():
        mark_task_failed(
            task_id,
            error_code="TASK_ARTIFACT_MISSING",
            message="素材已过期，请重新上传素材",
            exception_type="FileNotFoundError",
            detail_excerpt=f"resume artifacts missing work_dir={req_dir} source_path={source_path}",
            traceback_excerpt="",
            failed_stage=str(resumed.get("resume_stage") or ""),
            resume_available=False,
            db=db,
        )
        logger.warning(
            "[DEBUG] lessons.task.retry.artifact_missing task_id=%s user_id=%s mode=%s work_dir=%s source_path=%s",
            task_id,
            current_user.id,
            retry_mode or "unknown",
            req_dir,
            source_path,
        )
        return error_response(400, "TASK_ARTIFACT_MISSING", "素材已过期，请重新上传素材")

    task_session_factory = _build_session_factory(db.get_bind())
    thread = threading.Thread(
        target=_run_lesson_generation_task,
        kwargs={
            "task_id": task_id,
            "owner_id": current_user.id,
            "source_filename": str(resumed.get("source_filename") or source_path.name),
            "source_path": source_path,
            "req_dir": req_dir,
            "asr_model": str(resumed.get("asr_model") or LESSON_DEFAULT_ASR_MODEL),
            "semantic_split_enabled": bool(resumed.get("semantic_split_enabled")),
            "session_factory": task_session_factory,
        },
        daemon=True,
    )
    thread.start()
    logger.info(
        "[DEBUG] lessons.task.retry.started task_id=%s user_id=%s mode=%s",
        task_id,
        current_user.id,
        retry_mode or "unknown",
    )
    return LessonTaskResumeResponse(ok=True, task_id=task_id)


@router.get("", response_model=list[LessonItemResponse], responses={401: {"model": ErrorResponse}})
def list_lessons(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lessons = list_lessons_for_user(db, current_user.id)
    return [to_lesson_item_response(item) for item in lessons]


@router.get("/{lesson_id}", response_model=LessonDetailResponse, responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}})
def get_lesson(lesson_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lesson = require_lesson_owner(db, lesson_id, current_user.id)
    sentences = get_lesson_sentences(db, lesson.id)
    return to_lesson_detail_response(lesson, sentences)


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
