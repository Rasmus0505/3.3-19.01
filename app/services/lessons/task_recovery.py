from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.timezone import now_shanghai_naive
from app.models import LessonGenerationTask
from app.services.lessons.task_runtime import (
    get_process_started_at,
    is_task_active_in_current_process,
)

logger = logging.getLogger(__name__)

TASK_CONTROL_ACTIONS: tuple[str, ...] = ("pause", "terminate")
TASK_STATUS_RUNNING = "running"
TASK_STATUS_PAUSING = "pausing"
TASK_STATUS_PAUSED = "paused"
TASK_STATUS_TERMINATING = "terminating"
TASK_STATUS_PENDING = "pending"
TASK_ADMISSION_STATE_NONE = ""
TASK_ADMISSION_STATE_ADMITTED = "admitted"
TASK_ADMISSION_STATE_QUEUED = "queued"
TASK_RESULT_FULL_SUCCESS = "full_success"
TASK_RESULT_ASR_ONLY = "asr_only"
TASK_ACTIVE_CONTROL_STATUSES = {
    TASK_STATUS_PENDING,
    TASK_STATUS_RUNNING,
    TASK_STATUS_PAUSING,
    TASK_STATUS_TERMINATING,
}
ORPHANED_TASK_RECOVERY_MESSAGE = "上次生成已中断，可继续生成或重新开始。"
SILENT_RUNNING_TASK_RECOVERY_AFTER = timedelta(minutes=3)


def _copy_dict(value: dict | None) -> dict:
    return dict(value or {})


def _copy_list(value: list | None) -> list:
    return [dict(item) if isinstance(item, dict) else item for item in list(value or [])]


def _get_control_action(artifacts: dict | None) -> str:
    action = str((artifacts or {}).get("control_action") or "").strip().lower()
    return action if action in TASK_CONTROL_ACTIONS else ""


def _normalize_admission_state(artifacts: dict | None) -> str:
    state = str((artifacts or {}).get("admission_state") or "").strip().lower()
    if state in {TASK_ADMISSION_STATE_ADMITTED, TASK_ADMISSION_STATE_QUEUED}:
        return state
    return TASK_ADMISSION_STATE_NONE


def _clear_admission_fields(artifacts: dict | None) -> dict:
    next_artifacts = _copy_dict(artifacts)
    next_artifacts["admission_state"] = ""
    next_artifacts["queue_position"] = 0
    next_artifacts["active_task_count"] = 0
    next_artifacts["queued_task_count"] = 0
    next_artifacts["max_active_tasks"] = 0
    next_artifacts["max_queued_tasks"] = 0
    next_artifacts["queued_at"] = ""
    return next_artifacts


def _set_admission_fields(
    artifacts: dict | None,
    *,
    state: str = "",
    queue_position: int = 0,
    active_task_count: int = 0,
    queued_task_count: int = 0,
    max_active_tasks: int = 0,
    max_queued_tasks: int = 0,
    queued_at=None,
) -> dict:
    next_artifacts = _clear_admission_fields(artifacts)
    normalized_state = str(state or "").strip().lower()
    if normalized_state not in {TASK_ADMISSION_STATE_ADMITTED, TASK_ADMISSION_STATE_QUEUED}:
        return next_artifacts
    next_artifacts["admission_state"] = normalized_state
    next_artifacts["queue_position"] = max(0, int(queue_position or 0))
    next_artifacts["active_task_count"] = max(0, int(active_task_count or 0))
    next_artifacts["queued_task_count"] = max(0, int(queued_task_count or 0))
    next_artifacts["max_active_tasks"] = max(0, int(max_active_tasks or 0))
    next_artifacts["max_queued_tasks"] = max(0, int(max_queued_tasks or 0))
    next_artifacts["queued_at"] = queued_at.isoformat() if queued_at else ""
    return next_artifacts


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
    if _normalize_result_kind(result_kind) == TASK_RESULT_ASR_ONLY:
        return "仅原文字幕"
    return "完整成功"


def _build_result_message(result_kind: str, result_message: str | None = None) -> str:
    normalized_message = str(result_message or "").strip()
    if normalized_message:
        return normalized_message
    if _normalize_result_kind(result_kind) == TASK_RESULT_ASR_ONLY:
        return "课程已生成，翻译失败，可先使用原文字幕学习。"
    return "课程已生成完成"


def _should_recover_orphaned_task(task: LessonGenerationTask) -> bool:
    status = str(task.status or "").strip().lower()
    if status not in TASK_ACTIVE_CONTROL_STATUSES:
        return False
    if status == TASK_STATUS_PENDING and _normalize_admission_state(task.artifacts_json) != TASK_ADMISSION_STATE_ADMITTED:
        return False
    updated_at = task.updated_at
    if updated_at is None:
        return False
    if is_task_active_in_current_process(task.task_id):
        return False
    if updated_at < get_process_started_at():
        return True
    return now_shanghai_naive() - updated_at >= SILENT_RUNNING_TASK_RECOVERY_AFTER


def _recover_orphaned_task(task: LessonGenerationTask) -> None:
    recovered_at = now_shanghai_naive()
    previous_status = str(task.status or "").strip().lower()
    stages = _copy_list(task.stages_json)
    running_stage = next((item for item in stages if item.get("status") == "running"), None)
    if running_stage:
        running_stage["status"] = "pending"
    resume_stage = _infer_resume_stage(stages) or str(task.resume_stage or "convert_audio") or "convert_audio"
    next_artifacts = _clear_admission_fields(
        _set_control_fields(task.artifacts_json, action="", requested_at=None, paused_at=recovered_at, terminated_at=None)
    )
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
