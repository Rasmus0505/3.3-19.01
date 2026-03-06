from __future__ import annotations

import hashlib
import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from math import ceil
from typing import Iterable

from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session

from app.core.config import REDEEM_CODE_DEFAULT_DAILY_LIMIT, REDEEM_CODE_DEFAULT_VALID_DAYS
from app.core.timezone import now_shanghai_naive, to_shanghai_aware, to_shanghai_naive
from app.models import (
    AdminOperationLog,
    BillingModelRate,
    RedeemCode,
    RedeemCodeAttempt,
    RedeemCodeBatch,
    WalletAccount,
    WalletLedger,
)


EVENT_RESERVE = "reserve"
EVENT_CONSUME = "consume"
EVENT_REFUND = "refund"
EVENT_MANUAL_ADJUST = "manual_adjust"
EVENT_REDEEM_CODE = "redeem_code"

REDEEM_BATCH_STATUS_ACTIVE = "active"
REDEEM_BATCH_STATUS_PAUSED = "paused"
REDEEM_BATCH_STATUS_EXPIRED = "expired"

REDEEM_CODE_STATUS_ACTIVE = "active"
REDEEM_CODE_STATUS_DISABLED = "disabled"
REDEEM_CODE_STATUS_ABANDONED = "abandoned"
REDEEM_CODE_STATUS_REDEEMED = "redeemed"

REDEEM_FAIL_CODE_NOT_FOUND = "code_not_found"
REDEEM_FAIL_ALREADY_USED = "already_used"
REDEEM_FAIL_EXPIRED = "expired"
REDEEM_FAIL_DISABLED = "disabled"
REDEEM_FAIL_DAILY_LIMIT = "daily_limit_exceeded"
REDEEM_FAIL_NOT_ACTIVE = "not_active"

_REDEEM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


DEFAULT_MODEL_RATES: tuple[tuple[str, int, bool, int, int, int], ...] = (
    ("qwen3-asr-flash-filetrans", 130, True, 600, 300, 4),
)


@dataclass
class BillingError(Exception):
    code: str
    message: str
    detail: str = ""

    def __str__(self) -> str:  # pragma: no cover
        return self.message


def _now() -> datetime:
    return now_shanghai_naive()


def _ensure_legacy_sqlite_billing_columns(db: Session) -> None:
    bind = db.get_bind()
    if bind is None or bind.dialect.name != "sqlite":
        return

    inspector = inspect(bind)
    table_name = BillingModelRate.__tablename__
    if not inspector.has_table(table_name):
        return

    existing_columns = {str(item.get("name") or "").strip() for item in inspector.get_columns(table_name)}
    alter_sql: list[str] = []
    if "parallel_enabled" not in existing_columns:
        alter_sql.append("ALTER TABLE billing_model_rates ADD COLUMN parallel_enabled BOOLEAN NOT NULL DEFAULT 0")
    if "parallel_threshold_seconds" not in existing_columns:
        alter_sql.append("ALTER TABLE billing_model_rates ADD COLUMN parallel_threshold_seconds INTEGER NOT NULL DEFAULT 600")
    if "segment_seconds" not in existing_columns:
        alter_sql.append("ALTER TABLE billing_model_rates ADD COLUMN segment_seconds INTEGER NOT NULL DEFAULT 300")
    if "max_concurrency" not in existing_columns:
        alter_sql.append("ALTER TABLE billing_model_rates ADD COLUMN max_concurrency INTEGER NOT NULL DEFAULT 2")

    if not alter_sql:
        return

    for sql in alter_sql:
        db.execute(text(sql))
    db.commit()


def normalize_redeem_code_input(code: str) -> str:
    normalized = (code or "").strip().upper().replace(" ", "")
    return normalized.replace("-", "")


def hash_redeem_code(normalized_code: str) -> str:
    return hashlib.sha256(normalized_code.encode("utf-8")).hexdigest()


def mask_redeem_code(normalized_code: str) -> str:
    if not normalized_code:
        return "****"
    if len(normalized_code) <= 8:
        return f"{normalized_code[:2]}****{normalized_code[-2:]}"
    return f"{normalized_code[:4]}****{normalized_code[-4:]}"


def _generate_redeem_code_plain() -> str:
    raw = "".join(secrets.choice(_REDEEM_ALPHABET) for _ in range(16))
    return "-".join((raw[0:4], raw[4:8], raw[8:12], raw[12:16]))


def append_admin_operation_log(
    db: Session,
    *,
    operator_user_id: int | None,
    action_type: str,
    target_type: str,
    target_id: str,
    before_value: dict | None,
    after_value: dict | None,
    note: str = "",
) -> AdminOperationLog:
    row = AdminOperationLog(
        operator_user_id=operator_user_id,
        action_type=action_type,
        target_type=target_type,
        target_id=str(target_id or ""),
        before_value=json.dumps(before_value or {}, ensure_ascii=False, sort_keys=True),
        after_value=json.dumps(after_value or {}, ensure_ascii=False, sort_keys=True),
        note=(note or "").strip(),
    )
    db.add(row)
    db.flush()
    return row


def ensure_default_billing_rates(
    db: Session,
    defaults: Iterable[tuple[str, int, bool, int, int, int]] = DEFAULT_MODEL_RATES,
) -> None:
    _ensure_legacy_sqlite_billing_columns(db)

    changed = False
    legacy_para = db.get(BillingModelRate, "paraformer-v2")
    if legacy_para is not None:
        db.delete(legacy_para)
        changed = True

    for model_name, points_per_minute, parallel_enabled, parallel_threshold_seconds, segment_seconds, max_concurrency in defaults:
        exists = db.get(BillingModelRate, model_name)
        if exists:
            row_changed = False
            if exists.parallel_enabled is None:
                exists.parallel_enabled = bool(parallel_enabled)
                row_changed = True
            if int(exists.parallel_threshold_seconds or 0) <= 0:
                exists.parallel_threshold_seconds = int(parallel_threshold_seconds)
                row_changed = True
            if int(exists.segment_seconds or 0) <= 0:
                exists.segment_seconds = int(segment_seconds)
                row_changed = True
            if int(exists.max_concurrency or 0) <= 0:
                exists.max_concurrency = int(max_concurrency)
                row_changed = True
            if row_changed:
                db.add(exists)
                changed = True
            continue
        db.add(
            BillingModelRate(
                model_name=model_name,
                points_per_minute=points_per_minute,
                is_active=True,
                parallel_enabled=parallel_enabled,
                parallel_threshold_seconds=parallel_threshold_seconds,
                segment_seconds=segment_seconds,
                max_concurrency=max_concurrency,
            )
        )
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
    return list(
        db.scalars(select(BillingModelRate).where(BillingModelRate.is_active.is_(True)).order_by(BillingModelRate.model_name.asc())).all()
    )


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
    redeem_batch_id: int | None = None,
    redeem_code_id: int | None = None,
    redeem_code_mask: str | None = None,
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


def _generate_unique_redeem_codes(db: Session, quantity: int) -> list[tuple[str, str, str]]:
    generated: list[tuple[str, str, str]] = []
    in_batch_hashes: set[str] = set()

    while len(generated) < quantity:
        plain_code = _generate_redeem_code_plain()
        normalized = normalize_redeem_code_input(plain_code)
        code_hash = hash_redeem_code(normalized)
        if code_hash in in_batch_hashes:
            continue
        exists = db.scalar(select(RedeemCode.id).where(RedeemCode.code_hash == code_hash).limit(1))
        if exists:
            continue
        in_batch_hashes.add(code_hash)
        generated.append((plain_code, code_hash, mask_redeem_code(normalized)))

    return generated


def create_redeem_batch_and_codes(
    db: Session,
    *,
    batch_name: str,
    face_value_points: int,
    generate_quantity: int,
    active_from: datetime | None,
    expire_at: datetime | None,
    daily_limit_per_user: int | None,
    remark: str,
    created_by_user_id: int,
) -> tuple[RedeemCodeBatch, list[RedeemCode]]:
    if face_value_points <= 0:
        raise BillingError("INVALID_POINTS", "兑换面额必须大于 0")
    if generate_quantity <= 0:
        raise BillingError("INVALID_QUANTITY", "生成数量必须大于 0")
    if generate_quantity > 5000:
        raise BillingError("INVALID_QUANTITY", "单批最多生成 5000 个兑换码")
    if daily_limit_per_user is not None and daily_limit_per_user <= 0:
        raise BillingError("INVALID_DAILY_LIMIT", "单账号日限必须大于 0")

    now = _now()
    start_at = to_shanghai_naive(active_from) or now
    end_at = to_shanghai_naive(expire_at) or (start_at + timedelta(days=max(1, REDEEM_CODE_DEFAULT_VALID_DAYS)))
    if end_at <= start_at:
        raise BillingError("INVALID_TIME_RANGE", "失效时间必须晚于生效时间")

    batch = RedeemCodeBatch(
        batch_name=batch_name.strip() or f"batch_{now.strftime('%Y%m%d_%H%M%S')}",
        face_value_points=face_value_points,
        generated_count=generate_quantity,
        active_from=start_at,
        expire_at=end_at,
        daily_limit_per_user=daily_limit_per_user,
        status=REDEEM_BATCH_STATUS_ACTIVE,
        remark=(remark or "").strip(),
        created_by_user_id=created_by_user_id,
    )
    db.add(batch)
    db.flush()

    code_rows: list[RedeemCode] = []
    generated_codes = _generate_unique_redeem_codes(db, generate_quantity)
    for plain_code, code_hash, mask in generated_codes:
        row = RedeemCode(
            batch_id=batch.id,
            code_plain=plain_code,
            code_hash=code_hash,
            masked_code=mask,
            status=REDEEM_CODE_STATUS_ACTIVE,
            created_by_user_id=created_by_user_id,
        )
        code_rows.append(row)
    db.add_all(code_rows)
    db.flush()

    append_admin_operation_log(
        db,
        operator_user_id=created_by_user_id,
        action_type="redeem_batch_create",
        target_type="redeem_batch",
        target_id=str(batch.id),
        before_value={},
        after_value={
            "batch_name": batch.batch_name,
            "face_value_points": batch.face_value_points,
            "generated_count": batch.generated_count,
            "active_from": to_shanghai_aware(batch.active_from).isoformat(),
            "expire_at": to_shanghai_aware(batch.expire_at).isoformat(),
            "daily_limit_per_user": batch.daily_limit_per_user,
            "status": batch.status,
        },
        note="batch_created",
    )
    return batch, code_rows


def copy_redeem_batch_and_codes(
    db: Session,
    *,
    source_batch_id: int,
    generate_quantity: int,
    created_by_user_id: int,
) -> tuple[RedeemCodeBatch, list[RedeemCode]]:
    source = db.get(RedeemCodeBatch, source_batch_id)
    if not source:
        raise BillingError("REDEEM_BATCH_NOT_FOUND", "兑换码批次不存在", str(source_batch_id))

    return create_redeem_batch_and_codes(
        db,
        batch_name=f"{source.batch_name}_copy",
        face_value_points=source.face_value_points,
        generate_quantity=generate_quantity,
        active_from=source.active_from,
        expire_at=source.expire_at,
        daily_limit_per_user=source.daily_limit_per_user,
        remark=source.remark,
        created_by_user_id=created_by_user_id,
    )


def set_redeem_batch_status(
    db: Session,
    *,
    batch_id: int,
    next_status: str,
    operator_user_id: int,
    note: str = "",
) -> RedeemCodeBatch:
    batch = db.scalar(select(RedeemCodeBatch).where(RedeemCodeBatch.id == batch_id).with_for_update())
    if not batch:
        raise BillingError("REDEEM_BATCH_NOT_FOUND", "兑换码批次不存在", str(batch_id))

    if next_status not in {REDEEM_BATCH_STATUS_ACTIVE, REDEEM_BATCH_STATUS_PAUSED, REDEEM_BATCH_STATUS_EXPIRED}:
        raise BillingError("INVALID_STATUS", "无效的批次状态", next_status)

    before = {
        "status": batch.status,
        "active_from": to_shanghai_aware(batch.active_from).isoformat(),
        "expire_at": to_shanghai_aware(batch.expire_at).isoformat(),
    }

    batch.status = next_status
    if next_status == REDEEM_BATCH_STATUS_EXPIRED:
        now = _now()
        if batch.expire_at > now:
            batch.expire_at = now
    db.add(batch)
    db.flush()

    append_admin_operation_log(
        db,
        operator_user_id=operator_user_id,
        action_type="redeem_batch_status_update",
        target_type="redeem_batch",
        target_id=str(batch.id),
        before_value=before,
        after_value={"status": batch.status, "expire_at": to_shanghai_aware(batch.expire_at).isoformat()},
        note=(note or "").strip(),
    )
    return batch


def update_redeem_code_status(
    db: Session,
    *,
    code_id: int,
    next_status: str,
    operator_user_id: int,
    note: str = "",
) -> RedeemCode:
    code = db.scalar(select(RedeemCode).where(RedeemCode.id == code_id).with_for_update())
    if not code:
        raise BillingError("REDEEM_CODE_NOT_FOUND", "兑换码不存在", str(code_id))

    if code.status == REDEEM_CODE_STATUS_REDEEMED and next_status != REDEEM_CODE_STATUS_REDEEMED:
        raise BillingError("REDEEM_CODE_ALREADY_USED", "已兑换的兑换码不可变更状态")

    if next_status not in {
        REDEEM_CODE_STATUS_ACTIVE,
        REDEEM_CODE_STATUS_DISABLED,
        REDEEM_CODE_STATUS_ABANDONED,
        REDEEM_CODE_STATUS_REDEEMED,
    }:
        raise BillingError("INVALID_STATUS", "无效的兑换码状态", next_status)

    before = {"status": code.status}
    code.status = next_status
    db.add(code)
    db.flush()

    append_admin_operation_log(
        db,
        operator_user_id=operator_user_id,
        action_type="redeem_code_status_update",
        target_type="redeem_code",
        target_id=str(code.id),
        before_value=before,
        after_value={"status": code.status},
        note=(note or "").strip(),
    )
    return code


def bulk_disable_redeem_codes(
    db: Session,
    *,
    operator_user_id: int,
    code_ids: list[int] | None = None,
    batch_id: int | None = None,
) -> int:
    stmt = select(RedeemCode).where(RedeemCode.status == REDEEM_CODE_STATUS_ACTIVE)
    if code_ids:
        stmt = stmt.where(RedeemCode.id.in_(code_ids))
    if batch_id is not None:
        stmt = stmt.where(RedeemCode.batch_id == batch_id)

    rows = list(db.scalars(stmt.with_for_update()).all())
    for row in rows:
        row.status = REDEEM_CODE_STATUS_DISABLED
        db.add(row)

    append_admin_operation_log(
        db,
        operator_user_id=operator_user_id,
        action_type="redeem_code_bulk_disable",
        target_type="redeem_code",
        target_id=str(batch_id or "batch:none"),
        before_value={"count": len(rows)},
        after_value={"status": REDEEM_CODE_STATUS_DISABLED},
        note=f"code_ids={len(code_ids or [])}",
    )
    db.flush()
    return len(rows)


def _append_redeem_attempt(
    db: Session,
    *,
    user_id: int,
    batch_id: int | None,
    code_id: int | None,
    code_mask: str,
    success: bool,
    failure_reason: str = "",
) -> RedeemCodeAttempt:
    row = RedeemCodeAttempt(
        user_id=user_id,
        batch_id=batch_id,
        code_id=code_id,
        code_mask=code_mask,
        success=success,
        failure_reason=(failure_reason or "").strip(),
    )
    db.add(row)
    db.flush()
    return row


def _check_daily_limit(db: Session, *, user_id: int, limit: int, now: datetime) -> bool:
    if limit <= 0:
        return True
    day_start = datetime(now.year, now.month, now.day)
    day_end = day_start + timedelta(days=1)
    used_count = int(
        db.scalar(
            select(func.count(RedeemCodeAttempt.id)).where(
                RedeemCodeAttempt.user_id == user_id,
                RedeemCodeAttempt.success.is_(True),
                RedeemCodeAttempt.created_at >= day_start,
                RedeemCodeAttempt.created_at < day_end,
            )
        )
        or 0
    )
    return used_count < limit


def redeem_code(
    db: Session,
    *,
    user_id: int,
    raw_code: str,
) -> WalletLedger:
    normalized = normalize_redeem_code_input(raw_code)
    if not normalized:
        raise BillingError("INVALID_REDEEM_CODE", "兑换码不能为空")

    code_hash = hash_redeem_code(normalized)
    code_mask = mask_redeem_code(normalized)
    now = _now()

    code = db.scalar(select(RedeemCode).where(RedeemCode.code_hash == code_hash).with_for_update())
    if not code:
        _append_redeem_attempt(
            db,
            user_id=user_id,
            batch_id=None,
            code_id=None,
            code_mask=code_mask,
            success=False,
            failure_reason=REDEEM_FAIL_CODE_NOT_FOUND,
        )
        raise BillingError("REDEEM_CODE_NOT_FOUND", "兑换码不存在")

    batch = db.scalar(select(RedeemCodeBatch).where(RedeemCodeBatch.id == code.batch_id).with_for_update())
    if not batch:
        _append_redeem_attempt(
            db,
            user_id=user_id,
            batch_id=None,
            code_id=code.id,
            code_mask=code.masked_code,
            success=False,
            failure_reason=REDEEM_FAIL_CODE_NOT_FOUND,
        )
        raise BillingError("REDEEM_CODE_NOT_FOUND", "兑换码不存在")

    if code.status == REDEEM_CODE_STATUS_REDEEMED or code.redeemed_at is not None:
        _append_redeem_attempt(
            db,
            user_id=user_id,
            batch_id=batch.id,
            code_id=code.id,
            code_mask=code.masked_code,
            success=False,
            failure_reason=REDEEM_FAIL_ALREADY_USED,
        )
        raise BillingError("REDEEM_CODE_ALREADY_USED", "兑换码已使用")

    if code.status in {REDEEM_CODE_STATUS_DISABLED, REDEEM_CODE_STATUS_ABANDONED} or batch.status == REDEEM_BATCH_STATUS_PAUSED:
        _append_redeem_attempt(
            db,
            user_id=user_id,
            batch_id=batch.id,
            code_id=code.id,
            code_mask=code.masked_code,
            success=False,
            failure_reason=REDEEM_FAIL_DISABLED,
        )
        raise BillingError("REDEEM_CODE_DISABLED", "兑换码不可用")

    if batch.status == REDEEM_BATCH_STATUS_EXPIRED or now >= batch.expire_at:
        _append_redeem_attempt(
            db,
            user_id=user_id,
            batch_id=batch.id,
            code_id=code.id,
            code_mask=code.masked_code,
            success=False,
            failure_reason=REDEEM_FAIL_EXPIRED,
        )
        raise BillingError("REDEEM_CODE_EXPIRED", "兑换码已失效")

    if now < batch.active_from:
        _append_redeem_attempt(
            db,
            user_id=user_id,
            batch_id=batch.id,
            code_id=code.id,
            code_mask=code.masked_code,
            success=False,
            failure_reason=REDEEM_FAIL_NOT_ACTIVE,
        )
        raise BillingError("REDEEM_CODE_NOT_ACTIVE", "兑换码未到生效时间")

    daily_limit = batch.daily_limit_per_user if batch.daily_limit_per_user is not None else max(1, REDEEM_CODE_DEFAULT_DAILY_LIMIT)
    if not _check_daily_limit(db, user_id=user_id, limit=daily_limit, now=now):
        _append_redeem_attempt(
            db,
            user_id=user_id,
            batch_id=batch.id,
            code_id=code.id,
            code_mask=code.masked_code,
            success=False,
            failure_reason=REDEEM_FAIL_DAILY_LIMIT,
        )
        raise BillingError("REDEEM_CODE_DAILY_LIMIT_EXCEEDED", "超出当日兑换上限")

    account = get_or_create_wallet_account(db, user_id, for_update=True)
    account.balance_points += batch.face_value_points
    db.add(account)

    code.status = REDEEM_CODE_STATUS_REDEEMED
    code.redeemed_by_user_id = user_id
    code.redeemed_at = now
    db.add(code)
    db.flush()

    ledger = _append_ledger(
        db,
        user_id=user_id,
        operator_user_id=None,
        event_type=EVENT_REDEEM_CODE,
        delta_points=batch.face_value_points,
        balance_after=account.balance_points,
        redeem_batch_id=batch.id,
        redeem_code_id=code.id,
        redeem_code_mask=code.masked_code,
        note=f"redeem_code:{code.masked_code}",
    )

    _append_redeem_attempt(
        db,
        user_id=user_id,
        batch_id=batch.id,
        code_id=code.id,
        code_mask=code.masked_code,
        success=True,
    )
    return ledger
