from __future__ import annotations

import json
import logging
import shutil
import threading
import traceback
from pathlib import Path

from sqlalchemy import update
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import BASE_DATA_DIR, BASE_TMP_DIR, UPLOAD_MAX_BYTES
from app.models import Lesson, WalletLedger
from app.repositories.admin_console import invalidate_admin_overview_cache, invalidate_admin_user_activity_summary_cache
from app.repositories.lessons import update_lesson_title_for_user
from app.services.asr_dashscope import AsrError
from app.services.billing_service import BillingError, ensure_default_billing_rates, get_default_asr_model
from app.services.lesson_query_service import invalidate_lesson_catalog_cache
from app.services.lesson_service import LessonService
from app.services.lesson_task_manager import (
    LessonTaskStorageNotReadyError,
    build_task_id,
    create_task,
    ensure_lesson_task_storage_ready,
    get_task,
    mark_task_failed,
    mark_task_succeeded,
    patch_task_artifacts,
    reset_failed_task_for_restart,
    reset_task_for_resume,
    update_task_progress,
)
from app.services.media import MediaError, cleanup_dir, save_upload_file_stream, validate_suffix


logger = logging.getLogger(__name__)


def build_lesson_task_session_factory(bind) -> sessionmaker[Session]:
    return sessionmaker(autocommit=False, autoflush=False, bind=bind, class_=Session, future=True)


def invalidate_lesson_related_queries(user_id: int) -> None:
    invalidate_lesson_catalog_cache(user_id)
    invalidate_admin_overview_cache()
    invalidate_admin_user_activity_summary_cache(user_id)


def run_lesson_generation_task(
    *,
    task_id: str,
    owner_id: int,
    source_filename: str,
    source_path,
    req_dir,
    asr_model: str,
    semantic_split_enabled: bool | None,
    session_factory: sessionmaker[Session],
    input_mode: str = "upload",
    source_duration_ms: int | None = None,
) -> None:
    db = session_factory()
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
                asr_raw=payload.get("asr_raw"),
                session_factory=session_factory,
            )

        normalized_input_mode = str(input_mode or "upload").strip().lower()
        if normalized_input_mode == "local_asr":
            local_payload = json.loads(Path(source_path).read_text(encoding="utf-8"))
            lesson = LessonService.generate_from_local_asr_payload(
                asr_payload=dict(local_payload.get("asr_payload") or {}),
                source_filename=source_filename,
                source_duration_ms=int(local_payload.get("source_duration_ms") or source_duration_ms or 0),
                req_dir=req_dir,
                owner_id=owner_id,
                asr_model=asr_model,
                task_id=task_id,
                semantic_split_enabled=semantic_split_enabled,
                db=db,
                progress_callback=_progress,
            )
        else:
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
        invalidate_lesson_related_queries(owner_id)
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
    except LessonTaskStorageNotReadyError as exc:
        db.rollback()
        logger.exception("[DEBUG] lessons.task.storage_not_ready task_id=%s detail=%s", task_id, exc.detail)
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


def create_lesson_task_from_upload(
    *,
    video_file,
    owner_user_id: int,
    asr_model: str,
    semantic_split_enabled: bool | None,
    db: Session,
) -> dict[str, object]:
    task_id = build_task_id()
    req_dir = BASE_TMP_DIR / task_id
    req_dir.mkdir(parents=True, exist_ok=True)
    task_session_factory = build_lesson_task_session_factory(db.get_bind())
    try:
        ensure_default_billing_rates(db)
        ensure_lesson_task_storage_ready(db)
        source_filename = (video_file.filename or "unknown")[:255]
        suffix = validate_suffix(source_filename)
        source_path = req_dir / f"source{suffix}"
        save_upload_file_stream(video_file, source_path, max_bytes=UPLOAD_MAX_BYTES)

        create_task(
            task_id=task_id,
            owner_user_id=owner_user_id,
            source_filename=source_filename,
            asr_model=asr_model,
            semantic_split_enabled=semantic_split_enabled,
            work_dir=str(req_dir),
            source_path=str(source_path),
            db=db,
        )
        thread = threading.Thread(
            target=run_lesson_generation_task,
            kwargs={
                "task_id": task_id,
                "owner_id": owner_user_id,
                "source_filename": source_filename,
                "source_path": source_path,
                "req_dir": req_dir,
                "asr_model": asr_model,
                "semantic_split_enabled": semantic_split_enabled,
                "session_factory": task_session_factory,
                "input_mode": "upload",
            },
            daemon=True,
        )
        thread.start()
        logger.info("[DEBUG] lessons.task.create.started task_id=%s user_id=%s", task_id, owner_user_id)
        return {"task_id": task_id}
    except Exception:
        cleanup_dir(req_dir)
        raise


def create_lesson_task_from_local_asr(
    *,
    source_filename: str,
    source_duration_ms: int,
    asr_payload: dict,
    owner_user_id: int,
    asr_model: str,
    semantic_split_enabled: bool | None,
    db: Session,
) -> dict[str, object]:
    task_id = build_task_id()
    req_dir = BASE_TMP_DIR / task_id
    req_dir.mkdir(parents=True, exist_ok=True)
    task_session_factory = build_lesson_task_session_factory(db.get_bind())
    try:
        ensure_default_billing_rates(db)
        ensure_lesson_task_storage_ready(db)
        payload_path = req_dir / "local_asr_payload.json"
        payload_path.write_text(
            json.dumps(
                {
                    "asr_payload": dict(asr_payload or {}),
                    "source_duration_ms": int(source_duration_ms or 0),
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        create_task(
            task_id=task_id,
            owner_user_id=owner_user_id,
            source_filename=(source_filename or "local_asr.json")[:255],
            asr_model=asr_model,
            semantic_split_enabled=semantic_split_enabled,
            work_dir=str(req_dir),
            source_path=str(payload_path),
            db=db,
        )
        patch_task_artifacts(
            task_id,
            artifacts_patch={
                "input_mode": "local_asr",
                "source_duration_ms": int(source_duration_ms or 0),
                "local_asr_payload_path": str(payload_path),
            },
            db=db,
        )
        thread = threading.Thread(
            target=run_lesson_generation_task,
            kwargs={
                "task_id": task_id,
                "owner_id": owner_user_id,
                "source_filename": (source_filename or "local_asr.json")[:255],
                "source_path": payload_path,
                "req_dir": req_dir,
                "asr_model": asr_model,
                "semantic_split_enabled": semantic_split_enabled,
                "session_factory": task_session_factory,
                "input_mode": "local_asr",
                "source_duration_ms": int(source_duration_ms or 0),
            },
            daemon=True,
        )
        thread.start()
        logger.info("[DEBUG] lessons.task.local_asr.started task_id=%s user_id=%s", task_id, owner_user_id)
        return {"task_id": task_id}
    except Exception:
        cleanup_dir(req_dir)
        raise


def resume_lesson_task_for_user(*, task_id: str, user_id: int, db: Session) -> dict[str, object] | None:
    ensure_lesson_task_storage_ready(db)
    task = get_task(task_id, db=db)
    if not task or int(task.get("owner_user_id", 0)) != user_id:
        return None

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
            user_id,
            task_status,
            bool(task.get("resume_available")),
        )
        return {"task": task, "resumed": None, "retry_mode": retry_mode}

    artifacts = dict(resumed.get("artifacts") or {})
    req_dir = Path(str(artifacts.get("work_dir") or "").strip())
    source_path = Path(str(artifacts.get("source_path") or resumed.get("source_path") or "").strip())
    logger.info(
        "[DEBUG] lessons.task.retry.prepare task_id=%s user_id=%s mode=%s req_dir_exists=%s source_exists=%s",
        task_id,
        user_id,
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
            user_id,
            retry_mode or "unknown",
            req_dir,
            source_path,
        )
        return {
            "task": task,
            "resumed": resumed,
            "retry_mode": retry_mode,
            "artifact_missing": True,
        }

    task_session_factory = build_lesson_task_session_factory(db.get_bind())
    input_mode = str(artifacts.get("input_mode") or "upload").strip().lower() or "upload"
    thread = threading.Thread(
        target=run_lesson_generation_task,
        kwargs={
            "task_id": task_id,
            "owner_id": user_id,
            "source_filename": str(resumed.get("source_filename") or source_path.name),
            "source_path": source_path,
            "req_dir": req_dir,
            "asr_model": str(resumed.get("asr_model") or get_default_asr_model(db)),
            "semantic_split_enabled": bool(resumed.get("semantic_split_enabled")),
            "session_factory": task_session_factory,
            "input_mode": input_mode,
            "source_duration_ms": int(artifacts.get("source_duration_ms") or 0),
        },
        daemon=True,
    )
    thread.start()
    logger.info("[DEBUG] lessons.task.retry.started task_id=%s user_id=%s mode=%s", task_id, user_id, retry_mode or "unknown")
    return {"task": task, "resumed": resumed, "retry_mode": retry_mode, "task_id": task_id}


def rename_lesson_for_user(*, db: Session, lesson_id: int, user_id: int, title: str):
    lesson = update_lesson_title_for_user(db, lesson_id, user_id, title)
    if not lesson:
        return None
    db.commit()
    db.refresh(lesson)
    invalidate_lesson_catalog_cache(user_id)
    logger.info("[DEBUG] lessons.rename.success lesson_id=%s user_id=%s", lesson_id, user_id)
    return lesson


def delete_lesson_for_user(*, db: Session, lesson: Lesson) -> None:
    lesson_dir = BASE_DATA_DIR / f"lesson_{lesson.id}"
    db.execute(update(WalletLedger).where(WalletLedger.lesson_id == lesson.id).values(lesson_id=None))
    db.delete(lesson)
    db.commit()
    invalidate_lesson_related_queries(int(lesson.user_id))
    if lesson_dir.exists():
        try:
            shutil.rmtree(lesson_dir)
        except Exception as exc:
            logger.warning("[DEBUG] lesson_delete.cleanup_failed lesson_id=%s dir=%s error=%s", lesson.id, lesson_dir, exc)
