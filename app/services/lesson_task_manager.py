from __future__ import annotations

import logging
from datetime import datetime, timedelta
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
TASK_CONTROL_ACTIONS: tuple[str, ...] = ("pause", "terminate")
TASK_STATUS_RUNNING = "running"
TASK_STATUS_PAUSING = "pausing"
TASK_STATUS_PAUSED = "paused"
TASK_STATUS_TERMINATING = "terminating"
TASK_STATUS_TERMINATED = "terminated"
TASK_STATUS_PENDING = "pending"
TASK_STATUS_FAILED = "failed"
TASK_STATUS_SUCCEEDED = "succeeded"
TASK_RESULT_FULL_SUCCESS = "full_success"
TASK_RESULT_ASR_ONLY = "asr_only"
TASK_ACTIVE_CONTROL_STATUSES = {TASK_STATUS_PENDING, TASK_STATUS_RUNNING, TASK_STATUS_PAUSING, TASK_STATUS_TERMINATING}
TASK_TERMINATE_REQUESTABLE_STATUSES = {TASK_STATUS_PENDING, TASK_STATUS_RUNNING, TASK_STATUS_PAUSING, TASK_STATUS_TERMINATING}
ORPHANED_TASK_RECOVERY_MESSAGE = "上次生成已中断，可继续生成或重新开始。"

_STAGE_LABELS: tuple[tuple[str, str], ...] = (
    ("convert_audio", "转换音频格式"),
    ("asr_transcribe", "ASR转写字幕"),
    ("translate_zh", "翻译中文"),
    ("write_lesson", "写入课程"),
)

logger = logging.getLogger(__name__)
_STAGE_LABELS = (
    ("convert_audio", "转换音频格式"),
    ("asr_transcribe", "ASR转写字幕"),
    ("build_lesson", "生成课程结构"),
    ("translate_zh", "翻译中文字幕"),
    ("write_lesson", "写入课程"),
)
LESSON_TASK_REQUIRED_COLUMNS: tuple[str, ...] = tuple(str(column.name) for column in LessonGenerationTask.__table__.columns)
_ACTIVE_TASK_PROBE: Callable[[str], bool] | None = None
_PROCESS_STARTED_AT = now_shanghai_naive()


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


def _default_artifacts(
    work_dir: str,
    source_path: str,
    *,
    requested_asr_model: str = "",
    effective_asr_model: str = "",
    model_fallback_applied: bool = False,
    model_fallback_reason: str = "",
) -> dict:
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
        "control_action": "",
        "control_requested_at": "",
        "paused_at": "",
        "terminated_at": "",
        "requested_asr_model": str(requested_asr_model or "").strip(),
        "effective_asr_model": str(effective_asr_model or requested_asr_model or "").strip(),
        "model_fallback_applied": bool(model_fallback_applied),
        "model_fallback_reason": str(model_fallback_reason or "").strip(),
        "result_kind": TASK_RESULT_FULL_SUCCESS,
        "result_label": "",
        "result_message": "",
        "partial_failure_stage": "",
        "partial_failure_code": "",
        "partial_failure_message": "",
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


def _get_control_action(artifacts: dict | None) -> str:
    action = str((artifacts or {}).get("control_action") or "").strip().lower()
    return action if action in TASK_CONTROL_ACTIONS else ""


def _clear_control_fields(artifacts: dict | None) -> dict:
    next_artifacts = _copy_dict(artifacts)
    next_artifacts["control_action"] = ""
    next_artifacts["control_requested_at"] = ""
    return next_artifacts


def _set_control_fields(artifacts: dict | None, *, action: str = "", requested_at=None, paused_at=None, terminated_at=None) -> dict:
    next_artifacts = _copy_dict(artifacts)
    normalized_action = action if action in TASK_CONTROL_ACTIONS else ""
    next_artifacts["control_action"] = normalized_action
    next_artifacts["control_requested_at"] = requested_at.isoformat() if requested_at else ""
    if paused_at is not None:
        next_artifacts["paused_at"] = paused_at.isoformat() if paused_at else ""
    if terminated_at is not None:
        next_artifacts["terminated_at"] = terminated_at.isoformat() if terminated_at else ""
    return next_artifacts


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


def _normalize_result_kind(value: str | None) -> str:
    normalized = str(value or "").strip().lower()
    if normalized == TASK_RESULT_ASR_ONLY:
        return TASK_RESULT_ASR_ONLY
    return TASK_RESULT_FULL_SUCCESS


def _build_result_label(result_kind: str) -> str:
    normalized_kind = _normalize_result_kind(result_kind)
    if normalized_kind == TASK_RESULT_ASR_ONLY:
        return "仅原文字幕"
    return "完整成功"


def _build_result_message(result_kind: str, result_message: str | None = None) -> str:
    normalized_message = str(result_message or "").strip()
    if normalized_message:
        return normalized_message
    normalized_kind = _normalize_result_kind(result_kind)
    if normalized_kind == TASK_RESULT_ASR_ONLY:
        return "课程已生成，翻译失败，可先使用原文字幕学习。"
    return "课程已生成完成"


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


def configure_task_runtime_probe(
    active_task_probe: Callable[[str], bool] | None = None,
    *,
    process_started_at: datetime | None = None,
) -> None:
    global _ACTIVE_TASK_PROBE, _PROCESS_STARTED_AT
    _ACTIVE_TASK_PROBE = active_task_probe
    if process_started_at is not None:
        _PROCESS_STARTED_AT = process_started_at


def _is_task_active_in_current_process(task_id: str) -> bool:
    if _ACTIVE_TASK_PROBE is None:
        return False
    try:
        return bool(_ACTIVE_TASK_PROBE(str(task_id or "")))
    except Exception:
        logger.exception("[DEBUG] lessons.task.active_probe.failed task_id=%s", task_id)
        return False


def _should_recover_orphaned_task(task: LessonGenerationTask) -> bool:
    status = str(task.status or "").strip().lower()
    if status not in TASK_ACTIVE_CONTROL_STATUSES:
        return False
    updated_at = task.updated_at
    if updated_at is None or updated_at >= _PROCESS_STARTED_AT:
        return False
    return not _is_task_active_in_current_process(task.task_id)


def _recover_orphaned_task(task: LessonGenerationTask) -> None:
    recovered_at = now_shanghai_naive()
    previous_status = str(task.status or "").strip().lower()
    stages = _copy_list(task.stages_json)
    running_stage = next((item for item in stages if item.get("status") == "running"), None)
    if running_stage:
        running_stage["status"] = "pending"
    resume_stage = _infer_resume_stage(stages) or str(task.resume_stage or "convert_audio") or "convert_audio"
    next_artifacts = _set_control_fields(task.artifacts_json, action="", requested_at=None, paused_at=recovered_at, terminated_at=None)
    next_artifacts["interrupted_recovery_at"] = recovered_at.isoformat()
    next_artifacts["interrupted_recovery_from_status"] = previous_status

    task.stages_json = stages
    task.status = TASK_STATUS_PAUSED
    task.current_text = ORPHANED_TASK_RECOVERY_MESSAGE
    task.message = ""
    task.error_code = ""
    task.failure_debug_json = None
    task.failed_at = None
    task.resume_stage = resume_stage
    task.resume_available = True
    task.artifact_expires_at = None
    task.artifacts_json = next_artifacts


def _recover_orphaned_task_if_needed(task: LessonGenerationTask | None, session: Session) -> LessonGenerationTask | None:
    if task is None or not _should_recover_orphaned_task(task):
        return task
    previous_status = str(task.status or "").strip().lower()
    _recover_orphaned_task(task)
    session.commit()
    session.refresh(task)
    logger.info(
        "[DEBUG] lessons.task.orphan_recovered task_id=%s previous_status=%s resume_stage=%s",
        task.task_id,
        previous_status,
        task.resume_stage,
    )
    return task


def _task_to_dict(task: LessonGenerationTask) -> dict:
    failure_debug = _copy_dict(task.failure_debug_json) if isinstance(task.failure_debug_json, dict) else None
    if failure_debug is not None and task.failed_at is not None and not failure_debug.get("failed_at"):
        failure_debug["failed_at"] = task.failed_at
    asr_raw = _copy_dict(task.asr_raw_json) if isinstance(task.asr_raw_json, dict) else None
    artifacts = _copy_dict(task.artifacts_json)
    status = str(task.status or "")
    control_action = _get_control_action(artifacts)
    result_kind = _normalize_result_kind(artifacts.get("result_kind"))
    result_message = _build_result_message(result_kind, artifacts.get("result_message"))
    return {
        "task_id": task.task_id,
        "owner_user_id": int(task.owner_user_id),
        "lesson_id": int(task.lesson_id) if task.lesson_id else None,
        "source_filename": task.source_filename,
        "asr_model": task.asr_model,
        "requested_asr_model": str(artifacts.get("requested_asr_model") or task.asr_model or ""),
        "effective_asr_model": str(artifacts.get("effective_asr_model") or task.asr_model or ""),
        "model_fallback_applied": bool(artifacts.get("model_fallback_applied")),
        "model_fallback_reason": str(artifacts.get("model_fallback_reason") or ""),
        "semantic_split_enabled": bool(task.semantic_split_enabled),
        "status": status,
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
        "result_kind": result_kind,
        "result_label": _build_result_label(result_kind),
        "result_message": result_message,
        "partial_failure_stage": str(artifacts.get("partial_failure_stage") or ""),
        "partial_failure_code": str(artifacts.get("partial_failure_code") or ""),
        "partial_failure_message": str(artifacts.get("partial_failure_message") or ""),
        "resume_available": bool(task.resume_available),
        "resume_stage": str(task.resume_stage or ""),
        "artifacts": artifacts,
        "artifact_expires_at": task.artifact_expires_at,
        "failed_at": task.failed_at,
        "raw_debug_purged_at": task.raw_debug_purged_at,
        "control_action": control_action,
        "paused_at": artifacts.get("paused_at") or None,
        "terminated_at": artifacts.get("terminated_at") or None,
        "can_pause": status in {TASK_STATUS_PENDING, TASK_STATUS_RUNNING} and control_action != "terminate",
        "can_terminate": status in {TASK_STATUS_PENDING, TASK_STATUS_RUNNING, TASK_STATUS_PAUSING, TASK_STATUS_TERMINATING},
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
    requested_asr_model: str | None = None,
    effective_asr_model: str | None = None,
    model_fallback_applied: bool = False,
    model_fallback_reason: str = "",
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
            status=TASK_STATUS_PENDING,
            overall_percent=0,
            current_text="等待处理",
            stages_json=_empty_stages(),
            counters_json=_empty_counters(),
            work_dir=work_dir,
            source_path=source_path,
            artifacts_json=_default_artifacts(
                work_dir,
                source_path,
                requested_asr_model=str(requested_asr_model or asr_model or "").strip(),
                effective_asr_model=str(effective_asr_model or asr_model or "").strip(),
                model_fallback_applied=bool(model_fallback_applied),
                model_fallback_reason=str(model_fallback_reason or "").strip(),
            ),
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
        task = _recover_orphaned_task_if_needed(task, session)
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
        if str(task.status or "") in {TASK_STATUS_PENDING, TASK_STATUS_FAILED}:
            task.status = TASK_STATUS_RUNNING
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
        merged_artifacts = _copy_dict(task.artifacts_json)
        merged_artifacts["result_kind"] = TASK_RESULT_FULL_SUCCESS
        merged_artifacts["result_label"] = ""
        merged_artifacts["result_message"] = ""
        merged_artifacts["partial_failure_stage"] = ""
        merged_artifacts["partial_failure_code"] = ""
        merged_artifacts["partial_failure_message"] = ""
        if artifacts_patch:
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
        task.status = TASK_STATUS_FAILED
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
        task.artifacts_json = _clear_control_fields(task.artifacts_json)
        session.commit()
    finally:
        if owns_session:
            session.close()


def mark_task_succeeded(
    task_id: str,
    *,
    lesson_id: int,
    subtitle_cache_seed: dict | None = None,
    translation_debug: dict | None = None,
    result_kind: str = TASK_RESULT_FULL_SUCCESS,
    result_message: str = "",
    partial_failure_stage: str = "",
    partial_failure_code: str = "",
    partial_failure_message: str = "",
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
        normalized_result_kind = _normalize_result_kind(result_kind)
        normalized_partial_stage = str(partial_failure_stage or "").strip()
        for stage in stages:
            stage["status"] = "failed" if normalized_partial_stage and stage.get("key") == normalized_partial_stage else "completed"
        task.stages_json = stages
        task.status = TASK_STATUS_SUCCEEDED
        task.lesson_id = int(lesson_id)
        task.overall_percent = 100
        task.current_text = _build_result_message(normalized_result_kind, result_message)
        task.failure_debug_json = None
        task.translation_debug_json = dict(translation_debug) if isinstance(translation_debug, dict) else task.translation_debug_json
        task.subtitle_cache_seed_json = dict(subtitle_cache_seed) if isinstance(subtitle_cache_seed, dict) else None
        task.resume_available = False
        task.resume_stage = ""
        task.artifact_expires_at = now_shanghai_naive()
        task.failed_at = None
        next_artifacts = _clear_control_fields(task.artifacts_json)
        next_artifacts["result_kind"] = normalized_result_kind
        next_artifacts["result_label"] = _build_result_label(normalized_result_kind)
        next_artifacts["result_message"] = _build_result_message(normalized_result_kind, result_message)
        next_artifacts["partial_failure_stage"] = normalized_partial_stage
        next_artifacts["partial_failure_code"] = str(partial_failure_code or "").strip()
        next_artifacts["partial_failure_message"] = str(partial_failure_message or "").strip()
        task.artifacts_json = next_artifacts
        session.commit()
    finally:
        if owns_session:
            session.close()


def build_task_debug_report(task: dict) -> str:
    normalized_task = dict(task or {})
    failure_debug = dict(normalized_task.get("failure_debug") or {})
    translation_debug = dict(normalized_task.get("translation_debug") or {})
    counters = dict(normalized_task.get("counters") or {})
    stage_items: list[str] = []
    for item in list(normalized_task.get("stages") or []):
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or item.get("key") or "").strip()
        status = str(item.get("status") or "").strip() or "pending"
        if label:
            stage_items.append(f"{label}:{status}")
    return "\n".join(
        [
            "请根据下面的任务信息排查素材生成链路：",
            f"task_id: {str(normalized_task.get('task_id') or '').strip()}",
            f"status: {str(normalized_task.get('status') or '').strip()}",
            f"result_kind: {str(normalized_task.get('result_kind') or TASK_RESULT_FULL_SUCCESS).strip()}",
            f"result_message: {str(normalized_task.get('result_message') or normalized_task.get('current_text') or '').strip()}",
            f"source_filename: {str(normalized_task.get('source_filename') or '').strip()}",
            f"requested_asr_model: {str(normalized_task.get('requested_asr_model') or normalized_task.get('asr_model') or '').strip()}",
            f"effective_asr_model: {str(normalized_task.get('effective_asr_model') or normalized_task.get('asr_model') or '').strip()}",
            f"overall_percent: {int(normalized_task.get('overall_percent') or 0)}%",
            f"stages: {' | '.join(stage_items) if stage_items else '无'}",
            f"failed_stage: {str(normalized_task.get('partial_failure_stage') or failure_debug.get('failed_stage') or '').strip() or '无'}",
            f"error_code: {str(normalized_task.get('partial_failure_code') or normalized_task.get('error_code') or '').strip() or '无'}",
            f"error_message: {str(normalized_task.get('partial_failure_message') or normalized_task.get('message') or '').strip() or '无'}",
            f"last_progress_text: {str(normalized_task.get('current_text') or failure_debug.get('last_progress_text') or '').strip() or '无'}",
            f"asr_progress: {int(counters.get('asr_done', 0) or 0)}/{int(counters.get('asr_estimated', 0) or 0)}",
            f"segment_progress: {int(counters.get('segment_done', 0) or 0)}/{int(counters.get('segment_total', 0) or 0)}",
            f"translate_progress: {int(counters.get('translate_done', 0) or 0)}/{int(counters.get('translate_total', 0) or 0)}",
            f"translation_failed_sentences: {int(translation_debug.get('failed_sentences', 0) or 0)}",
            f"translation_request_count: {int(translation_debug.get('request_count', 0) or 0)}",
            f"translation_latest_error: {str(translation_debug.get('latest_error_summary') or '').strip() or '无'}",
            f"exception_type: {str(failure_debug.get('exception_type') or '').strip() or '无'}",
            f"detail_excerpt: {str(failure_debug.get('detail_excerpt') or '').strip() or '无'}",
            f"lesson_id: {str(normalized_task.get('lesson_id') or '').strip() or '无'}",
            f"created_at: {str(normalized_task.get('created_at') or '').strip() or '无'}",
            f"updated_at: {str(normalized_task.get('updated_at') or '').strip() or '无'}",
        ]
    )


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
        if not task or str(task.status or "") != TASK_STATUS_FAILED:
            return None
        task.stages_json = _empty_stages()
        task.counters_json = _empty_counters()
        task.translation_debug_json = None
        task.failure_debug_json = None
        task.status = TASK_STATUS_PENDING
        task.overall_percent = 0
        task.current_text = "准备重新生成"
        task.error_code = ""
        task.message = ""
        task.resume_available = False
        task.resume_stage = "convert_audio"
        task.artifact_expires_at = None
        task.failed_at = None
        task.artifacts_json = _set_control_fields(task.artifacts_json, action="", requested_at=None, paused_at=None, terminated_at=None)
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
        task.status = TASK_STATUS_PENDING
        task.current_text = "准备继续生成"
        task.failure_debug_json = None
        task.error_code = ""
        task.message = ""
        task.resume_available = False
        task.artifact_expires_at = None
        task.failed_at = None
        task.artifacts_json = _set_control_fields(task.artifacts_json, action="", requested_at=None, paused_at=None, terminated_at=None)
        session.commit()
        session.refresh(task)
        return _task_to_dict(task)
    finally:
        if owns_session:
            session.close()


def request_task_control(
    task_id: str,
    *,
    action: str,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> dict | None:
    normalized_action = str(action or "").strip().lower()
    if normalized_action not in TASK_CONTROL_ACTIONS:
        return None
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return None
        task = _recover_orphaned_task_if_needed(task, session)
        if not task:
            return None
        status = str(task.status or "").strip().lower()
        if normalized_action == "pause" and status not in {TASK_STATUS_PENDING, TASK_STATUS_RUNNING, TASK_STATUS_PAUSING}:
            return None
        if normalized_action == "terminate" and status not in TASK_TERMINATE_REQUESTABLE_STATUSES:
            return None
        requested_at = now_shanghai_naive()
        task.status = TASK_STATUS_PAUSING if normalized_action == "pause" else TASK_STATUS_TERMINATING
        task.current_text = "正在暂停，当前步骤完成后会保留进度" if normalized_action == "pause" else "正在终止，当前步骤完成后会停止生成"
        task.message = ""
        task.error_code = ""
        task.resume_available = False
        task.artifact_expires_at = None
        task.artifacts_json = _set_control_fields(task.artifacts_json, action=normalized_action, requested_at=requested_at)
        session.commit()
        session.refresh(task)
        return _task_to_dict(task)
    finally:
        if owns_session:
            session.close()


def request_active_tasks_terminate_for_owner(
    owner_user_id: int,
    *,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> dict[str, object]:
    normalized_owner_user_id = int(owner_user_id or 0)
    if normalized_owner_user_id <= 0:
        return {"requested_task_ids": [], "requested_count": 0}
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        tasks = list(
            session.scalars(
                select(LessonGenerationTask)
                .where(
                    LessonGenerationTask.owner_user_id == normalized_owner_user_id,
                    LessonGenerationTask.status.in_(tuple(TASK_TERMINATE_REQUESTABLE_STATUSES)),
                )
                .order_by(LessonGenerationTask.updated_at.desc(), LessonGenerationTask.id.desc())
            ).all()
        )
        requested_task_ids: list[str] = []
        requested_at = now_shanghai_naive()
        for task in tasks:
            task = _recover_orphaned_task_if_needed(task, session)
            if not task:
                continue
            status = str(task.status or "").strip().lower()
            if status not in TASK_TERMINATE_REQUESTABLE_STATUSES:
                continue
            task.status = TASK_STATUS_TERMINATING
            task.current_text = "正在终止，当前步骤完成后会停止生成"
            task.message = ""
            task.error_code = ""
            task.resume_available = False
            task.artifact_expires_at = None
            task.artifacts_json = _set_control_fields(task.artifacts_json, action="terminate", requested_at=requested_at)
            requested_task_ids.append(str(task.task_id))
        if requested_task_ids:
            session.commit()
        return {"requested_task_ids": requested_task_ids, "requested_count": len(requested_task_ids)}
    finally:
        if owns_session:
            session.close()


def get_task_control_action(
    task_id: str,
    *,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> str:
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return ""
        return _get_control_action(task.artifacts_json)
    finally:
        if owns_session:
            session.close()


def mark_task_paused(
    task_id: str,
    *,
    message: str = "已暂停，可继续生成",
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> None:
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return
        paused_at = now_shanghai_naive()
        stages = _copy_list(task.stages_json)
        running_stage = next((item for item in stages if item.get("status") == "running"), None)
        if running_stage:
            running_stage["status"] = "pending"
        resume_stage = _infer_resume_stage(stages) or str(task.resume_stage or "")
        task.stages_json = stages
        task.status = TASK_STATUS_PAUSED
        task.current_text = message
        task.message = ""
        task.error_code = ""
        task.failure_debug_json = None
        task.failed_at = None
        task.resume_stage = resume_stage
        task.resume_available = bool(resume_stage)
        task.artifact_expires_at = None
        task.artifacts_json = _set_control_fields(task.artifacts_json, action="", requested_at=None, paused_at=paused_at)
        session.commit()
    finally:
        if owns_session:
            session.close()


def mark_task_terminated(
    task_id: str,
    *,
    message: str = "已终止生成，素材仍保留",
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> None:
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return
        terminated_at = now_shanghai_naive()
        stages = _copy_list(task.stages_json)
        running_stage = next((item for item in stages if item.get("status") == "running"), None)
        if running_stage:
            running_stage["status"] = "pending"
        task.stages_json = stages
        task.status = TASK_STATUS_TERMINATED
        task.current_text = message
        task.message = message
        task.error_code = ""
        task.failure_debug_json = None
        task.failed_at = None
        task.resume_available = False
        task.resume_stage = _infer_resume_stage(stages) or str(task.resume_stage or "")
        task.artifact_expires_at = now_shanghai_naive()
        task.artifacts_json = _set_control_fields(task.artifacts_json, action="", requested_at=None, terminated_at=terminated_at)
        session.commit()
    finally:
        if owns_session:
            session.close()
