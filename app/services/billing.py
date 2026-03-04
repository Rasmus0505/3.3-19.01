from __future__ import annotations

from dataclasses import dataclass
from math import ceil
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import BillingModelRate, WalletAccount, WalletLedger


EVENT_RESERVE = "reserve"
EVENT_CONSUME = "consume"
EVENT_REFUND = "refund"
EVENT_MANUAL_ADJUST = "manual_adjust"


DEFAULT_MODEL_RATES: tuple[tuple[str, int], ...] = (
    ("paraformer-v2", 100),
    ("qwen3-asr-flash-filetrans", 130),
)


@dataclass
class BillingError(Exception):
    code: str
    message: str
    detail: str = ""

    def __str__(self) -> str:  # pragma: no cover
        return self.message


def ensure_default_billing_rates(db: Session, defaults: Iterable[tuple[str, int]] = DEFAULT_MODEL_RATES) -> None:
    changed = False
    for model_name, points_per_minute in defaults:
        exists = db.get(BillingModelRate, model_name)
        if exists:
            continue
        db.add(BillingModelRate(model_name=model_name, points_per_minute=points_per_minute, is_active=True))
        changed = True
    if changed:
        db.commit()


def get_or_create_wallet_account(db: Session, user_id: int, *, for_update: bool = False) -> WalletAccount:
    stmt = select(WalletAccount).where(WalletAccount.user_id == user_id)
    if for_update:
        stmt = stmt.with_for_update()
    account = db.scalar(stmt)
    if account:
        return account
    account = WalletAccount(user_id=user_id, balance_points=0)
    db.add(account)
    db.flush()
    return account


def get_model_rate(db: Session, model_name: str, *, require_active: bool = True) -> BillingModelRate:
    rate = db.get(BillingModelRate, model_name)
    if not rate:
        raise BillingError("BILLING_RATE_NOT_FOUND", "未找到模型计费配置", model_name)
    if require_active and not rate.is_active:
        raise BillingError("BILLING_RATE_DISABLED", "模型计费已停用", model_name)
    return rate


def list_public_rates(db: Session) -> list[BillingModelRate]:
    return list(db.scalars(select(BillingModelRate).where(BillingModelRate.is_active.is_(True)).order_by(BillingModelRate.model_name.asc())).all())


def calculate_points(duration_ms: int, points_per_minute: int) -> int:
    if duration_ms <= 0 or points_per_minute <= 0:
        return 0
    seconds = ceil(duration_ms / 1000)
    return ceil((seconds * points_per_minute) / 60)


def _append_ledger(
    db: Session,
    *,
    user_id: int,
    operator_user_id: int | None,
    event_type: str,
    delta_points: int,
    balance_after: int,
    model_name: str | None = None,
    duration_ms: int | None = None,
    lesson_id: int | None = None,
    note: str = "",
) -> WalletLedger:
    item = WalletLedger(
        user_id=user_id,
        operator_user_id=operator_user_id,
        event_type=event_type,
        delta_points=delta_points,
        balance_after=balance_after,
        model_name=model_name,
        duration_ms=duration_ms,
        lesson_id=lesson_id,
        note=note.strip(),
    )
    db.add(item)
    db.flush()
    return item


def reserve_points(
    db: Session,
    *,
    user_id: int,
    points: int,
    model_name: str,
    duration_ms: int,
    note: str = "",
) -> WalletLedger:
    if points < 0:
        raise BillingError("INVALID_POINTS", "预扣点数不能为负数", str(points))
    account = get_or_create_wallet_account(db, user_id, for_update=True)
    if account.balance_points < points:
        raise BillingError(
            "INSUFFICIENT_BALANCE",
            "余额不足，无法创建课程",
            f"balance={account.balance_points}, required={points}",
        )
    account.balance_points -= points
    db.add(account)
    db.flush()
    return _append_ledger(
        db,
        user_id=user_id,
        operator_user_id=None,
        event_type=EVENT_RESERVE,
        delta_points=-points,
        balance_after=account.balance_points,
        model_name=model_name,
        duration_ms=duration_ms,
        note=note,
    )


def record_consume(
    db: Session,
    *,
    user_id: int,
    model_name: str,
    duration_ms: int,
    lesson_id: int,
    note: str = "",
) -> WalletLedger:
    account = get_or_create_wallet_account(db, user_id, for_update=True)
    return _append_ledger(
        db,
        user_id=user_id,
        operator_user_id=None,
        event_type=EVENT_CONSUME,
        delta_points=0,
        balance_after=account.balance_points,
        model_name=model_name,
        duration_ms=duration_ms,
        lesson_id=lesson_id,
        note=note,
    )


def refund_points(
    db: Session,
    *,
    user_id: int,
    points: int,
    model_name: str | None,
    duration_ms: int | None,
    note: str = "",
) -> WalletLedger:
    if points < 0:
        raise BillingError("INVALID_POINTS", "退款点数不能为负数", str(points))
    account = get_or_create_wallet_account(db, user_id, for_update=True)
    account.balance_points += points
    db.add(account)
    db.flush()
    return _append_ledger(
        db,
        user_id=user_id,
        operator_user_id=None,
        event_type=EVENT_REFUND,
        delta_points=points,
        balance_after=account.balance_points,
        model_name=model_name,
        duration_ms=duration_ms,
        note=note,
    )


def manual_adjust(
    db: Session,
    *,
    user_id: int,
    operator_user_id: int,
    delta_points: int,
    note: str,
) -> WalletLedger:
    if not note.strip():
        raise BillingError("INVALID_REASON", "调账备注不能为空")
    account = get_or_create_wallet_account(db, user_id, for_update=True)
    after_balance = account.balance_points + delta_points
    if after_balance < 0:
        raise BillingError(
            "INSUFFICIENT_BALANCE",
            "余额不足，不能扣减到负数",
            f"balance={account.balance_points}, delta={delta_points}",
        )
    account.balance_points = after_balance
    db.add(account)
    db.flush()
    return _append_ledger(
        db,
        user_id=user_id,
        operator_user_id=operator_user_id,
        event_type=EVENT_MANUAL_ADJUST,
        delta_points=delta_points,
        balance_after=account.balance_points,
        note=note,
    )
