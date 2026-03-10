from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import AdminOperationLog, Lesson, RedeemCodeAttempt, RedeemCodeBatch, TranslationRequestLog, User, WalletLedger
from app.repositories.admin import list_redeem_batches


def _start_of_day(now: datetime) -> datetime:
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def get_admin_overview_data(db: Session, *, now: datetime) -> dict[str, object]:
    today_start = _start_of_day(now)
    last_24_hours = now - timedelta(hours=24)

    today_new_users = int(db.scalar(select(func.count(User.id)).where(User.created_at >= today_start)) or 0)
    today_redeem_points = int(
        db.scalar(
            select(func.coalesce(func.sum(WalletLedger.delta_points), 0)).where(
                WalletLedger.created_at >= today_start,
                WalletLedger.event_type == "redeem_code",
            )
        )
        or 0
    )
    today_spent_points = int(
        db.scalar(
            select(
                func.coalesce(
                    func.sum(case((WalletLedger.delta_points < 0, -WalletLedger.delta_points), else_=0)),
                    0,
                )
            ).where(
                WalletLedger.created_at >= today_start,
                WalletLedger.event_type.in_(["consume", "consume_translate"]),
            )
        )
        or 0
    )
    translation_failures_24h = int(
        db.scalar(
            select(func.count(TranslationRequestLog.id)).where(
                TranslationRequestLog.created_at >= last_24_hours,
                TranslationRequestLog.success.is_(False),
            )
        )
        or 0
    )
    redeem_failures_24h = int(
        db.scalar(
            select(func.count(RedeemCodeAttempt.id)).where(
                RedeemCodeAttempt.created_at >= last_24_hours,
                RedeemCodeAttempt.success.is_(False),
            )
        )
        or 0
    )
    active_batches = int(
        db.scalar(
            select(func.count(RedeemCodeBatch.id)).where(
                RedeemCodeBatch.status == "active",
                RedeemCodeBatch.expire_at > now,
            )
        )
        or 0
    )

    _, recent_batch_rows = list_redeem_batches(
        db,
        keyword="",
        status="all",
        page=1,
        page_size=5,
        now=now,
    )
    recent_operation_rows = db.execute(
        select(AdminOperationLog, User.email.label("operator_email"))
        .outerjoin(User, User.id == AdminOperationLog.operator_user_id)
        .order_by(AdminOperationLog.created_at.desc(), AdminOperationLog.id.desc())
        .limit(6)
    ).all()

    return {
        "metrics": {
            "today_new_users": today_new_users,
            "today_redeem_points": today_redeem_points,
            "today_spent_points": today_spent_points,
            "translation_failures_24h": translation_failures_24h,
            "incidents_24h": translation_failures_24h + redeem_failures_24h,
            "active_batches": active_batches,
        },
        "recent_batches": recent_batch_rows,
        "recent_operations": recent_operation_rows,
    }


def list_admin_operation_logs(
    db: Session,
    *,
    operator_email: str,
    action_type: str,
    target_type: str,
    date_from: datetime | None,
    date_to: datetime | None,
    page: int,
    page_size: int,
) -> tuple[int, list[tuple[AdminOperationLog, str | None]]]:
    operator_user = User.__table__.alias("operator_user")
    base = (
        select(AdminOperationLog, operator_user.c.email.label("operator_email"))
        .outerjoin(operator_user, operator_user.c.id == AdminOperationLog.operator_user_id)
    )
    count_stmt = select(func.count(AdminOperationLog.id)).outerjoin(
        operator_user, operator_user.c.id == AdminOperationLog.operator_user_id
    )

    normalized_operator_email = operator_email.strip().lower()
    if normalized_operator_email:
        pattern = f"%{normalized_operator_email}%"
        base = base.where(func.lower(operator_user.c.email).like(pattern))
        count_stmt = count_stmt.where(func.lower(operator_user.c.email).like(pattern))

    normalized_action_type = action_type.strip().lower()
    if normalized_action_type and normalized_action_type != "all":
        base = base.where(func.lower(AdminOperationLog.action_type) == normalized_action_type)
        count_stmt = count_stmt.where(func.lower(AdminOperationLog.action_type) == normalized_action_type)

    normalized_target_type = target_type.strip().lower()
    if normalized_target_type and normalized_target_type != "all":
        base = base.where(func.lower(AdminOperationLog.target_type) == normalized_target_type)
        count_stmt = count_stmt.where(func.lower(AdminOperationLog.target_type) == normalized_target_type)

    if date_from:
        base = base.where(AdminOperationLog.created_at >= date_from)
        count_stmt = count_stmt.where(AdminOperationLog.created_at >= date_from)
    if date_to:
        base = base.where(AdminOperationLog.created_at <= date_to)
        count_stmt = count_stmt.where(AdminOperationLog.created_at <= date_to)

    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(
        base.order_by(AdminOperationLog.created_at.desc(), AdminOperationLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return total, [(row[0], row.operator_email) for row in rows]


def get_admin_user_activity_summary(db: Session, *, user_id: int, now: datetime) -> dict[str, object]:
    since_30_days = now - timedelta(days=30)
    latest_lesson_created_at = db.scalar(select(func.max(Lesson.created_at)).where(Lesson.user_id == user_id))
    latest_wallet_event_at = db.scalar(select(func.max(WalletLedger.created_at)).where(WalletLedger.user_id == user_id))
    latest_redeem_at = db.scalar(
        select(func.max(WalletLedger.created_at)).where(
            WalletLedger.user_id == user_id,
            WalletLedger.event_type == "redeem_code",
        )
    )
    lesson_count = int(db.scalar(select(func.count(Lesson.id)).where(Lesson.user_id == user_id)) or 0)
    consumed_points_30d = int(
        db.scalar(
            select(
                func.coalesce(
                    func.sum(case((WalletLedger.delta_points < 0, -WalletLedger.delta_points), else_=0)),
                    0,
                )
            ).where(
                WalletLedger.user_id == user_id,
                WalletLedger.created_at >= since_30_days,
                WalletLedger.event_type.in_(["consume", "consume_translate"]),
            )
        )
        or 0
    )
    redeemed_points_30d = int(
        db.scalar(
            select(func.coalesce(func.sum(WalletLedger.delta_points), 0)).where(
                WalletLedger.user_id == user_id,
                WalletLedger.created_at >= since_30_days,
                WalletLedger.event_type == "redeem_code",
            )
        )
        or 0
    )
    return {
        "user_id": user_id,
        "lesson_count": lesson_count,
        "latest_lesson_created_at": latest_lesson_created_at,
        "latest_wallet_event_at": latest_wallet_event_at,
        "latest_redeem_at": latest_redeem_at,
        "consumed_points_30d": consumed_points_30d,
        "redeemed_points_30d": redeemed_points_30d,
    }
