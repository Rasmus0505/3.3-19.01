from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_admin_user
from app.core.errors import error_response
from app.core.timezone import now_shanghai_naive, to_shanghai_aware, to_shanghai_naive
from app.db import get_db
from app.models import User
from app.repositories.admin_console import (
    get_admin_lesson_task_log_detail,
    get_admin_overview_data,
    get_admin_user_activity_summary,
    list_admin_lesson_task_logs,
    list_admin_operation_logs,
    list_admin_user_activity,
)
from app.schemas import ErrorResponse
from app.schemas.admin_console import (
    AdminLessonTaskFailureDebug,
    AdminLessonTaskLogDetail,
    AdminLessonTaskLogDetailResponse,
    AdminLessonTaskLogItem,
    AdminLessonTaskRawDebugDeleteResponse,
    AdminLessonTaskTranslationAttempt,
    AdminLessonTaskLogsResponse,
    AdminLessonTaskLogTranslationSummary,
    AdminOperationLogItem,
    AdminOperationLogsResponse,
    AdminOverviewBatchItem,
    AdminOverviewMetrics,
    AdminOverviewResponse,
    AdminUserActivityItem,
    AdminUserActivityResponse,
    AdminUserActivitySummary,
    AdminUserActivitySummaryResponse,
)
from app.services.billing_service import append_admin_operation_log
from app.services.lesson_task_manager import LessonTaskStorageNotReadyError, purge_task_raw_debug

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _now() -> datetime:
    return now_shanghai_naive()


def _to_operation_item(row, operator_email: str | None) -> AdminOperationLogItem:
    return AdminOperationLogItem(
        id=row.id,
        operator_user_id=row.operator_user_id,
        operator_user_email=operator_email,
        action_type=row.action_type,
        target_type=row.target_type,
        target_id=row.target_id,
        before_value=row.before_value,
        after_value=row.after_value,
        note=row.note,
        created_at=to_shanghai_aware(row.created_at),
    )


def _infer_current_stage(stages: list[dict] | None) -> str:
    safe_stages = [dict(item) for item in list(stages or []) if isinstance(item, dict)]
    for target_status in ("running", "failed", "pending"):
        for item in safe_stages:
            if str(item.get("status") or "") == target_status:
                return str(item.get("key") or "")
    if safe_stages:
        return str(safe_stages[-1].get("key") or "")
    return ""


def _to_translation_summary(payload: dict | None) -> AdminLessonTaskLogTranslationSummary | None:
    if not isinstance(payload, dict):
        return None
    usage = dict(payload.get("usage") or {}) if isinstance(payload.get("usage"), dict) else {}
    return AdminLessonTaskLogTranslationSummary(
        total_sentences=int(payload.get("total_sentences", 0) or 0),
        failed_sentences=int(payload.get("failed_sentences", 0) or 0),
        request_count=int(payload.get("request_count", 0) or 0),
        success_request_count=int(payload.get("success_request_count", 0) or 0),
        total_tokens=int(usage.get("total_tokens", 0) or 0),
        charged_points=int(usage.get("charged_points", 0) or 0),
        latest_error_summary=str(payload.get("latest_error_summary") or ""),
    )


def _to_failure_debug(payload: dict | None, failed_at: datetime | None) -> AdminLessonTaskFailureDebug | None:
    if not isinstance(payload, dict):
        return None
    normalized = dict(payload)
    normalized["failed_at"] = to_shanghai_aware(failed_at) if failed_at else normalized.get("failed_at")
    return AdminLessonTaskFailureDebug(**normalized)


def _to_lesson_task_log_item(row, owner_email: str | None) -> AdminLessonTaskLogItem:
    failure_debug_payload = dict(row.failure_debug_json or {}) if isinstance(row.failure_debug_json, dict) else None
    translation_debug_payload = dict(row.translation_debug_json or {}) if isinstance(row.translation_debug_json, dict) else None
    return AdminLessonTaskLogItem(
        id=row.id,
        task_id=row.task_id,
        owner_user_id=int(row.owner_user_id),
        user_email=owner_email,
        lesson_id=int(row.lesson_id) if row.lesson_id is not None else None,
        source_filename=row.source_filename,
        asr_model=row.asr_model,
        status=row.status,
        current_stage=_infer_current_stage(row.stages_json),
        error_code=str(row.error_code or ""),
        message=str(row.message or ""),
        detail_excerpt=str((failure_debug_payload or {}).get("detail_excerpt") or ""),
        traceback_excerpt=str((failure_debug_payload or {}).get("traceback_excerpt") or ""),
        last_progress_text=str((failure_debug_payload or {}).get("last_progress_text") or ""),
        exception_type=str((failure_debug_payload or {}).get("exception_type") or ""),
        resume_available=bool(row.resume_available),
        translation_debug_summary=_to_translation_summary(translation_debug_payload),
        failure_debug=_to_failure_debug(failure_debug_payload, row.failed_at),
        has_raw_debug=bool(row.asr_raw_json),
        raw_debug_purged_at=to_shanghai_aware(row.raw_debug_purged_at),
        artifact_expires_at=to_shanghai_aware(row.artifact_expires_at),
        failed_at=to_shanghai_aware(row.failed_at),
        created_at=to_shanghai_aware(row.created_at),
        updated_at=to_shanghai_aware(row.updated_at),
    )


def _to_translation_attempt_item(row) -> AdminLessonTaskTranslationAttempt:
    return AdminLessonTaskTranslationAttempt(
        id=int(row.id),
        sentence_idx=int(row.sentence_idx),
        attempt_no=int(row.attempt_no),
        provider=str(row.provider or ""),
        model_name=str(row.model_name or ""),
        base_url=str(row.base_url or ""),
        input_text_preview=str(row.input_text_preview or ""),
        provider_request_id=row.provider_request_id,
        status_code=row.status_code,
        finish_reason=row.finish_reason,
        prompt_tokens=int(row.prompt_tokens or 0),
        completion_tokens=int(row.completion_tokens or 0),
        total_tokens=int(row.total_tokens or 0),
        success=bool(row.success),
        error_code=row.error_code,
        error_message=str(row.error_message or ""),
        raw_request_text=str(row.raw_request_text or ""),
        raw_response_text=str(row.raw_response_text or ""),
        raw_error_text=str(row.raw_error_text or ""),
        started_at=to_shanghai_aware(row.started_at),
        finished_at=to_shanghai_aware(row.finished_at),
        created_at=to_shanghai_aware(row.created_at),
    )


def _to_user_activity_item(row) -> AdminUserActivityItem:
    return AdminUserActivityItem(
        id=int(row.id),
        email=str(row.email or ""),
        username=str(row.username or ""),  # 新增 per D-01
        created_at=to_shanghai_aware(row.created_at),
        last_login_at=to_shanghai_aware(row.last_login_at) if row.last_login_at else None,
        balance_points=int(row.balance_points or 0),
        login_days=int(row.login_days or 0),
        login_events=int(row.login_events or 0),
        lessons_created=int(row.lessons_created or 0),
        consumed_points=int(row.consumed_points or 0),
        redeemed_points=int(row.redeemed_points or 0),
    )


def _parse_optional_lesson_id(raw_value: str | int | None):
    text_value = str(raw_value or "").strip()
    if not text_value:
        return None, None
    if not text_value.isdigit():
        return None, error_response(400, "INVALID_LESSON_ID", "lesson_id 必须是正整数")
    lesson_id = int(text_value)
    if lesson_id <= 0:
        return None, error_response(400, "INVALID_LESSON_ID", "lesson_id 必须是正整数")
    return lesson_id, None


@router.get("/overview", response_model=AdminOverviewResponse, responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}})
def admin_overview(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    now = _now()
    payload = get_admin_overview_data(db, now=now)
    return AdminOverviewResponse(
        ok=True,
        metrics=AdminOverviewMetrics(**payload["metrics"]),
        recent_batches=[
            AdminOverviewBatchItem(
                id=batch.id,
                batch_name=batch.batch_name,
                status=effective_status,
                generated_count=int(batch.generated_count),
                redeemed_count=int(redeemed_count),
                remaining_count=max(0, int(batch.generated_count) - int(redeemed_count)),
                redeem_rate=round((int(redeemed_count) / int(batch.generated_count)) if int(batch.generated_count) > 0 else 0.0, 4),
                face_value_points=int(batch.face_value_points),
                created_at=to_shanghai_aware(batch.created_at),
                expire_at=to_shanghai_aware(batch.expire_at),
            )
            for batch, redeemed_count, effective_status in payload["recent_batches"]
        ],
        recent_operations=[_to_operation_item(row, operator_email) for row, operator_email in payload["recent_operations"]],
        summary_cards=payload.get("summary_cards", []),
        charts=payload.get("charts", []),
    )


@router.get(
    "/operation-logs",
    response_model=AdminOperationLogsResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_operation_logs(
    operator_email: str = "",
    action_type: str = "all",
    target_type: str = "all",
    page: int = 1,
    page_size: int = 20,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    page = max(page, 1)
    page_size = max(1, min(page_size, 100))
    normalized_date_from = to_shanghai_naive(date_from)
    normalized_date_to = to_shanghai_naive(date_to)
    payload = list_admin_operation_logs(
        db,
        operator_email=operator_email,
        action_type=action_type,
        target_type=target_type,
        date_from=normalized_date_from,
        date_to=normalized_date_to,
        page=page,
        page_size=page_size,
    )
    return AdminOperationLogsResponse(
        ok=True,
        page=page,
        page_size=page_size,
        total=int(payload["total"]),
        items=[_to_operation_item(row, operator_email_value) for row, operator_email_value in payload["rows"]],
        summary_cards=payload.get("summary_cards", []),
        charts=payload.get("charts", []),
    )


@router.get(
    "/lesson-task-logs",
    response_model=AdminLessonTaskLogsResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def admin_lesson_task_logs(
    status: str = "all",
    user_email: str = "",
    task_id: str = "",
    lesson_id: str = "",
    source_filename: str = "",
    page: int = 1,
    page_size: int = 20,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    page = max(page, 1)
    page_size = max(1, min(page_size, 100))
    normalized_lesson_id, parse_error = _parse_optional_lesson_id(lesson_id)
    if parse_error is not None:
        return parse_error
    normalized_date_from = to_shanghai_naive(date_from)
    normalized_date_to = to_shanghai_naive(date_to)
    try:
        payload = list_admin_lesson_task_logs(
            db,
            status=status,
            user_email=user_email,
            task_id=task_id,
            lesson_id=normalized_lesson_id,
            source_filename=source_filename,
            date_from=normalized_date_from,
            date_to=normalized_date_to,
            page=page,
            page_size=page_size,
        )
    except LessonTaskStorageNotReadyError as exc:
        return error_response(503, exc.code, exc.message, exc.detail)
    items: list[AdminLessonTaskLogItem] = []
    for row, owner_email in payload["rows"]:
        items.append(_to_lesson_task_log_item(row, owner_email))
    return AdminLessonTaskLogsResponse(
        ok=True,
        page=page,
        page_size=page_size,
        total=int(payload["total"]),
        items=items,
        summary_cards=payload.get("summary_cards", []),
        charts=payload.get("charts", []),
    )


@router.get(
    "/lesson-task-logs/{task_id}",
    response_model=AdminLessonTaskLogDetailResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def admin_lesson_task_log_detail(
    task_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    try:
        payload = get_admin_lesson_task_log_detail(db, task_id=task_id)
    except LessonTaskStorageNotReadyError as exc:
        return error_response(503, exc.code, exc.message, exc.detail)
    if payload is None:
        return error_response(404, "TASK_NOT_FOUND", "任务不存在")

    item = _to_lesson_task_log_item(payload["row"], payload.get("user_email"))
    detail_payload = item.model_dump()
    detail_payload["has_raw_debug"] = bool(payload.get("has_raw_debug"))
    detail_payload["asr_raw"] = dict(payload["row"].asr_raw_json or {}) if isinstance(payload["row"].asr_raw_json, dict) else None
    detail_payload["translation_attempts"] = [_to_translation_attempt_item(row) for row in payload.get("translation_attempts", [])]
    detail = AdminLessonTaskLogDetail(**detail_payload)
    return AdminLessonTaskLogDetailResponse(ok=True, item=detail)


@router.delete(
    "/lesson-task-logs/{task_id}/raw",
    response_model=AdminLessonTaskRawDebugDeleteResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def admin_delete_lesson_task_raw_debug(
    task_id: str,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    try:
        detail = get_admin_lesson_task_log_detail(db, task_id=task_id)
    except LessonTaskStorageNotReadyError as exc:
        return error_response(503, exc.code, exc.message, exc.detail)
    if detail is None:
        return error_response(404, "TASK_NOT_FOUND", "任务不存在")

    row = detail["row"]
    before_value = {
        "task_status": str(row.status or ""),
        "had_asr_raw": bool(row.asr_raw_json),
        "translation_attempt_count": len(detail.get("translation_attempts", [])),
        "raw_debug_purged_at": to_shanghai_aware(row.raw_debug_purged_at).isoformat() if row.raw_debug_purged_at else "",
    }
    purge_result = purge_task_raw_debug(task_id, db=db)
    append_admin_operation_log(
        db,
        operator_user_id=current_admin.id,
        action_type="lesson_task_raw_debug_purge",
        target_type="lesson_task",
        target_id=task_id,
        before_value=before_value,
        after_value={
            "raw_debug_purged_at": to_shanghai_aware(purge_result["raw_debug_purged_at"]).isoformat() if purge_result and purge_result.get("raw_debug_purged_at") else "",
            "translation_attempt_count": int(purge_result.get("translation_attempt_count", 0)) if purge_result else 0,
        },
        note="purge_raw_generation_debug",
    )
    db.commit()
    return AdminLessonTaskRawDebugDeleteResponse(
        ok=True,
        task_id=task_id,
        raw_debug_purged_at=to_shanghai_aware(purge_result["raw_debug_purged_at"]) if purge_result and purge_result.get("raw_debug_purged_at") else None,
    )


@router.get(
    "/user-activity",
    response_model=AdminUserActivityResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_user_activity(
    keyword: str = "",
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "login_events",
    sort_dir: str = "desc",
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    page = max(page, 1)
    page_size = max(1, min(page_size, 100))
    now = _now()
    normalized_date_from = to_shanghai_naive(date_from)
    if normalized_date_from is None:
        normalized_date_from = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=6)
    normalized_date_to = to_shanghai_naive(date_to) or now
    payload = list_admin_user_activity(
        db,
        keyword=keyword,
        date_from=normalized_date_from,
        date_to=normalized_date_to,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    return AdminUserActivityResponse(
        ok=True,
        page=page,
        page_size=page_size,
        total=int(payload["total"]),
        range_start=to_shanghai_aware(payload["range_start"]),
        range_end=to_shanghai_aware(payload["range_end"]),
        items=[_to_user_activity_item(row) for row in payload["rows"]],
        summary_cards=payload.get("summary_cards", []),
        charts=payload.get("charts", []),
    )


@router.get(
    "/users/{user_id}/summary",
    response_model=AdminUserActivitySummaryResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_user_activity_summary(
    user_id: int,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    payload = get_admin_user_activity_summary(
        db,
        user_id=user_id,
        now=_now(),
        date_from=to_shanghai_naive(date_from),
        date_to=to_shanghai_naive(date_to),
    )
    return AdminUserActivitySummaryResponse(
        ok=True,
        summary=AdminUserActivitySummary(
            user_id=payload["user_id"],
            lesson_count=payload["lesson_count"],
            latest_lesson_created_at=to_shanghai_aware(payload["latest_lesson_created_at"]) if payload["latest_lesson_created_at"] else None,
            latest_wallet_event_at=to_shanghai_aware(payload["latest_wallet_event_at"]) if payload["latest_wallet_event_at"] else None,
            latest_redeem_at=to_shanghai_aware(payload["latest_redeem_at"]) if payload["latest_redeem_at"] else None,
            latest_login_at=to_shanghai_aware(payload["latest_login_at"]) if payload["latest_login_at"] else None,
            consumed_points_30d=payload["consumed_points_30d"],
            redeemed_points_30d=payload["redeemed_points_30d"],
            range_start=to_shanghai_aware(payload["range_start"]) if payload["range_start"] else None,
            range_end=to_shanghai_aware(payload["range_end"]) if payload["range_end"] else None,
            login_days_in_range=int(payload["login_days_in_range"] or 0),
            login_events_in_range=int(payload["login_events_in_range"] or 0),
            lessons_created_in_range=int(payload["lessons_created_in_range"] or 0),
            consumed_points_in_range=int(payload["consumed_points_in_range"] or 0),
            redeemed_points_in_range=int(payload["redeemed_points_in_range"] or 0),
        ),
    )
