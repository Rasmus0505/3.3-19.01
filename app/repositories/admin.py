from __future__ import annotations

from datetime import datetime

from sqlalchemy import delete, desc, func, select, update
from sqlalchemy.orm import Session

from app.models import BillingModelRate, Lesson, User, WalletAccount, WalletLedger


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


def delete_wallet_ledger_for_user(db: Session, user_id: int) -> int:
    result = db.execute(delete(WalletLedger).where(WalletLedger.user_id == user_id))
    return int(result.rowcount or 0)


def clear_billing_rate_updated_by_refs(db: Session, user_id: int) -> int:
    result = db.execute(
        update(BillingModelRate).where(BillingModelRate.updated_by_user_id == user_id).values(updated_by_user_id=None)
    )
    return int(result.rowcount or 0)
