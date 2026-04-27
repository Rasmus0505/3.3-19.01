from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, ROUND_CEILING
from math import ceil
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import BillingModelRate, TranslationRequestLog, WalletAccount, WalletLedger

from .common import BillingError, logger, normalize_rate_yuan, now_local
from .constants import (
    EVENT_CONSUME,
    EVENT_MANUAL_ADJUST,
    EVENT_REFUND,
    EVENT_RESERVE,
)


def get_or_create_wallet_account(db: Session, user_id: int, *, for_update: bool = False) -> WalletAccount:
    stmt = select(WalletAccount).where(WalletAccount.user_id == user_id)
    if for_update:
        stmt = stmt.with_for_update()
    account = db.scalar(stmt)
    if account:
        return account
    account = WalletAccount(user_id=user_id, balance_amount_cents=0)
    db.add(account)
    db.flush()
    return account


def calculate_amount_by_duration_ms(
    duration_ms: int,
    price_per_minute_cents: int | None = None,
    *,
    price_per_minute_yuan: object | None = None,
) -> int:
    if duration_ms <= 0:
        return 0
    rate_yuan = normalize_rate_yuan(price_per_minute_yuan, fallback_cents=max(0, int(price_per_minute_cents or 0)))
    if rate_yuan <= 0:
        return 0
    seconds = ceil(duration_ms / 1000)
    amount_yuan = (Decimal(seconds) * rate_yuan) / Decimal("60")
    return int((amount_yuan * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_CEILING))


def calculate_cost_by_tokens(total_tokens: int, cost_per_1k_tokens_cents: int) -> int:
    if total_tokens <= 0 or cost_per_1k_tokens_cents <= 0:
        return 0
    return ceil((int(total_tokens) * int(cost_per_1k_tokens_cents)) / 1000)


def calculate_token_points(total_tokens: int, points_per_1k_tokens: int) -> int:
    return calculate_cost_by_tokens(total_tokens, points_per_1k_tokens)


def calculate_points(
    duration_ms: int,
    points_per_minute: int | None = None,
    *,
    price_per_minute_yuan: object | None = None,
) -> int:
    return calculate_amount_by_duration_ms(
        duration_ms,
        points_per_minute,
        price_per_minute_yuan=price_per_minute_yuan,
    )


def calculate_llm_cost_by_tokens(
    prompt_tokens: int,
    completion_tokens: int,
    cost_per_1k_tokens_input_cents: int,
    cost_per_1k_tokens_output_cents: int,
) -> int:
    input_cost = ceil(prompt_tokens / 1000) * max(0, int(cost_per_1k_tokens_input_cents or 0))
    output_cost = ceil(completion_tokens / 1000) * max(0, int(cost_per_1k_tokens_output_cents or 0))
    return input_cost + output_cost


def calculate_llm_charge_by_tokens(total_tokens: int, points_per_1k_tokens: int) -> int:
    return calculate_token_points(total_tokens, points_per_1k_tokens)


def append_ledger(
    db: Session,
    *,
    user_id: int,
    operator_user_id: int | None,
    event_type: str,
    delta_points: int,
    balance_after: int,
    amount_unit: str = "cents",
    model_name: str | None = None,
    duration_ms: int | None = None,
    lesson_id: int | None = None,
    redeem_batch_id: int | None = None,
    redeem_code_id: int | None = None,
    redeem_code_mask: str | None = None,
    note: str = "",
) -> WalletLedger:
    item = WalletLedger(
        user_id=user_id,
        operator_user_id=operator_user_id,
        event_type=event_type,
        delta_amount_cents=delta_points,
        balance_after_amount_cents=balance_after,
        amount_unit=str(amount_unit or "cents"),
        model_name=model_name,
        duration_ms=duration_ms,
        lesson_id=lesson_id,
        redeem_batch_id=redeem_batch_id,
        redeem_code_id=redeem_code_id,
        redeem_code_mask=redeem_code_mask,
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
    return append_ledger(
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
    return append_ledger(
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


def consume_points(
    db: Session,
    *,
    user_id: int,
    points: int,
    model_name: str | None,
    lesson_id: int | None,
    event_type: str = EVENT_CONSUME,
    duration_ms: int | None = None,
    note: str = "",
) -> WalletLedger | None:
    if points < 0:
        raise BillingError("INVALID_POINTS", "扣点不能为负数", str(points))
    if points == 0:
        return None
    account = get_or_create_wallet_account(db, user_id, for_update=True)
    account.balance_points -= points
    db.add(account)
    db.flush()
    return append_ledger(
        db,
        user_id=user_id,
        operator_user_id=None,
        event_type=event_type,
        delta_points=-points,
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
    return append_ledger(
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


def refund_points_by_event(
    db: Session,
    *,
    user_id: int,
    points: int,
    model_name: str | None,
    lesson_id: int | None,
    event_type: str = EVENT_REFUND,
    duration_ms: int | None = None,
    note: str = "",
) -> WalletLedger | None:
    if points < 0:
        raise BillingError("INVALID_POINTS", "退款点数不能为负数", str(points))
    if points == 0:
        return None
    account = get_or_create_wallet_account(db, user_id, for_update=True)
    account.balance_points += points
    db.add(account)
    db.flush()
    return append_ledger(
        db,
        user_id=user_id,
        operator_user_id=None,
        event_type=event_type,
        delta_points=points,
        balance_after=account.balance_points,
        model_name=model_name,
        duration_ms=duration_ms,
        lesson_id=lesson_id,
        note=note,
    )


def settle_reserved_points(
    db: Session,
    *,
    user_id: int,
    model_name: str,
    reserved_points: int,
    actual_points: int,
    duration_ms: int | None,
    note: str = "",
) -> WalletLedger | None:
    if reserved_points < 0:
        raise BillingError("INVALID_POINTS", "预扣点数不能为负数", str(reserved_points))
    if actual_points < 0:
        raise BillingError("INVALID_POINTS", "实耗点数不能为负数", str(actual_points))

    diff = int(actual_points) - int(reserved_points)
    if diff == 0:
        return None

    if diff < 0:
        return refund_points(
            db,
            user_id=user_id,
            points=abs(diff),
            model_name=model_name,
            duration_ms=duration_ms,
            note=note or "结算退款",
        )

    account = get_or_create_wallet_account(db, user_id, for_update=True)
    account.balance_points -= diff
    db.add(account)
    db.flush()
    return append_ledger(
        db,
        user_id=user_id,
        operator_user_id=None,
        event_type=EVENT_CONSUME,
        delta_points=-diff,
        balance_after=account.balance_points,
        model_name=model_name,
        duration_ms=duration_ms,
        note=note or "结算补扣",
    )


def _coerce_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    text = str(value or "").strip()
    if not text:
        return now_local()
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return now_local()


def append_translation_request_logs(
    db: Session,
    *,
    trace_id: str,
    user_id: int | None,
    task_id: str | None,
    lesson_id: int | None,
    records: Iterable[dict[str, object]],
) -> int:
    inserted = 0
    for item in records:
        row = TranslationRequestLog(
            trace_id=str(trace_id or "").strip(),
            task_id=str(item.get("task_id") or task_id or "").strip() or None,
            lesson_id=int(item["lesson_id"]) if item.get("lesson_id") is not None else lesson_id,
            user_id=int(item["user_id"]) if item.get("user_id") is not None else user_id,
            sentence_idx=int(item.get("sentence_idx", 0)),
            attempt_no=max(1, int(item.get("attempt_no", 1))),
            provider=str(item.get("provider") or "dashscope_compatible"),
            model_name=str(item.get("model_name") or ""),
            base_url=str(item.get("base_url") or ""),
            input_text_preview=str(item.get("input_text_preview") or ""),
            provider_request_id=str(item.get("provider_request_id") or "").strip() or None,
            status_code=int(item["status_code"]) if item.get("status_code") is not None else None,
            finish_reason=str(item.get("finish_reason") or "").strip() or None,
            prompt_tokens=max(0, int(item.get("prompt_tokens", 0) or 0)),
            completion_tokens=max(0, int(item.get("completion_tokens", 0) or 0)),
            total_tokens=max(0, int(item.get("total_tokens", 0) or 0)),
            success=bool(item.get("success")),
            error_code=str(item.get("error_code") or "").strip() or None,
            error_message=str(item.get("error_message") or ""),
            raw_request_text=str(item.get("raw_request_text") or ""),
            raw_response_text=str(item.get("raw_response_text") or ""),
            raw_error_text=str(item.get("raw_error_text") or ""),
            started_at=_coerce_datetime(item.get("started_at")),
            finished_at=_coerce_datetime(item.get("finished_at")),
            created_at=_coerce_datetime(item.get("created_at") or item.get("finished_at")),
        )
        db.add(row)
        inserted += 1
    if inserted:
        db.flush()
    return inserted


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
    return append_ledger(
        db,
        user_id=user_id,
        operator_user_id=operator_user_id,
        event_type=EVENT_MANUAL_ADJUST,
        delta_points=delta_points,
        balance_after=account.balance_points,
        note=note,
    )


def get_model_rate(db: Session, model_name: str, *, require_active: bool = True) -> BillingModelRate:
    rate = db.get(BillingModelRate, model_name)
    if not rate:
        raise BillingError("BILLING_RATE_NOT_FOUND", "未找到模型计费配置", model_name)
    if require_active and not rate.is_active:
        raise BillingError("BILLING_RATE_DISABLED", "模型计费已停用", model_name)
    return rate
