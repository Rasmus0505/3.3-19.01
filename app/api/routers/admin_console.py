from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_admin_user
from app.core.timezone import now_shanghai_naive, to_shanghai_aware, to_shanghai_naive
from app.db import get_db
from app.models import User
from app.repositories.admin_console import get_admin_overview_data, get_admin_user_activity_summary, list_admin_operation_logs
from app.schemas import ErrorResponse
from app.schemas.admin_console import (
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
