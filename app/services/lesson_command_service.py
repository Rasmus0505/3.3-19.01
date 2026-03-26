from __future__ import annotations

import json
import logging
import shutil
import threading
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import BASE_DATA_DIR, BASE_TMP_DIR, LESSON_TASK_MAX_ACTIVE, LESSON_TASK_MAX_QUEUED, UPLOAD_MAX_BYTES
from app.core.timezone import now_shanghai_naive
from app.models import Lesson, LessonGenerationTask, WalletLedger
from app.repositories.admin_console import invalidate_admin_overview_cache, invalidate_admin_user_activity_summary_cache
from app.repositories.lessons import update_lesson_title_for_user
from app.services.asr_dashscope import AsrCancellationRequested, AsrError
from app.services.billing_service import (
    BillingError,
    calculate_points,
    ensure_default_billing_rates,
    get_default_asr_model,
    get_model_rate,
    get_or_create_wallet_account,
)
from app.services.lesson_query_service import invalidate_lesson_catalog_cache
from app.services.lesson_service import LessonService
from app.services.lesson_task_manager import (
    LessonTaskStorageNotReadyError,
    TASK_ADMISSION_STATE_ADMITTED,
    TASK_ADMISSION_STATE_QUEUED,
    TASK_STATUS_PAUSING,
    TASK_STATUS_PENDING,
    TASK_STATUS_RUNNING,
    TASK_STATUS_TERMINATING,
    build_task_id,
    bind_task_terminate_runtime,
    clear_task_terminate_runtime,
    configure_task_runtime_probe,
    create_task,
    ensure_lesson_task_storage_ready,
    get_task,
    get_task_control_action,
    is_task_terminate_requested,
    mark_task_failed,
    mark_task_paused,
    mark_task_succeeded,
    mark_task_terminated,
    patch_task_artifacts,
    request_active_tasks_terminate_for_owner,
    request_task_control,
    reset_failed_task_for_restart,
    reset_task_for_resume,
    signal_task_terminate,
    update_task_progress,
)
from app.services.media import MediaError, cleanup_dir, probe_audio_duration_ms, save_upload_file_stream, validate_suffix
from app.services.translation_qwen_mt import TranslationCancellationRequested, TranslationError


logger = logging.getLogger(__name__)
PROCESS_STARTED_AT = now_shanghai_naive()
_ACTIVE_TASK_IDS: set[str] = set()
_ACTIVE_TASK_IDS_LOCK = threading.Lock()
_TASK_ADMISSION_LOCK = threading.Lock()


class LessonTaskPauseRequested(RuntimeError):
    pass


class LessonTaskTerminateRequested(RuntimeError):
    pass


class LessonTaskAdmissionError(RuntimeError):
    code = "LESSON_TASK_BUSY"
    message = "当前生成任务繁忙，请稍后重试"

    def __init__(self, detail: dict[str, object]):
        self.detail = dict(detail or {})
        super().__init__(self.message)


def _resolve_task_asr_models(requested_asr_model: str) -> dict[str, object]:
    normalized_requested_model = str(requested_asr_model or "").strip()
    return {
        "requested_asr_model": normalized_requested_model,
        "effective_asr_model": normalized_requested_model,
        "model_fallback_applied": False,
        "model_fallback_reason": "",
    }


def _ensure_sufficient_balance_for_model(
    *,
    db: Session,
    owner_user_id: int,
    asr_model: str,
    source_duration_ms: int,
) -> int:
    normalized_duration_ms = max(0, int(source_duration_ms or 0))
    if normalized_duration_ms <= 0:
        return 0
    rate = get_model_rate(db, asr_model)
    required_points = calculate_points(
        normalized_duration_ms,
        rate.points_per_minute,
        price_per_minute_yuan=getattr(rate, "price_per_minute_yuan", None),
    )
    account = get_or_create_wallet_account(db, owner_user_id, for_update=False)
    if account.balance_points < required_points:
        raise BillingError(
            "INSUFFICIENT_BALANCE",
            "余额不足，无法创建课程",
            f"balance={account.balance_points}, required={required_points}, duration_ms={normalized_duration_ms}, model={asr_model}",
        )
    return required_points


def is_task_active_in_current_process(task_id: str) -> bool:
    normalized_task_id = str(task_id or "").strip()
    if not normalized_task_id:
        return False
    with _ACTIVE_TASK_IDS_LOCK:
        return normalized_task_id in _ACTIVE_TASK_IDS


def _register_active_task(task_id: str) -> None:
    normalized_task_id = str(task_id or "").strip()
    if not normalized_task_id:
        return
    with _ACTIVE_TASK_IDS_LOCK:
        _ACTIVE_TASK_IDS.add(normalized_task_id)


def _unregister_active_task(task_id: str) -> None:
    normalized_task_id = str(task_id or "").strip()
    if not normalized_task_id:
        return
    with _ACTIVE_TASK_IDS_LOCK:
        _ACTIVE_TASK_IDS.discard(normalized_task_id)


def _normalized_admission_state(artifacts: dict | None) -> str:
    state = str((artifacts or {}).get("admission_state") or "").strip().lower()
    return state if state in {TASK_ADMISSION_STATE_ADMITTED, TASK_ADMISSION_STATE_QUEUED} else ""


def _task_uses_active_budget(task: LessonGenerationTask) -> bool:
    status = str(task.status or "").strip().lower()
    if status in {TASK_STATUS_RUNNING, TASK_STATUS_PAUSING, TASK_STATUS_TERMINATING}:
        return True
    if status == TASK_STATUS_PENDING and _normalized_admission_state(task.artifacts_json) == TASK_ADMISSION_STATE_ADMITTED:
        return True
    return False


def _task_is_waiting_for_admission(task: LessonGenerationTask) -> bool:
    return (
        str(task.status or "").strip().lower() == TASK_STATUS_PENDING
        and _normalized_admission_state(task.artifacts_json) == TASK_ADMISSION_STATE_QUEUED
    )


def _lesson_task_capacity_limits() -> tuple[int, int]:
    return max(1, int(LESSON_TASK_MAX_ACTIVE or 1)), max(0, int(LESSON_TASK_MAX_QUEUED or 0))


def _build_admission_detail(
    *,
    state: str,
    active_task_count: int,
    queued_task_count: int,
    max_active_tasks: int,
    max_queued_tasks: int,
    queue_position: int = 0,
) -> dict[str, object]:
    return {
        "state": str(state or "").strip().lower(),
        "active_task_count": max(0, int(active_task_count or 0)),
        "queued_task_count": max(0, int(queued_task_count or 0)),
        "max_active_tasks": max(0, int(max_active_tasks or 0)),
        "max_queued_tasks": max(0, int(max_queued_tasks or 0)),
        "queue_position": max(0, int(queue_position or 0)),
    }


def _queued_current_text(detail: dict[str, object]) -> str:
    ahead = max(0, int(detail.get("queue_position") or 0) - 1)
    if ahead > 0:
        return f"任务排队中，前方还有 {ahead} 个任务"
    return "任务排队中，等待可用处理槽位"


def _apply_task_admission_state(
    task: LessonGenerationTask,
    *,
    state: str,
    detail: dict[str, object],
    queued_at: datetime | None = None,
    current_text: str | None = None,
) -> None:
    artifacts = dict(task.artifacts_json or {})
    normalized_state = str(state or "").strip().lower()
    if normalized_state in {TASK_ADMISSION_STATE_ADMITTED, TASK_ADMISSION_STATE_QUEUED}:
        artifacts["admission_state"] = normalized_state
        artifacts["queue_position"] = max(0, int(detail.get("queue_position") or 0))
        artifacts["active_task_count"] = max(0, int(detail.get("active_task_count") or 0))
        artifacts["queued_task_count"] = max(0, int(detail.get("queued_task_count") or 0))
        artifacts["max_active_tasks"] = max(0, int(detail.get("max_active_tasks") or 0))
        artifacts["max_queued_tasks"] = max(0, int(detail.get("max_queued_tasks") or 0))
        artifacts["queued_at"] = queued_at.isoformat() if queued_at else ""
    else:
        artifacts["admission_state"] = ""
        artifacts["queue_position"] = 0
        artifacts["active_task_count"] = 0
        artifacts["queued_task_count"] = 0
        artifacts["max_active_tasks"] = 0
        artifacts["max_queued_tasks"] = 0
        artifacts["queued_at"] = ""
    task.artifacts_json = artifacts
    task.message = ""
    if current_text is not None:
        task.current_text = current_text


def _build_task_start_kwargs(task: LessonGenerationTask) -> dict[str, object]:
    artifacts = dict(task.artifacts_json or {})
    source_path = Path(str(artifacts.get("source_path") or task.source_path or "").strip())
    req_dir = Path(str(artifacts.get("work_dir") or task.work_dir or "").strip())
    return {
        "task_id": str(task.task_id),
        "owner_id": int(task.owner_user_id),
        "source_filename": str(task.source_filename or source_path.name),
        "source_path": source_path,
        "req_dir": req_dir,
        "requested_asr_model": str(artifacts.get("requested_asr_model") or task.asr_model or ""),
        "effective_asr_model": str(artifacts.get("effective_asr_model") or task.asr_model or ""),
        "semantic_split_enabled": bool(task.semantic_split_enabled),
        "input_mode": str(artifacts.get("input_mode") or "upload").strip().lower() or "upload",
        "source_duration_ms": int(artifacts.get("source_duration_ms") or 0),
    }


def _start_lesson_generation_thread(*, session_factory: sessionmaker[Session], task_kwargs: dict[str, object]) -> None:
    thread = threading.Thread(
        target=run_lesson_generation_task,
        kwargs={**task_kwargs, "session_factory": session_factory},
        daemon=True,
    )
    thread.start()


def _list_open_lesson_tasks(db: Session) -> list[LessonGenerationTask]:
    return list(
        db.scalars(
            select(LessonGenerationTask)
            .where(LessonGenerationTask.status.in_((TASK_STATUS_PENDING, TASK_STATUS_RUNNING, TASK_STATUS_PAUSING, TASK_STATUS_TERMINATING)))
            .order_by(LessonGenerationTask.created_at.asc(), LessonGenerationTask.id.asc())
        ).all()
    )


def _admit_or_queue_task_locked(
    *,
    task: LessonGenerationTask,
    db: Session,
    reject_when_queue_full: bool = True,
) -> tuple[dict[str, object], dict[str, object] | None]:
    max_active_tasks, max_queued_tasks = _lesson_task_capacity_limits()
    open_tasks = _list_open_lesson_tasks(db)
    active_task_count = sum(1 for item in open_tasks if _task_uses_active_budget(item))
    queued_tasks = [item for item in open_tasks if _task_is_waiting_for_admission(item)]
    queued_task_count = len(queued_tasks)

    if active_task_count < max_active_tasks:
        detail = _build_admission_detail(
            state=TASK_ADMISSION_STATE_ADMITTED,
            active_task_count=active_task_count + 1,
            queued_task_count=queued_task_count,
            max_active_tasks=max_active_tasks,
            max_queued_tasks=max_queued_tasks,
        )
        _apply_task_admission_state(task, state=TASK_ADMISSION_STATE_ADMITTED, detail=detail, current_text=str(task.current_text or "等待处理"))
        db.commit()
        db.refresh(task)
        return detail, _build_task_start_kwargs(task)

    if queued_task_count < max_queued_tasks or not reject_when_queue_full:
        queued_at = now_shanghai_naive()
        detail = _build_admission_detail(
            state=TASK_ADMISSION_STATE_QUEUED,
            active_task_count=active_task_count,
            queued_task_count=queued_task_count + 1,
            max_active_tasks=max_active_tasks,
            max_queued_tasks=max_queued_tasks,
            queue_position=queued_task_count + 1,
        )
        _apply_task_admission_state(
            task,
            state=TASK_ADMISSION_STATE_QUEUED,
            detail=detail,
            queued_at=queued_at,
            current_text=_queued_current_text(detail),
        )
        db.commit()
        db.refresh(task)
        return detail, None

    raise LessonTaskAdmissionError(
        _build_admission_detail(
            state="rejected",
            active_task_count=active_task_count,
            queued_task_count=queued_task_count,
            max_active_tasks=max_active_tasks,
            max_queued_tasks=max_queued_tasks,
        )
    )


def _schedule_queued_lesson_tasks(*, session_factory: sessionmaker[Session]) -> None:
    start_queue: list[dict[str, object]] = []
    with _TASK_ADMISSION_LOCK:
        db = session_factory()
        try:
            ensure_lesson_task_storage_ready(db)
            max_active_tasks, max_queued_tasks = _lesson_task_capacity_limits()
            while True:
                open_tasks = _list_open_lesson_tasks(db)
                active_task_count = sum(1 for item in open_tasks if _task_uses_active_budget(item))
                if active_task_count >= max_active_tasks:
                    break
                queued_tasks = [item for item in open_tasks if _task_is_waiting_for_admission(item)]
                if not queued_tasks:
                    break
                next_task = queued_tasks[0]
                detail = _build_admission_detail(
                    state=TASK_ADMISSION_STATE_ADMITTED,
                    active_task_count=active_task_count + 1,
                    queued_task_count=max(0, len(queued_tasks) - 1),
                    max_active_tasks=max_active_tasks,
                    max_queued_tasks=max_queued_tasks,
                )
                _apply_task_admission_state(
                    next_task,
                    state=TASK_ADMISSION_STATE_ADMITTED,
                    detail=detail,
                    current_text="等待处理",
                )
                db.commit()
                db.refresh(next_task)
                start_queue.append(_build_task_start_kwargs(next_task))
        finally:
            db.close()
    for task_kwargs in start_queue:
        _start_lesson_generation_thread(session_factory=session_factory, task_kwargs=task_kwargs)


def build_lesson_task_session_factory(bind) -> sessionmaker[Session]:
    return sessionmaker(autocommit=False, autoflush=False, bind=bind, class_=Session, future=True)


def invalidate_lesson_related_queries(user_id: int) -> None:
    invalidate_lesson_catalog_cache(user_id)
    invalidate_admin_overview_cache()
    invalidate_admin_user_activity_summary_cache(user_id)


def _raise_if_task_control_requested(task_id: str, *, session_factory: sessionmaker[Session]) -> None:
    if is_task_terminate_requested(task_id):
        raise LessonTaskTerminateRequested("terminate requested")
    action = get_task_control_action(task_id, session_factory=session_factory)
    if action == "pause":
        raise LessonTaskPauseRequested("pause requested")
    if action == "terminate":
        signal_task_terminate(task_id)
        raise LessonTaskTerminateRequested("terminate requested")


def run_lesson_generation_task(
    *,
    task_id: str,
    owner_id: int,
    source_filename: str,
    source_path,
    req_dir,
    requested_asr_model: str,
    effective_asr_model: str,
    semantic_split_enabled: bool | None,
    session_factory: sessionmaker[Session],
    input_mode: str = "upload",
    source_duration_ms: int | None = None,
) -> None:
    db = session_factory()
    _register_active_task(task_id)
    bind_task_terminate_runtime(task_id, req_dir, source_path)
    try:
        bind = getattr(session_factory, "kw", {}).get("bind")
        sqlite_progress_mode = bool(bind is not None and getattr(bind.dialect, "name", "") == "sqlite")
        last_progress_snapshot = {
            "stage_key": "",
            "stage_status": "",
            "overall_percent": None,
            "emitted_at": 0.0,
        }

        logger.info(
            "[DEBUG] lessons.task.start task_id=%s owner_id=%s requested_model=%s effective_model=%s",
            task_id,
            owner_id,
            requested_asr_model,
            effective_asr_model,
        )

        artifacts: dict = {}
        task_record = db.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if task_record:
            artifacts = dict(task_record.artifacts_json or {})

        def _should_emit_progress(payload: dict) -> bool:
            if not sqlite_progress_mode:
                return True
            stage_key = str(payload.get("stage_key") or "")
            stage_status = str(payload.get("stage_status") or "")
            overall_percent = payload.get("overall_percent")
            now = time.monotonic()
            if last_progress_snapshot["emitted_at"] <= 0:
                return True
            if stage_key != last_progress_snapshot["stage_key"] or stage_status != last_progress_snapshot["stage_status"]:
                return True
            if stage_status in {"completed", "failed"}:
                return True
            if isinstance(overall_percent, int):
                last_percent = last_progress_snapshot["overall_percent"]
                if isinstance(last_percent, int) and abs(overall_percent - last_percent) >= 15:
                    return True
            return (now - float(last_progress_snapshot["emitted_at"] or 0.0)) >= 20.0

        def _progress(payload: dict) -> None:
            _raise_if_task_control_requested(task_id, session_factory=session_factory)
            if _should_emit_progress(payload):
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
                last_progress_snapshot.update(
                    {
                        "stage_key": str(payload.get("stage_key") or ""),
                        "stage_status": str(payload.get("stage_status") or ""),
                        "overall_percent": payload.get("overall_percent"),
                        "emitted_at": time.monotonic(),
                    }
                )
            _raise_if_task_control_requested(task_id, session_factory=session_factory)

        normalized_input_mode = str(input_mode or "upload").strip().lower()
        _raise_if_task_control_requested(task_id, session_factory=session_factory)
        dashscope_file_id = str(artifacts.get("dashscope_file_id") or "").strip()
        dashscope_file_url = str(artifacts.get("dashscope_file_url") or "").strip()
        if dashscope_file_id:
            dashscope_kwargs: dict[str, Any] = {
                "dashscope_file_id": dashscope_file_id,
                "source_filename": source_filename,
                "req_dir": req_dir,
                "owner_id": owner_id,
                "asr_model": effective_asr_model,
                "task_id": task_id,
                "semantic_split_enabled": semantic_split_enabled,
                "db": db,
                "progress_callback": _progress,
            }
            if dashscope_file_url:
                dashscope_kwargs["dashscope_file_url"] = dashscope_file_url
            lesson = LessonService.generate_from_dashscope_file_id(**dashscope_kwargs)
        elif normalized_input_mode == "local_asr":
            local_payload = json.loads(Path(source_path).read_text(encoding="utf-8"))
            lesson = LessonService.generate_from_local_asr_payload(
                asr_payload=dict(local_payload.get("asr_payload") or {}),
                source_filename=source_filename,
                source_duration_ms=int(local_payload.get("source_duration_ms") or source_duration_ms or 0),
                runtime_kind=str(local_payload.get("runtime_kind") or artifacts.get("local_runtime_kind") or "local_browser"),
                req_dir=req_dir,
                owner_id=owner_id,
                asr_model=effective_asr_model,
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
                asr_model=effective_asr_model,
                task_id=task_id,
                semantic_split_enabled=semantic_split_enabled,
                db=db,
                progress_callback=_progress,
            )
        _raise_if_task_control_requested(task_id, session_factory=session_factory)
        task_result_meta = dict(getattr(lesson, "task_result_meta", None) or {})
        mark_task_succeeded(
            task_id,
            lesson_id=lesson.id,
            subtitle_cache_seed=getattr(lesson, "subtitle_cache_seed", None),
            translation_debug=getattr(lesson, "translation_debug", None) or getattr(lesson, "task_translation_debug", None),
            result_kind=str(task_result_meta.get("result_kind") or getattr(lesson, "task_result_kind", "") or ""),
            result_message=str(task_result_meta.get("result_message") or getattr(lesson, "task_result_message", "") or ""),
            partial_failure_stage=str(task_result_meta.get("partial_failure_stage") or getattr(lesson, "task_partial_failure_stage", "") or ""),
            partial_failure_code=str(task_result_meta.get("partial_failure_code") or getattr(lesson, "task_partial_failure_code", "") or ""),
            partial_failure_message=str(task_result_meta.get("partial_failure_message") or getattr(lesson, "task_partial_failure_message", "") or ""),
            session_factory=session_factory,
        )
        invalidate_lesson_related_queries(owner_id)
        logger.info("[DEBUG] lessons.task.succeeded task_id=%s lesson_id=%s", task_id, lesson.id)
    except LessonTaskPauseRequested:
        db.rollback()
        mark_task_paused(task_id, session_factory=session_factory)
        logger.info("[DEBUG] lessons.task.paused task_id=%s", task_id)
    except (LessonTaskTerminateRequested, AsrCancellationRequested, TranslationCancellationRequested):
        db.rollback()
        mark_task_terminated(task_id, session_factory=session_factory)
        logger.info("[DEBUG] lessons.task.terminated task_id=%s", task_id)
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
    except TranslationError as exc:
        db.rollback()
        error_code = str(getattr(exc, "code", "") or "TRANSLATION_FAILED").strip() or "TRANSLATION_FAILED"
        message = str(getattr(exc, "message", "") or str(exc) or "翻译阶段失败").strip() or "翻译阶段失败"
        detail_excerpt = str(getattr(exc, "detail", "") or str(exc) or message)
        mark_task_failed(
            task_id,
            error_code=error_code,
            message=message,
            exception_type=exc.__class__.__name__,
            detail_excerpt=detail_excerpt,
            traceback_excerpt=traceback.format_exc(),
            failed_stage="translate_zh",
            translation_debug=getattr(exc, "translation_debug", None),
            session_factory=session_factory,
        )
        logger.warning("[DEBUG] lessons.task.translation_failed task_id=%s code=%s detail=%s", task_id, error_code, detail_excerpt[:240])
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
        clear_task_terminate_runtime(task_id)
        _unregister_active_task(task_id)
        db.close()
        try:
            _schedule_queued_lesson_tasks(session_factory=session_factory)
        except Exception:
            logger.exception("[DEBUG] lessons.task.queue_schedule_failed task_id=%s", task_id)


def create_lesson_task_from_dashscope_file(
    *,
    owner_user_id: int,
    asr_model: str,
    semantic_split_enabled: bool | None,
    dashscope_file_id: str,
    dashscope_file_url: str | None = None,
    db: Session,
) -> dict[str, object]:
    task_id = build_task_id()
    req_dir = BASE_TMP_DIR / task_id
    req_dir.mkdir(parents=True, exist_ok=True)
    task_session_factory = build_lesson_task_session_factory(db.get_bind())
    try:
        ensure_default_billing_rates(db)
        ensure_lesson_task_storage_ready(db)
        normalized_dashscope_file_id = str(dashscope_file_id or "").strip()
        if not normalized_dashscope_file_id:
            raise ValueError("dashscope_file_id is required")
        normalized_dashscope_file_url = str(dashscope_file_url or "").strip()
        source_filename = Path(normalized_dashscope_file_id).name.strip() or "dashscope-direct-upload"
        source_filename = source_filename[:255]
        source_marker_path = req_dir / "dashscope_file_id.txt"
        source_marker_path.write_text(normalized_dashscope_file_id, encoding="utf-8")
        artifacts_patch: dict[str, object] = {"dashscope_file_id": normalized_dashscope_file_id}
        if normalized_dashscope_file_url:
            artifacts_patch["dashscope_file_url"] = normalized_dashscope_file_url
        source_path_for_task = str(source_marker_path)

        model_resolution = _resolve_task_asr_models(asr_model)
        effective_asr_model = str(model_resolution["effective_asr_model"])

        with _TASK_ADMISSION_LOCK:
            create_task(
                task_id=task_id,
                owner_user_id=owner_user_id,
                source_filename=source_filename,
                asr_model=asr_model,
                requested_asr_model=str(model_resolution["requested_asr_model"]),
                effective_asr_model=effective_asr_model,
                model_fallback_applied=bool(model_resolution["model_fallback_applied"]),
                model_fallback_reason=str(model_resolution["model_fallback_reason"]),
                semantic_split_enabled=semantic_split_enabled,
                work_dir=str(req_dir),
                source_path=source_path_for_task,
                db=db,
            )
            if artifacts_patch:
                patch_task_artifacts(task_id, artifacts_patch=artifacts_patch, db=db)
            task = db.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
            if task is None:
                raise RuntimeError(f"lesson task missing after create: {task_id}")
            try:
                admission, start_kwargs = _admit_or_queue_task_locked(task=task, db=db)
            except LessonTaskAdmissionError:
                db.delete(task)
                db.commit()
                raise
        if start_kwargs is not None:
            _start_lesson_generation_thread(session_factory=task_session_factory, task_kwargs=start_kwargs)
            logger.info("[DEBUG] lessons.task.create.started task_id=%s user_id=%s", task_id, owner_user_id)
        else:
            logger.info("[DEBUG] lessons.task.create.queued task_id=%s user_id=%s", task_id, owner_user_id)
        return {"task_id": task_id, **model_resolution, "admission": admission}
    except Exception:
        cleanup_dir(req_dir)
        raise


def create_lesson_task_from_local_asr(
    *,
    source_filename: str,
    source_duration_ms: int,
    runtime_kind: str,
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
        normalized_source_duration_ms = max(1, int(source_duration_ms or 0))
        _ensure_sufficient_balance_for_model(
            db=db,
            owner_user_id=owner_user_id,
            asr_model=asr_model,
            source_duration_ms=normalized_source_duration_ms,
        )
        payload_path = req_dir / "local_asr_payload.json"
        payload_path.write_text(
            json.dumps(
                {
                    "asr_payload": dict(asr_payload or {}),
                    "source_duration_ms": normalized_source_duration_ms,
                    "runtime_kind": str(runtime_kind or "").strip() or "local_browser",
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        with _TASK_ADMISSION_LOCK:
            create_task(
                task_id=task_id,
                owner_user_id=owner_user_id,
                source_filename=(source_filename or "local_asr.json")[:255],
                asr_model=asr_model,
                requested_asr_model=asr_model,
                effective_asr_model=asr_model,
                semantic_split_enabled=semantic_split_enabled,
                work_dir=str(req_dir),
                source_path=str(payload_path),
                db=db,
            )
            patch_task_artifacts(
                task_id,
                artifacts_patch={
                    "input_mode": "local_asr",
                    "source_duration_ms": normalized_source_duration_ms,
                    "local_runtime_kind": str(runtime_kind or "").strip() or "local_browser",
                    "local_asr_payload_path": str(payload_path),
                },
                db=db,
            )
            task = db.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
            if task is None:
                raise RuntimeError(f"lesson task missing after create: {task_id}")
            try:
                admission, start_kwargs = _admit_or_queue_task_locked(task=task, db=db)
            except LessonTaskAdmissionError:
                db.delete(task)
                db.commit()
                raise
        if start_kwargs is not None:
            _start_lesson_generation_thread(session_factory=task_session_factory, task_kwargs=start_kwargs)
            logger.info("[DEBUG] lessons.task.local_asr.started task_id=%s user_id=%s", task_id, owner_user_id)
        else:
            logger.info("[DEBUG] lessons.task.local_asr.queued task_id=%s user_id=%s", task_id, owner_user_id)
        return {
            "task_id": task_id,
            "requested_asr_model": asr_model,
            "effective_asr_model": asr_model,
            "model_fallback_applied": False,
            "model_fallback_reason": "",
            "admission": admission,
        }
    except Exception:
        cleanup_dir(req_dir)
        raise


def create_completed_lesson_from_local_generation(
    *,
    source_filename: str,
    source_duration_ms: int,
    runtime_kind: str,
    asr_payload: dict,
    owner_user_id: int,
    asr_model: str,
    db: Session,
) -> Lesson:
    normalized_asr_payload = dict(asr_payload or {}) if isinstance(asr_payload, dict) else {}
    local_generation_result = dict(normalized_asr_payload.pop("__local_generation_result__", {}) or {})
    if not isinstance(local_generation_result, dict) or not local_generation_result:
        raise MediaError(
            "LOCAL_GENERATION_RESULT_MISSING",
            "本地生成结果缺失",
            "asr_payload.__local_generation_result__ is required",
        )

    lesson = LessonService.create_lesson_from_local_generation_result(
        asr_payload=normalized_asr_payload,
        source_filename=(source_filename or "local_generated.json")[:255],
        source_duration_ms=int(source_duration_ms or 0),
        runtime_kind=str(runtime_kind or "").strip() or "local_browser",
        owner_id=owner_user_id,
        asr_model=asr_model,
        local_generation_result=local_generation_result,
        db=db,
    )
    invalidate_lesson_related_queries(owner_user_id)
    return lesson


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
    with _TASK_ADMISSION_LOCK:
        latest_task = db.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if latest_task is None:
            return {"task": task, "resumed": resumed, "retry_mode": retry_mode, "task_id": task_id}
        admission, start_kwargs = _admit_or_queue_task_locked(task=latest_task, db=db, reject_when_queue_full=False)
    if start_kwargs is not None:
        _start_lesson_generation_thread(session_factory=task_session_factory, task_kwargs=start_kwargs)
        logger.info("[DEBUG] lessons.task.retry.started task_id=%s user_id=%s mode=%s", task_id, user_id, retry_mode or "unknown")
    else:
        logger.info("[DEBUG] lessons.task.retry.queued task_id=%s user_id=%s mode=%s", task_id, user_id, retry_mode or "unknown")
    return {"task": task, "resumed": resumed, "retry_mode": retry_mode, "task_id": task_id, "admission": admission}


def request_lesson_task_control_for_user(*, task_id: str, user_id: int, action: str, db: Session) -> dict[str, object] | None:
    ensure_lesson_task_storage_ready(db)
    task = get_task(task_id, db=db)
    if not task or int(task.get("owner_user_id", 0)) != user_id:
        return None
    requested = request_task_control(task_id, action=action, db=db)
    return {"task": task, "requested": requested}


def terminate_active_lesson_tasks_for_user(*, user_id: int, db: Session) -> dict[str, object]:
    ensure_lesson_task_storage_ready(db)
    return request_active_tasks_terminate_for_owner(owner_user_id=user_id, db=db)


def rename_lesson_for_user(*, db: Session, lesson_id: int, user_id: int, title: str):
    lesson = update_lesson_title_for_user(db, lesson_id, user_id, title)
    if not lesson:
        return None
    db.commit()
    db.refresh(lesson)
    invalidate_lesson_catalog_cache(user_id)
    logger.info("[DEBUG] lessons.rename.success lesson_id=%s user_id=%s", lesson_id, user_id)
    return lesson


def _delete_lesson_row(*, db: Session, lesson: Lesson) -> Path:
    lesson_dir = BASE_DATA_DIR / f"lesson_{lesson.id}"
    detach_task_result = db.execute(
        update(LessonGenerationTask).where(LessonGenerationTask.lesson_id == lesson.id).values(lesson_id=None)
    )
    detached_task_count = detach_task_result.rowcount if detach_task_result.rowcount is not None and detach_task_result.rowcount > 0 else 0
    logger.info("[DEBUG] lessons.delete.detach_generation_tasks lesson_id=%s detached_task_count=%s", lesson.id, detached_task_count)
    db.execute(update(WalletLedger).where(WalletLedger.lesson_id == lesson.id).values(lesson_id=None))
    db.delete(lesson)
    return lesson_dir


def _cleanup_lesson_dir(lesson_dir: Path, *, lesson_id: int) -> None:
    if lesson_dir.exists():
        try:
            shutil.rmtree(lesson_dir)
        except Exception as exc:
            logger.warning("[DEBUG] lesson_delete.cleanup_failed lesson_id=%s dir=%s error=%s", lesson_id, lesson_dir, exc)


def delete_lesson_for_user(*, db: Session, lesson: Lesson) -> None:
    lesson_dir = _delete_lesson_row(db=db, lesson=lesson)
    db.commit()
    invalidate_lesson_related_queries(int(lesson.user_id))
    _cleanup_lesson_dir(lesson_dir, lesson_id=int(lesson.id))


def bulk_delete_lessons_for_user(*, db: Session, user_id: int, lesson_ids: list[int] | None = None, delete_all: bool = False) -> dict[str, object]:
    normalized_ids = sorted({int(item) for item in list(lesson_ids or []) if int(item) > 0})
    if not delete_all and not normalized_ids:
        return {"deleted_ids": [], "deleted_count": 0, "failed_ids": []}

    query = select(Lesson).where(Lesson.user_id == int(user_id))
    if not delete_all:
        query = query.where(Lesson.id.in_(normalized_ids))
    lessons = list(db.scalars(query).all())
    if not lessons:
        return {"deleted_ids": [], "deleted_count": 0, "failed_ids": normalized_ids if not delete_all else []}

    deleted_ids = [int(item.id) for item in lessons]
    lesson_dirs: list[tuple[int, Path]] = []
    for lesson in lessons:
        lesson_dirs.append((int(lesson.id), _delete_lesson_row(db=db, lesson=lesson)))
    db.commit()
    invalidate_lesson_related_queries(int(user_id))
    for lesson_id, lesson_dir in lesson_dirs:
        _cleanup_lesson_dir(lesson_dir, lesson_id=lesson_id)

    failed_ids = [] if delete_all else [lesson_id for lesson_id in normalized_ids if lesson_id not in deleted_ids]
    return {
        "deleted_ids": deleted_ids,
        "deleted_count": len(deleted_ids),
        "failed_ids": failed_ids,
    }


configure_task_runtime_probe(is_task_active_in_current_process, process_started_at=PROCESS_STARTED_AT)
