from __future__ import annotations

from datetime import datetime
import logging

from sqlalchemy import delete, desc, func, inspect, select, update
from sqlalchemy.orm import Session

from app.db import APP_SCHEMA
from app.models import (
    AdminOperationLog,
    BillingModelRate,
    Lesson,
    RedeemCode,
    RedeemCodeAttempt,
    RedeemCodeBatch,
    TranslationRequestLog,
    User,
    WalletAccount,
    WalletLedger,
)

logger = logging.getLogger(__name__)


def list_admin_users(
    db: Session,
    *,
    keyword: str,
    page: int,
    page_size: int,
    sort_by: str,
    sort_dir: str,
) -> tuple[int, list[tuple[int, str, datetime, int]]]:
    balance_col = func.coalesce(WalletAccount.balance_points, 0)
    base_stmt = select(User.id, User.email, User.created_at, balance_col.label("balance_points")).outerjoin(
        WalletAccount, WalletAccount.user_id == User.id
    )
    count_stmt = select(func.count(User.id))

    if keyword.strip():
        pattern = f"%{keyword.strip().lower()}%"
        base_stmt = base_stmt.where(func.lower(User.email).like(pattern))
        count_stmt = count_stmt.where(func.lower(User.email).like(pattern))

    sort_key = (sort_by or "created_at").strip().lower()
    sort_desc = (sort_dir or "desc").strip().lower() != "asc"
    if sort_key == "email":
        col = User.email
    elif sort_key == "balance_points":
        col = balance_col
    else:
        col = User.created_at
    order_col = desc(col) if sort_desc else col.asc()

    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(
        base_stmt.order_by(order_col, desc(User.id)).offset((page - 1) * page_size).limit(page_size)
    ).all()
    items = [(row.id, row.email, row.created_at, int(row.balance_points or 0)) for row in rows]
    return total, items


def list_wallet_logs(
    db: Session,
    *,
    user_email: str,
    event_type: str,
    page: int,
    page_size: int,
    date_from: datetime | None,
    date_to: datetime | None,
) -> tuple[int, list[tuple[WalletLedger, str]]]:
    base = select(WalletLedger, User.email).join(User, User.id == WalletLedger.user_id)
    count_stmt = select(func.count(WalletLedger.id)).join(User, User.id == WalletLedger.user_id)

    if user_email.strip():
        pattern = f"%{user_email.strip().lower()}%"
        base = base.where(func.lower(User.email).like(pattern))
        count_stmt = count_stmt.where(func.lower(User.email).like(pattern))

    normalized_event = event_type.strip().lower()
    if normalized_event and normalized_event != "all":
        base = base.where(WalletLedger.event_type == normalized_event)
        count_stmt = count_stmt.where(WalletLedger.event_type == normalized_event)

    if date_from:
        base = base.where(WalletLedger.created_at >= date_from)
        count_stmt = count_stmt.where(WalletLedger.created_at >= date_from)
    if date_to:
        base = base.where(WalletLedger.created_at <= date_to)
        count_stmt = count_stmt.where(WalletLedger.created_at <= date_to)

    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(
        base.order_by(WalletLedger.created_at.desc(), WalletLedger.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return total, rows


def list_translation_logs(
    db: Session,
    *,
    user_email: str,
    task_id: str,
    lesson_id: int | None,
    success: str,
    page: int,
    page_size: int,
    date_from: datetime | None,
    date_to: datetime | None,
) -> tuple[int, list[tuple[TranslationRequestLog, str | None]]]:
    bind = db.get_bind()
    inspector = inspect(bind)
    schema = None if bind.dialect.name == "sqlite" else APP_SCHEMA
    if not inspector.has_table(TranslationRequestLog.__tablename__, schema=schema):
        logger.warning("[DEBUG] translation_logs.table_missing table=%s", TranslationRequestLog.__tablename__)
        return 0, []

    base = select(TranslationRequestLog, User.email).outerjoin(User, User.id == TranslationRequestLog.user_id)
    count_stmt = select(func.count(TranslationRequestLog.id)).outerjoin(User, User.id == TranslationRequestLog.user_id)

    if user_email.strip():
        pattern = f"%{user_email.strip().lower()}%"
        base = base.where(func.lower(User.email).like(pattern))
        count_stmt = count_stmt.where(func.lower(User.email).like(pattern))

    if task_id.strip():
        base = base.where(TranslationRequestLog.task_id == task_id.strip())
        count_stmt = count_stmt.where(TranslationRequestLog.task_id == task_id.strip())

    if lesson_id is not None:
        base = base.where(TranslationRequestLog.lesson_id == lesson_id)
        count_stmt = count_stmt.where(TranslationRequestLog.lesson_id == lesson_id)

    normalized_success = success.strip().lower()
    if normalized_success in {"success", "true", "1"}:
        base = base.where(TranslationRequestLog.success.is_(True))
        count_stmt = count_stmt.where(TranslationRequestLog.success.is_(True))
    elif normalized_success in {"failed", "false", "0"}:
        base = base.where(TranslationRequestLog.success.is_(False))
        count_stmt = count_stmt.where(TranslationRequestLog.success.is_(False))

    if date_from:
        base = base.where(TranslationRequestLog.created_at >= date_from)
        count_stmt = count_stmt.where(TranslationRequestLog.created_at >= date_from)
    if date_to:
        base = base.where(TranslationRequestLog.created_at <= date_to)
        count_stmt = count_stmt.where(TranslationRequestLog.created_at <= date_to)

    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(
        base.order_by(TranslationRequestLog.created_at.desc(), TranslationRequestLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return total, rows


def _effective_batch_status(batch: RedeemCodeBatch, now: datetime) -> str:
    if batch.status == "expired" or now >= batch.expire_at:
        return "expired"
    return batch.status


def _effective_code_status(code: RedeemCode, batch: RedeemCodeBatch, now: datetime) -> str:
    if code.status == "redeemed":
        return "redeemed"
    if code.status == "abandoned":
        return "abandoned"
    if code.status == "disabled" or batch.status == "paused":
        return "disabled"
    if batch.status == "expired" or now >= batch.expire_at:
        return "expired"
    return "unredeemed"


def list_redeem_batches(
    db: Session,
    *,
    keyword: str,
    status: str,
    page: int,
    page_size: int,
    now: datetime,
) -> tuple[int, list[tuple[RedeemCodeBatch, int, str]]]:
    base_stmt = select(RedeemCodeBatch)
    count_stmt = select(func.count(RedeemCodeBatch.id))

    if keyword.strip():
        pattern = f"%{keyword.strip().lower()}%"
        base_stmt = base_stmt.where(func.lower(RedeemCodeBatch.batch_name).like(pattern))
        count_stmt = count_stmt.where(func.lower(RedeemCodeBatch.batch_name).like(pattern))

    normalized_status = status.strip().lower()
    if normalized_status in {"active", "paused"}:
        base_stmt = base_stmt.where(RedeemCodeBatch.status == normalized_status)
        count_stmt = count_stmt.where(RedeemCodeBatch.status == normalized_status)
    elif normalized_status == "expired":
        base_stmt = base_stmt.where((RedeemCodeBatch.status == "expired") | (RedeemCodeBatch.expire_at <= now))
        count_stmt = count_stmt.where((RedeemCodeBatch.status == "expired") | (RedeemCodeBatch.expire_at <= now))

    total = int(db.scalar(count_stmt) or 0)
    batch_rows = list(
        db.scalars(
            base_stmt.order_by(RedeemCodeBatch.created_at.desc(), RedeemCodeBatch.id.desc()).offset((page - 1) * page_size).limit(page_size)
        ).all()
    )
    batch_ids = [row.id for row in batch_rows]
    if not batch_ids:
        return total, []

    redeemed_map = {
        int(row.batch_id): int(row.redeemed_count)
        for row in db.execute(
            select(RedeemCode.batch_id, func.count(RedeemCode.id).label("redeemed_count"))
            .where(RedeemCode.batch_id.in_(batch_ids), RedeemCode.status == "redeemed")
            .group_by(RedeemCode.batch_id)
        ).all()
    }

    items: list[tuple[RedeemCodeBatch, int, str]] = []
    for row in batch_rows:
        redeemed_count = redeemed_map.get(row.id, 0)
        items.append((row, redeemed_count, _effective_batch_status(row, now)))
    return total, items


def list_redeem_codes(
    db: Session,
    *,
    batch_id: int | None,
    status: str,
    redeem_user_email: str,
    created_from: datetime | None,
    created_to: datetime | None,
    redeemed_from: datetime | None,
    redeemed_to: datetime | None,
    page: int,
    page_size: int,
    now: datetime,
) -> tuple[int, list[tuple[RedeemCode, RedeemCodeBatch, str | None]]]:
    redeemed_user = User.__table__.alias("redeemed_user")

    base = (
        select(RedeemCode, RedeemCodeBatch, redeemed_user.c.email.label("redeemed_email"))
        .join(RedeemCodeBatch, RedeemCodeBatch.id == RedeemCode.batch_id)
        .outerjoin(redeemed_user, redeemed_user.c.id == RedeemCode.redeemed_by_user_id)
    )
    count_stmt = select(func.count(RedeemCode.id)).join(RedeemCodeBatch, RedeemCodeBatch.id == RedeemCode.batch_id).outerjoin(
        redeemed_user, redeemed_user.c.id == RedeemCode.redeemed_by_user_id
    )

    if batch_id is not None:
        base = base.where(RedeemCode.batch_id == batch_id)
        count_stmt = count_stmt.where(RedeemCode.batch_id == batch_id)

    normalized_status = status.strip().lower()
    if normalized_status == "redeemed":
        base = base.where(RedeemCode.status == "redeemed")
        count_stmt = count_stmt.where(RedeemCode.status == "redeemed")
    elif normalized_status == "disabled":
        base = base.where((RedeemCode.status.in_(["disabled", "abandoned"])) | (RedeemCodeBatch.status == "paused"))
        count_stmt = count_stmt.where((RedeemCode.status.in_(["disabled", "abandoned"])) | (RedeemCodeBatch.status == "paused"))
    elif normalized_status == "expired":
        base = base.where(
            RedeemCode.status == "active",
            ((RedeemCodeBatch.status == "expired") | (RedeemCodeBatch.expire_at <= now)),
        )
        count_stmt = count_stmt.where(
            RedeemCode.status == "active",
            ((RedeemCodeBatch.status == "expired") | (RedeemCodeBatch.expire_at <= now)),
        )
    elif normalized_status == "unredeemed":
        base = base.where(
            RedeemCode.status == "active",
            RedeemCodeBatch.status == "active",
            RedeemCodeBatch.expire_at > now,
        )
        count_stmt = count_stmt.where(
            RedeemCode.status == "active",
            RedeemCodeBatch.status == "active",
            RedeemCodeBatch.expire_at > now,
        )
    elif normalized_status == "abandoned":
        base = base.where(RedeemCode.status == "abandoned")
        count_stmt = count_stmt.where(RedeemCode.status == "abandoned")

    if redeem_user_email.strip():
        pattern = f"%{redeem_user_email.strip().lower()}%"
        base = base.where(func.lower(redeemed_user.c.email).like(pattern))
        count_stmt = count_stmt.where(func.lower(redeemed_user.c.email).like(pattern))

    if created_from:
        base = base.where(RedeemCode.created_at >= created_from)
        count_stmt = count_stmt.where(RedeemCode.created_at >= created_from)
    if created_to:
        base = base.where(RedeemCode.created_at <= created_to)
        count_stmt = count_stmt.where(RedeemCode.created_at <= created_to)

    if redeemed_from:
        base = base.where(RedeemCode.redeemed_at >= redeemed_from)
        count_stmt = count_stmt.where(RedeemCode.redeemed_at >= redeemed_from)
    if redeemed_to:
        base = base.where(RedeemCode.redeemed_at <= redeemed_to)
        count_stmt = count_stmt.where(RedeemCode.redeemed_at <= redeemed_to)

    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(
        base.order_by(RedeemCode.created_at.desc(), RedeemCode.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()

    return total, [(row[0], row[1], row.redeemed_email) for row in rows]


def list_unredeemed_codes_for_export(db: Session, *, batch_id: int | None, now: datetime) -> list[tuple[RedeemCode, RedeemCodeBatch]]:
    stmt = (
        select(RedeemCode, RedeemCodeBatch)
        .join(RedeemCodeBatch, RedeemCodeBatch.id == RedeemCode.batch_id)
        .where(
            RedeemCode.status == "active",
            RedeemCodeBatch.status == "active",
            RedeemCodeBatch.expire_at > now,
        )
    )
    if batch_id is not None:
        stmt = stmt.where(RedeemCode.batch_id == batch_id)

    rows = db.execute(stmt.order_by(RedeemCodeBatch.id.asc(), RedeemCode.id.asc())).all()
    return [(row[0], row[1]) for row in rows]


def list_redeem_audit_rows(
    db: Session,
    *,
    user_email: str,
    batch_id: int | None,
    date_from: datetime | None,
    date_to: datetime | None,
    page: int,
    page_size: int,
) -> tuple[int, list[tuple[RedeemCodeAttempt, str | None, str | None]]]:
    user_table = User.__table__.alias("audit_user")
    base = (
        select(RedeemCodeAttempt, user_table.c.email.label("user_email"), RedeemCodeBatch.batch_name.label("batch_name"))
        .outerjoin(user_table, user_table.c.id == RedeemCodeAttempt.user_id)
        .outerjoin(RedeemCodeBatch, RedeemCodeBatch.id == RedeemCodeAttempt.batch_id)
    )
    count_stmt = (
        select(func.count(RedeemCodeAttempt.id))
        .outerjoin(user_table, user_table.c.id == RedeemCodeAttempt.user_id)
        .outerjoin(RedeemCodeBatch, RedeemCodeBatch.id == RedeemCodeAttempt.batch_id)
    )

    if user_email.strip():
        pattern = f"%{user_email.strip().lower()}%"
        base = base.where(func.lower(user_table.c.email).like(pattern))
        count_stmt = count_stmt.where(func.lower(user_table.c.email).like(pattern))

    if batch_id is not None:
        base = base.where(RedeemCodeAttempt.batch_id == batch_id)
        count_stmt = count_stmt.where(RedeemCodeAttempt.batch_id == batch_id)

    if date_from:
        base = base.where(RedeemCodeAttempt.created_at >= date_from)
        count_stmt = count_stmt.where(RedeemCodeAttempt.created_at >= date_from)
    if date_to:
        base = base.where(RedeemCodeAttempt.created_at <= date_to)
        count_stmt = count_stmt.where(RedeemCodeAttempt.created_at <= date_to)

    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(
        base.order_by(RedeemCodeAttempt.created_at.desc(), RedeemCodeAttempt.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return total, [(row[0], row.user_email, row.batch_name) for row in rows]


def list_all_redeem_audit_rows(
    db: Session,
    *,
    user_email: str,
    batch_id: int | None,
    date_from: datetime | None,
    date_to: datetime | None,
) -> list[tuple[RedeemCodeAttempt, str | None, str | None]]:
    user_table = User.__table__.alias("audit_user")
    stmt = (
        select(RedeemCodeAttempt, user_table.c.email.label("user_email"), RedeemCodeBatch.batch_name.label("batch_name"))
        .outerjoin(user_table, user_table.c.id == RedeemCodeAttempt.user_id)
        .outerjoin(RedeemCodeBatch, RedeemCodeBatch.id == RedeemCodeAttempt.batch_id)
    )

    if user_email.strip():
        pattern = f"%{user_email.strip().lower()}%"
        stmt = stmt.where(func.lower(user_table.c.email).like(pattern))

    if batch_id is not None:
        stmt = stmt.where(RedeemCodeAttempt.batch_id == batch_id)

    if date_from:
        stmt = stmt.where(RedeemCodeAttempt.created_at >= date_from)
    if date_to:
        stmt = stmt.where(RedeemCodeAttempt.created_at <= date_to)

    rows = db.execute(stmt.order_by(RedeemCodeAttempt.created_at.desc(), RedeemCodeAttempt.id.desc())).all()
    return [(row[0], row.user_email, row.batch_name) for row in rows]


def list_lesson_ids_for_user(db: Session, user_id: int) -> list[int]:
    return [int(value) for value in db.scalars(select(Lesson.id).where(Lesson.user_id == user_id)).all()]


def clear_wallet_ledger_operator_refs(db: Session, user_id: int) -> int:
    stmt = (
        update(WalletLedger)
        .where(WalletLedger.operator_user_id == user_id, WalletLedger.user_id != user_id)
        .values(operator_user_id=None)
    )
    result = db.execute(stmt)
    return int(result.rowcount or 0)


def clear_redeem_related_user_refs(db: Session, user_id: int) -> int:
    affected = 0

    affected += int(
        db.execute(update(RedeemCodeBatch).where(RedeemCodeBatch.created_by_user_id == user_id).values(created_by_user_id=None)).rowcount
        or 0
    )
    affected += int(
        db.execute(update(RedeemCode).where(RedeemCode.created_by_user_id == user_id).values(created_by_user_id=None)).rowcount or 0
    )
    affected += int(
        db.execute(update(RedeemCode).where(RedeemCode.redeemed_by_user_id == user_id).values(redeemed_by_user_id=None)).rowcount or 0
    )
    affected += int(
        db.execute(update(RedeemCodeAttempt).where(RedeemCodeAttempt.user_id == user_id).values(user_id=None)).rowcount or 0
    )
    affected += int(
        db.execute(update(AdminOperationLog).where(AdminOperationLog.operator_user_id == user_id).values(operator_user_id=None)).rowcount
        or 0
    )
    return affected


def delete_wallet_ledger_for_user(db: Session, user_id: int) -> int:
    result = db.execute(delete(WalletLedger).where(WalletLedger.user_id == user_id))
    return int(result.rowcount or 0)


def clear_billing_rate_updated_by_refs(db: Session, user_id: int) -> int:
    result = db.execute(
        update(BillingModelRate).where(BillingModelRate.updated_by_user_id == user_id).values(updated_by_user_id=None)
    )
    return int(result.rowcount or 0)
