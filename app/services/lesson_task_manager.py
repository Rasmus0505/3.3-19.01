from __future__ import annotations

import logging
from datetime import timedelta
from pathlib import Path
from typing import Callable
from uuid import uuid4

from sqlalchemy import func, inspect, select, update
from sqlalchemy.orm import Session

from app.core.timezone import now_shanghai_naive
from app.db import APP_SCHEMA, SessionLocal
from app.models import LessonGenerationTask, TranslationRequestLog
from app.services.media import cleanup_dir


FAILURE_RETENTION_HOURS = 24
FAILURE_EXCEPTION_TYPE_LIMIT = 120
FAILURE_DETAIL_EXCERPT_LIMIT = 2000
FAILURE_TRACEBACK_EXCERPT_LIMIT = 4000

_STAGE_LABELS: tuple[tuple[str, str], ...] = (
    ("convert_audio", "转换音频格式"),
    ("asr_transcribe", "ASR转写字幕"),
    ("translate_zh", "翻译中文"),
    ("write_lesson", "写入课程"),
)

logger = logging.getLogger(__name__)
LESSON_TASK_REQUIRED_COLUMNS: tuple[str, ...] = tuple(str(column.name) for column in LessonGenerationTask.__table__.columns)


class LessonTaskStorageNotReadyError(Exception):
    code = "DB_MIGRATION_REQUIRED"
    message = "数据库迁移未完成，请先执行 Alembic upgrade head"

    def __init__(self, detail: str):
        self.detail = str(detail or "")
        super().__init__(self.detail or self.message)


def ensure_lesson_task_storage_ready(db: Session) -> None:
    bind = db.get_bind()
    table_name = LessonGenerationTask.__tablename__
    if bind is None:
        detail = "missing database bind for lesson task storage guard"
        logger.warning("[DEBUG] lesson_task_storage.not_ready reason=missing_bind detail=%s", detail)
        raise LessonTaskStorageNotReadyError(detail)

    schema = None if bind.dialect.name == "sqlite" else APP_SCHEMA
    qualified_table = f"{schema}.{table_name}" if schema else table_name
    inspector = inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        detail = f"missing business table: {qualified_table}"
        logger.warning("[DEBUG] lesson_task_storage.not_ready reason=missing_table detail=%s", detail)
        raise LessonTaskStorageNotReadyError(detail)

    existing_columns = {
        str(item.get("name") or "").strip()
        for item in inspector.get_columns(table_name, schema=schema)
    }
    missing_columns = [name for name in LESSON_TASK_REQUIRED_COLUMNS if name not in existing_columns]
    if missing_columns:
        detail = "missing critical columns: " + ", ".join(f"{table_name}.{name}" for name in missing_columns)
        logger.warning("[DEBUG] lesson_task_storage.not_ready reason=missing_columns detail=%s", detail)
        raise LessonTaskStorageNotReadyError(detail)


def _empty_stages() -> list[dict]:
    return [{"key": key, "label": label, "status": "pending"} for key, label in _STAGE_LABELS]


def _empty_counters() -> dict:
    return {
        "asr_done": 0,
        "asr_estimated": 0,
        "translate_done": 0,
        "translate_total": 0,
        "segment_done": 0,
        "segment_total": 0,
    }


def _default_artifacts(work_dir: str, source_path: str) -> dict:
    base = Path(work_dir)
    return {
        "work_dir": work_dir,
        "source_path": source_path,
        "opus_path": str(base / "lesson_input.opus"),
        "asr_result_path": str(base / "asr_result.json"),
        "variant_result_path": str(base / "variant_result.json"),
        "translation_checkpoint_path": str(base / "translation_checkpoint.json"),
        "segment_results_dir": str(base / "asr_segment_results"),
        "lesson_result_path": str(base / "lesson_result.json"),
    }


def _copy_dict(value: dict | None) -> dict:
    return dict(value or {})


def _copy_list(value: list | None) -> list:
    return [dict(item) if isinstance(item, dict) else item for item in list(value or [])]


def _trim_text(value: str | None, limit: int) -> str:
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)] + "…"


def _find_stage(stages: list[dict], stage_key: str) -> dict | None:
    for item in stages:
        if item.get("key") == stage_key:
            return item
    return None


def _infer_resume_stage(stages: list[dict]) -> str:
    for item in stages:
        if str(item.get("status") or "") != "completed":
            return str(item.get("key") or "")
    return ""


SessionFactory = Callable[[], Session]


def _session_scope(
    *,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> tuple[Session, bool]:
    if db is not None:
        return db, False
    factory = session_factory or SessionLocal
    return factory(), True


def _task_to_dict(task: LessonGenerationTask) -> dict:
    failure_debug = _copy_dict(task.failure_debug_json) if isinstance(task.failure_debug_json, dict) else None
    if failure_debug is not None and task.failed_at is not None and not failure_debug.get("failed_at"):
        failure_debug["failed_at"] = task.failed_at
    asr_raw = _copy_dict(task.asr_raw_json) if isinstance(task.asr_raw_json, dict) else None
    return {
        "task_id": task.task_id,
        "owner_user_id": int(task.owner_user_id),
        "lesson_id": int(task.lesson_id) if task.lesson_id else None,
        "source_filename": task.source_filename,
        "asr_model": task.asr_model,
        "semantic_split_enabled": bool(task.semantic_split_enabled),
        "status": task.status,
        "overall_percent": int(task.overall_percent or 0),
        "current_text": str(task.current_text or ""),
        "stages": _copy_list(task.stages_json),
        "counters": _copy_dict(task.counters_json),
        "translation_debug": _copy_dict(task.translation_debug_json) if isinstance(task.translation_debug_json, dict) else None,
        "failure_debug": failure_debug,
        "asr_raw": asr_raw,
        "has_raw_debug": bool(asr_raw),
        "subtitle_cache_seed": _copy_dict(task.subtitle_cache_seed_json) if isinstance(task.subtitle_cache_seed_json, dict) else None,
        "error_code": str(task.error_code or ""),
        "message": str(task.message or ""),
        "resume_available": bool(task.resume_available),
        "resume_stage": str(task.resume_stage or ""),
        "artifacts": _copy_dict(task.artifacts_json),
        "artifact_expires_at": task.artifact_expires_at,
        "failed_at": task.failed_at,
        "raw_debug_purged_at": task.raw_debug_purged_at,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }


def build_task_id() -> str:
    return f"lesson_task_{uuid4().hex}"


def cleanup_expired_tasks(*, db: Session | None = None, session_factory: SessionFactory | None = None) -> None:
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        now = now_shanghai_naive()
        items = session.scalars(
            select(LessonGenerationTask).where(
                LessonGenerationTask.artifact_expires_at.is_not(None),
                LessonGenerationTask.artifact_expires_at <= now,
            )
        ).all()
        changed = False
        for task in items:
            work_dir = str(task.work_dir or "").strip()
            if work_dir:
                cleanup_dir(Path(work_dir))
            artifacts = _copy_dict(task.artifacts_json)
            artifacts["cleanup_completed_at"] = now.isoformat()
            task.artifacts_json = artifacts
            task.resume_available = False
            task.artifact_expires_at = None
            changed = True
        if changed:
            session.commit()
    finally:
        if owns_session:
            session.close()


def create_task(
    *,
    task_id: str,
    owner_user_id: int,
    source_filename: str,
    asr_model: str,
    semantic_split_enabled: bool | None,
    work_dir: str,
    source_path: str,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> str:
    cleanup_expired_tasks(db=db, session_factory=session_factory)
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = LessonGenerationTask(
            task_id=task_id,
            owner_user_id=int(owner_user_id),
            source_filename=source_filename,
            asr_model=asr_model,
            semantic_split_enabled=bool(semantic_split_enabled),
            status="pending",
            overall_percent=0,
            current_text="等待处理",
            stages_json=_empty_stages(),
            counters_json=_empty_counters(),
            work_dir=work_dir,
            source_path=source_path,
            artifacts_json=_default_artifacts(work_dir, source_path),
            failure_debug_json=None,
            asr_raw_json=None,
            resume_available=False,
            resume_stage="convert_audio",
            failed_at=None,
            raw_debug_purged_at=None,
        )
        session.add(task)
        session.commit()
        return task_id
    finally:
        if owns_session:
            session.close()


def get_task(task_id: str, *, db: Session | None = None, session_factory: SessionFactory | None = None) -> dict | None:
    cleanup_expired_tasks(db=db, session_factory=session_factory)
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        return _task_to_dict(task) if task else None
    finally:
        if owns_session:
            session.close()


def update_task_progress(
    task_id: str,
    *,
    stage_key: str | None = None,
    stage_status: str | None = None,
    overall_percent: int | None = None,
    current_text: str | None = None,
    counters: dict | None = None,
    translation_debug: dict | None = None,
    asr_raw: dict | None = None,
    artifacts_patch: dict | None = None,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> None:
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return
        if task.status in {"pending", "failed"}:
            task.status = "running"
        stages = _copy_list(task.stages_json)
        if stage_key:
            stage = _find_stage(stages, stage_key)
            if stage:
                stage["status"] = stage_status or stage.get("status") or "pending"
            task.resume_stage = stage_key
        task.stages_json = stages
        if isinstance(overall_percent, int):
            task.overall_percent = max(0, min(100, overall_percent))
        if current_text is not None:
            task.current_text = str(current_text)
        if counters:
            merged = _copy_dict(task.counters_json)
            merged.update(counters)
            task.counters_json = merged
        if translation_debug is not None:
            task.translation_debug_json = dict(translation_debug)
        if asr_raw is not None:
            task.asr_raw_json = dict(asr_raw)
            task.raw_debug_purged_at = None
        if artifacts_patch:
            merged_artifacts = _copy_dict(task.artifacts_json)
            merged_artifacts.update(artifacts_patch)
            task.artifacts_json = merged_artifacts
        task.failure_debug_json = None
        task.failed_at = None
        task.error_code = ""
        task.message = ""
        task.resume_available = False
        task.artifact_expires_at = None
        session.commit()
    finally:
        if owns_session:
            session.close()


def patch_task_artifacts(
    task_id: str,
    artifacts_patch: dict,
    *,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> None:
    if not artifacts_patch:
        return
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return
        merged_artifacts = _copy_dict(task.artifacts_json)
        merged_artifacts.update(artifacts_patch)
        task.artifacts_json = merged_artifacts
        session.commit()
    finally:
        if owns_session:
            session.close()


def mark_task_failed(
    task_id: str,
    *,
    error_code: str,
    message: str,
    exception_type: str = "",
    detail_excerpt: str = "",
    traceback_excerpt: str = "",
    failed_stage: str | None = None,
    translation_debug: dict | None = None,
    resume_available: bool | None = None,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> None:
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return
        failed_at = now_shanghai_naive()
        last_progress_text = str(task.current_text or "")
        stages = _copy_list(task.stages_json)
        running_stage = next((item for item in stages if item.get("status") == "running"), None)
        if running_stage:
            running_stage["status"] = "failed"
        resume_stage = str(failed_stage or running_stage.get("key") or "") if running_stage else str(failed_stage or _infer_resume_stage(stages))
        next_translation_debug = dict(translation_debug) if isinstance(translation_debug, dict) else _copy_dict(task.translation_debug_json)
        task.stages_json = stages
        task.status = "failed"
        task.translation_debug_json = next_translation_debug or None
        task.failure_debug_json = {
            "failed_stage": resume_stage,
            "exception_type": _trim_text(exception_type, FAILURE_EXCEPTION_TYPE_LIMIT),
            "detail_excerpt": _trim_text(detail_excerpt, FAILURE_DETAIL_EXCERPT_LIMIT),
            "traceback_excerpt": _trim_text(traceback_excerpt, FAILURE_TRACEBACK_EXCERPT_LIMIT),
            "last_progress_text": _trim_text(last_progress_text, 255),
            "stages": _copy_list(stages),
            "counters": _copy_dict(task.counters_json),
            "translation_debug": next_translation_debug or None,
            "failed_at": failed_at.isoformat(),
        }
        task.error_code = error_code
        task.message = message
        task.current_text = message
        task.resume_stage = resume_stage
        task.resume_available = bool(resume_stage) if resume_available is None else bool(resume_available)
        task.failed_at = failed_at
        task.artifact_expires_at = now_shanghai_naive() + timedelta(hours=FAILURE_RETENTION_HOURS)
        session.commit()
    finally:
        if owns_session:
            session.close()


def mark_task_succeeded(
    task_id: str,
    *,
    lesson_id: int,
    subtitle_cache_seed: dict | None = None,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> None:
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return
        stages = _copy_list(task.stages_json)
        for stage in stages:
            stage["status"] = "completed"
        task.stages_json = stages
        task.status = "succeeded"
        task.lesson_id = int(lesson_id)
        task.overall_percent = 100
        task.current_text = "课程生成完成"
        task.failure_debug_json = None
        task.subtitle_cache_seed_json = dict(subtitle_cache_seed) if isinstance(subtitle_cache_seed, dict) else None
        task.resume_available = False
        task.resume_stage = ""
        task.artifact_expires_at = now_shanghai_naive()
        task.failed_at = None
        session.commit()
    finally:
        if owns_session:
            session.close()


def purge_task_raw_debug(
    task_id: str,
    *,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> dict | None:
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return None
        purged_at = now_shanghai_naive()
        translation_attempt_count = int(
            session.scalar(select(func.count(TranslationRequestLog.id)).where(TranslationRequestLog.task_id == task_id))
            or 0
        )
        session.execute(
            update(TranslationRequestLog)
            .where(TranslationRequestLog.task_id == task_id)
            .values(raw_request_text="", raw_response_text="", raw_error_text="")
        )
        task.asr_raw_json = None
        task.raw_debug_purged_at = purged_at
        if owns_session:
            session.commit()
        else:
            session.flush()
        return {
            "task_id": task_id,
            "translation_attempt_count": translation_attempt_count,
            "raw_debug_purged_at": purged_at,
        }
    finally:
        if owns_session:
            session.close()


def reset_failed_task_for_restart(
    task_id: str,
    *,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> dict | None:
    cleanup_expired_tasks(db=db, session_factory=session_factory)
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task or str(task.status or "") != "failed":
            return None
        task.stages_json = _empty_stages()
        task.counters_json = _empty_counters()
        task.translation_debug_json = None
        task.failure_debug_json = None
        task.status = "pending"
        task.overall_percent = 0
        task.current_text = "准备重新生成"
        task.error_code = ""
        task.message = ""
        task.resume_available = False
        task.resume_stage = "convert_audio"
        task.artifact_expires_at = None
        task.failed_at = None
        session.commit()
        session.refresh(task)
        return _task_to_dict(task)
    finally:
        if owns_session:
            session.close()


def reset_task_for_resume(
    task_id: str,
    *,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> dict | None:
    cleanup_expired_tasks(db=db, session_factory=session_factory)
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task or not task.resume_available:
            return None
        stages = _copy_list(task.stages_json)
        resume_stage = str(task.resume_stage or _infer_resume_stage(stages))
        reset_from_here = False
        for stage in stages:
            if stage.get("key") == resume_stage:
                reset_from_here = True
            if reset_from_here:
                stage["status"] = "pending"
            elif stage.get("status") != "completed":
                stage["status"] = "pending"
        task.stages_json = stages
        task.status = "pending"
        task.current_text = "准备继续生成"
        task.failure_debug_json = None
        task.error_code = ""
        task.message = ""
        task.resume_available = False
        task.artifact_expires_at = None
        task.failed_at = None
        session.commit()
        session.refresh(task)
        return _task_to_dict(task)
    finally:
        if owns_session:
            session.close()
