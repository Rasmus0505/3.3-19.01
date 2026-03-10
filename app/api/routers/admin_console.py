from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_admin_user
from app.core.errors import error_response
from app.core.timezone import now_shanghai_naive, to_shanghai_aware, to_shanghai_naive
from app.db import get_db
from app.models import User
from app.repositories.admin_console import get_admin_overview_data, get_admin_user_activity_summary, list_admin_lesson_task_logs, list_admin_operation_logs
from app.schemas import ErrorResponse
from app.services.lesson_task_manager import LessonTaskStorageNotReadyError
from app.schemas.admin_console import (
    AdminLessonTaskFailureDebug,
    AdminLessonTaskLogItem,
    AdminLessonTaskLogsResponse,
    AdminLessonTaskLogTranslationSummary,
    AdminOperationLogItem,
    AdminOperationLogsResponse,
    AdminOverviewBatchItem,
    AdminOverviewMetrics,
    AdminOverviewResponse,
    AdminUserActivitySummary,
    AdminUserActivitySummaryResponse,
)
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
    total, rows = list_admin_operation_logs(
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
        total=total,
        items=[_to_operation_item(row, operator_email_value) for row, operator_email_value in rows],
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
        total, rows = list_admin_lesson_task_logs(
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
    for row, owner_email in rows:
        failure_debug_payload = dict(row.failure_debug_json or {}) if isinstance(row.failure_debug_json, dict) else None
        translation_debug_payload = dict(row.translation_debug_json or {}) if isinstance(row.translation_debug_json, dict) else None
        items.append(
            AdminLessonTaskLogItem(
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
                artifact_expires_at=to_shanghai_aware(row.artifact_expires_at),
                failed_at=to_shanghai_aware(row.failed_at),
                created_at=to_shanghai_aware(row.created_at),
                updated_at=to_shanghai_aware(row.updated_at),
            )
        )
    return AdminLessonTaskLogsResponse(ok=True, page=page, page_size=page_size, total=total, items=items)


@router.get(
    "/users/{user_id}/summary",
    response_model=AdminUserActivitySummaryResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_user_activity_summary(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    payload = get_admin_user_activity_summary(db, user_id=user_id, now=_now())
    return AdminUserActivitySummaryResponse(
        ok=True,
        summary=AdminUserActivitySummary(
            user_id=payload["user_id"],
            lesson_count=payload["lesson_count"],
            latest_lesson_created_at=to_shanghai_aware(payload["latest_lesson_created_at"]) if payload["latest_lesson_created_at"] else None,
            latest_wallet_event_at=to_shanghai_aware(payload["latest_wallet_event_at"]) if payload["latest_wallet_event_at"] else None,
            latest_redeem_at=to_shanghai_aware(payload["latest_redeem_at"]) if payload["latest_redeem_at"] else None,
            consumed_points_30d=payload["consumed_points_30d"],
            redeemed_points_30d=payload["redeemed_points_30d"],
        ),
    )
