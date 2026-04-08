"""钱包服务 - 计费模块。

提供点数钱包的完整操作功能。

此文件是从 app/services/billing.py 中提取的钱包相关逻辑。
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_CEILING
from math import ceil
from typing import Iterable

from sqlalchemy import delete, func, inspect, select, text
from sqlalchemy.orm import Session

from app.models import (
    AdminOperationLog,
    BillingModelRate,
    WalletAccount,
    WalletLedger,
)
from app.models.billing import cents_to_rate_yuan, normalize_rate_yuan as model_normalize_rate_yuan, rate_yuan_to_compat_cents
from app.repositories.billing_rates import list_billing_rates as query_billing_rates
from app.core.timezone import now_shanghai_naive


logger = logging.getLogger(__name__)


# ── 异常定义 ───────────────────────────────────────────────────────────────


class BillingError(Exception):
    """计费相关异常。"""

    def __init__(self, code: str, message: str, detail: str = ""):
        self.code = code
        self.message = message
        self.detail = detail
        super().__init__(message)


# ── 工具函数 ───────────────────────────────────────────────────────────────


def _now() -> datetime:
    return now_shanghai_naive()


def yuan_to_compat_cents(value: object) -> int:
    """将元转换为兼容的 cents 表示。"""
    if value is None:
        return 0
    try:
        return rate_yuan_to_compat_cents(Decimal(str(value)))
    except Exception:
        return 0


# ── 点数计算 ───────────────────────────────────────────────────────────────


def calculate_amount_by_duration_ms(duration_ms: int, points_per_minute: int) -> int:
    """按音频时长计算点数消耗。"""
    if duration_ms <= 0 or points_per_minute <= 0:
        return 0
    minutes = duration_ms / 60000.0
    return int(minutes * points_per_minute + 0.5)


def calculate_cost_by_tokens(total_tokens: int, cost_per_1k_tokens_cents: int) -> int:
    """按 token 数量计算成本（cents）。"""
    if total_tokens <= 0 or cost_per_1k_tokens_cents <= 0:
        return 0
    return int(total_tokens / 1000.0 * cost_per_1k_tokens_cents + 0.5)


def calculate_points(
    duration_ms: int,
    points_per_minute: int,
    *,
    price_per_minute_yuan: object | None = None,
) -> int:
    """计算课程消耗的点数。

    支持两种模式：
    - 旧模式：传入 points_per_minute（每分钟点数）
    - 新模式：传入 price_per_minute_yuan（每分钟价格，元）
    """
    if duration_ms <= 0:
        return 0

    if price_per_minute_yuan is not None:
        rate_yuan = model_normalize_rate_yuan(price_per_minute_yuan)
        if rate_yuan <= 0:
            return 0
        seconds = ceil(duration_ms / 1000)
        amount_yuan = (Decimal(seconds) * rate_yuan) / Decimal("60")
        return int((amount_yuan * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_CEILING))

    if points_per_minute <= 0:
        return 0
    minutes = duration_ms / 60000.0
    return int(minutes * points_per_minute + 0.5)


def calculate_token_points(total_tokens: int, points_per_1k_tokens: int) -> int:
    """计算 token 消耗的点数。"""
    if total_tokens <= 0 or points_per_1k_tokens <= 0:
        return 0
    return int(total_tokens / 1000.0 * points_per_1k_tokens + 0.5)


def calculate_llm_cost_by_tokens(
    total_tokens: int,
    cost_per_1k_tokens_input_cents: int,
    cost_per_1k_tokens_output_cents: int,
) -> int:
    """计算 LLM token 消耗的成本（假设 input/output 各占一半）。"""
    if total_tokens <= 0:
        return 0
    half = total_tokens // 2
    input_cost = calculate_cost_by_tokens(half, cost_per_1k_tokens_input_cents)
    output_cost = calculate_cost_by_tokens(total_tokens - half, cost_per_1k_tokens_output_cents)
    return input_cost + output_cost


def calculate_llm_charge_by_tokens(total_tokens: int, points_per_1k_tokens: int) -> int:
    """计算 LLM token 消耗的点数。"""
    return calculate_token_points(total_tokens, points_per_1k_tokens)


# ── 数据库 Schema 确保 ─────────────────────────────────────────────────────


def _ensure_legacy_sqlite_wallet_ledger_event_types(db: Session) -> None:
    """确保 SQLite wallet_ledger 表有 event_types 列。"""
    from sqlalchemy import text

    inspector = inspect(db.bind)
    tables = inspector.get_table_names()
    if "wallet_ledger" not in tables:
        return

    columns = {c["name"] for c in inspector.get_columns("wallet_ledger")}
    if "event_types" in columns:
        return

    with db.bind.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE wallet_ledger ADD COLUMN event_types TEXT"))
            conn.commit()
        except Exception:
            pass


# ── 钱包操作 ───────────────────────────────────────────────────────────────


def get_or_create_wallet_account(db: Session, user_id: int, *, for_update: bool = False) -> WalletAccount:
    """获取或创建用户钱包账户。"""
    stmt = select(WalletAccount).where(WalletAccount.user_id == user_id)
    if for_update:
        stmt = stmt.with_for_update()
    account = db.scalars(stmt).first()
    if account is None:
        account = WalletAccount(user_id=user_id, balance=0)
        db.add(account)
        db.flush()
    return account


def get_model_rate(db: Session, model_name: str, *, require_active: bool = True) -> BillingModelRate:
    """获取模型费率。"""
    stmt = select(BillingModelRate).where(BillingModelRate.model_name == model_name)
    if require_active:
        stmt = stmt.where(BillingModelRate.is_active == True)  # noqa: E712
    rate = db.scalars(stmt).first()
    if rate is None:
        raise BillingError("BILLING_RATE_NOT_FOUND", f"未找到模型 {model_name} 的费率")
    return rate


def _append_ledger(
    db: Session,
    account: WalletAccount,
    event: str,
    delta_points: int,
    note: str = "",
    extra: dict | None = None,
) -> WalletLedger:
    """追加钱包流水记录。"""
    ledger = WalletLedger(
        user_id=account.user_id,
        balance_after=account.balance + delta_points,
        event=event,
        delta_points=delta_points,
        note=note,
        event_types=extra.get("event_types", "") if extra else "",
    )
    db.add(ledger)
    return ledger


def reserve_points(
    db: Session,
    user_id: int,
    points: int,
    reason: str = "",
    duration_seconds: int = 3600,
) -> tuple[WalletAccount, int]:
    """预扣点数。"""
    if points <= 0:
        raise BillingError("INVALID_POINTS", f"预扣点数必须大于 0: {points}")

    account = get_or_create_wallet_account(db, user_id, for_update=True)
    new_balance = account.balance - points
    if new_balance < 0:
        raise BillingError("INSUFFICIENT_BALANCE", f"余额不足：需要 {points} 点，当前 {account.balance} 点")

    ledger = _append_ledger(
        db,
        account,
        "reserve",
        -points,
        note=reason,
        extra={"event_types": "reserve"},
    )
    account.balance = new_balance
    db.flush()

    # 设置过期时间
    expire_at = _now() + timedelta(seconds=duration_seconds)
    return account, ledger.id


def record_consume(
    db: Session,
    user_id: int,
    points: int,
    reason: str = "",
) -> WalletAccount:
    """记录实际消耗。"""
    if points <= 0:
        raise BillingError("INVALID_POINTS", f"消耗点数必须大于 0: {points}")

    account = get_or_create_wallet_account(db, user_id, for_update=True)
    new_balance = account.balance - points
    if new_balance < 0:
        raise BillingError("INSUFFICIENT_BALANCE", f"余额不足：需要 {points} 点，当前 {account.balance} 点")

    ledger = _append_ledger(
        db,
        account,
        "consume",
        -points,
        note=reason,
        extra={"event_types": "consume"},
    )
    account.balance = new_balance
    db.flush()
    return account


def consume_points(
    db: Session,
    user_id: int,
    points: int,
    reason: str = "",
    duration_ms: int = 0,
    model_name: str = "",
) -> WalletAccount:
    """直接消耗点数（不经过预扣）。"""
    if points <= 0:
        raise BillingError("INVALID_POINTS", f"消耗点数必须大于 0: {points}")

    account = get_or_create_wallet_account(db, user_id, for_update=True)
    new_balance = account.balance - points
    if new_balance < 0:
        raise BillingError("INSUFFICIENT_BALANCE", f"余额不足：需要 {points} 点，当前 {account.balance} 点")

    note = reason
    if duration_ms > 0 and model_name:
        note = f"{reason} ({model_name}, {duration_ms}ms)"

    ledger = _append_ledger(
        db,
        account,
        "consume",
        -points,
        note=note,
        extra={"event_types": "consume"},
    )
    account.balance = new_balance
    db.flush()
    return account


def refund_points(
    db: Session,
    user_id: int,
    points: int,
    reason: str = "",
) -> WalletAccount:
    """退还点数。"""
    if points <= 0:
        raise BillingError("INVALID_POINTS", f"退还点数必须大于 0: {points}")

    account = get_or_create_wallet_account(db, user_id, for_update=True)
    ledger = _append_ledger(
        db,
        account,
        "refund",
        points,
        note=reason,
        extra={"event_types": "refund"},
    )
    account.balance += points
    db.flush()
    return account


def refund_points_by_event(
    db: Session,
    user_id: int,
    reserve_ledger_id: int,
    reason: str = "",
) -> WalletAccount:
    """根据预扣记录退还点数。"""
    from sqlalchemy import select

    reserve_ledger = db.scalars(
        select(WalletLedger).where(WalletLedger.id == reserve_ledger_id)
    ).first()

    if reserve_ledger is None:
        raise BillingError("RESERVE_NOT_FOUND", f"预扣记录不存在: {reserve_ledger_id}")

    if reserve_ledger.user_id != user_id:
        raise BillingError("INVALID_USER", "预扣记录不属于该用户")

    if reserve_ledger.event != "reserve":
        raise BillingError("INVALID_EVENT", "该记录不是预扣记录")

    if reserve_ledger.delta_points >= 0:
        raise BillingError("ALREADY_SETTLED", "该预扣记录已被结算")

    return refund_points(db, user_id, abs(reserve_ledger.delta_points), reason=f"退还预扣: {reason}")


def settle_reserved_points(
    db: Session,
    user_id: int,
    reserve_ledger_id: int,
    actual_points: int,
    reason: str = "",
) -> WalletAccount:
    """结算预扣点数（扣除实际消耗）。"""
    from sqlalchemy import select

    reserve_ledger = db.scalars(
        select(WalletLedger).where(WalletLedger.id == reserve_ledger_id)
    ).first()

    if reserve_ledger is None:
        raise BillingError("RESERVE_NOT_FOUND", f"预扣记录不存在: {reserve_ledger_id}")

    if reserve_ledger.user_id != user_id:
        raise BillingError("INVALID_USER", "预扣记录不属于该用户")

    reserved_points = abs(reserve_ledger.delta_points)
    refund_points_amount = reserved_points - actual_points

    # 结算原预扣记录
    reserve_ledger.event = "settled"
    reserve_ledger.note = f"结算: {reason}"

    # 如果有剩余，退还
    if refund_points_amount > 0:
        account = refund_points(db, user_id, refund_points_amount, reason=f"预扣结算退还: {reason}")
    else:
        account = get_or_create_wallet_account(db, user_id)

    return account


def manual_adjust(
    db: Session,
    user_id: int,
    delta_points: int,
    reason: str,
    admin_id: int,
) -> WalletAccount:
    """管理员手动调整点数。"""
    if delta_points == 0:
        raise BillingError("INVALID_POINTS", "调整点数不能为 0")

    account = get_or_create_wallet_account(db, user_id, for_update=True)

    ledger = _append_ledger(
        db,
        account,
        "manual_adjust",
        delta_points,
        note=reason,
        extra={"event_types": "manual_adjust"},
    )
    account.balance += delta_points
    db.flush()

    # 记录管理员操作
    log = AdminOperationLog(
        admin_id=admin_id,
        operation="wallet_adjust",
        target_user_id=user_id,
        detail={"delta": delta_points, "reason": reason, "ledger_id": ledger.id},
    )
    db.add(log)
    db.flush()

    return account


# 向后兼容导出（避免循环导入）
# EVENT_CONSUME_TRANSLATE 现在在 app.services.billing.constants 中定义
from app.services.billing.constants import EVENT_CONSUME_TRANSLATE

__all__ = [
    "BillingError",
    "get_or_create_wallet_account",
    "get_model_rate",
    "reserve_points",
    "record_consume",
    "consume_points",
    "refund_points",
    "refund_points_by_event",
    "settle_reserved_points",
    "manual_adjust",
    "calculate_amount_by_duration_ms",
    "calculate_cost_by_tokens",
    "calculate_points",
    "calculate_token_points",
    "calculate_llm_cost_by_tokens",
    "calculate_llm_charge_by_tokens",
]
