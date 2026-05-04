from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import (
    REDEEM_CODE_DEFAULT_DAILY_LIMIT,
    REDEEM_CODE_DEFAULT_VALID_DAYS,
)
from app.core.timezone import to_shanghai_aware, to_shanghai_naive
from app.models import RedeemCode, RedeemCodeAttempt, RedeemCodeBatch, WalletLedger

from .admin_logs import append_admin_operation_log
from .common import BillingError, now_local
from .constants import (
    EVENT_REDEEM_CODE,
    REDEEM_ALPHABET,
    REDEEM_BATCH_STATUS_ACTIVE,
    REDEEM_BATCH_STATUS_EXPIRED,
    REDEEM_BATCH_STATUS_PAUSED,
    REDEEM_CODE_STATUS_ABANDONED,
    REDEEM_CODE_STATUS_ACTIVE,
    REDEEM_CODE_STATUS_DISABLED,
    REDEEM_CODE_STATUS_REDEEMED,
    REDEEM_FAIL_ALREADY_USED,
    REDEEM_FAIL_CODE_NOT_FOUND,
    REDEEM_FAIL_DAILY_LIMIT,
    REDEEM_FAIL_DISABLED,
    REDEEM_FAIL_EXPIRED,
    REDEEM_FAIL_NOT_ACTIVE,
)
from .wallet import append_ledger, get_or_create_wallet_account


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


def generate_redeem_code_plain() -> str:
    raw = "".join(secrets.choice(REDEEM_ALPHABET) for _ in range(16))
    return "-".join((raw[0:4], raw[4:8], raw[8:12], raw[12:16]))


def generate_unique_redeem_codes(db: Session, quantity: int) -> list[tuple[str, str, str]]:
    generated: list[tuple[str, str, str]] = []
    in_batch_hashes: set[str] = set()

    while len(generated) < quantity:
        plain_code = generate_redeem_code_plain()
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

    now = now_local()
    start_at = to_shanghai_naive(active_from) or now
    end_at = to_shanghai_naive(expire_at) or (start_at + timedelta(days=max(1, REDEEM_CODE_DEFAULT_VALID_DAYS)))
    if end_at <= start_at:
        raise BillingError("INVALID_TIME_RANGE", "失效时间必须晚于生效时间")

    batch = RedeemCodeBatch(
        batch_name=batch_name.strip() or f"batch_{now.strftime('%Y%m%d_%H%M%S')}",
        face_value_amount_cents=face_value_points,
        face_value_unit="cents",
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
    generated_codes = generate_unique_redeem_codes(db, generate_quantity)
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
        now = now_local()
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


def abandon_redeem_code_with_refund(
    db: Session,
    *,
    code_id: int,
    operator_user_id: int,
) -> dict[str, object]:
    code = db.scalar(select(RedeemCode).where(RedeemCode.id == code_id).with_for_update())
    if not code:
        raise BillingError("REDEEM_CODE_NOT_FOUND", "兑换码不存在", str(code_id))

    batch = db.get(RedeemCodeBatch, code.batch_id)
    if not batch:
        raise BillingError("REDEEM_BATCH_NOT_FOUND", "批次不存在", str(code.batch_id))

    if code.status != REDEEM_CODE_STATUS_REDEEMED:
        before = {"status": code.status}
        code.status = REDEEM_CODE_STATUS_ABANDONED
        db.add(code)
        db.flush()
        append_admin_operation_log(
            db,
            operator_user_id=operator_user_id,
            action_type="redeem_code_abandon",
            target_type="redeem_code",
            target_id=str(code.id),
            before_value=before,
            after_value={"status": code.status, "refund": False},
            note="abandon_no_redeem",
        )
        return {"status": code.status, "refunded": False, "refund_amount": 0}

    redeemed_user_id = code.redeemed_by_user_id
    if redeemed_user_id is None:
        raise BillingError("REDEEM_CODE_NO_REDEEMER", "已兑换兑换码无兑换用户")

    refund_amount = batch.face_value_points
    account = get_or_create_wallet_account(db, redeemed_user_id, for_update=True)
    account.balance_points -= refund_amount
    db.add(account)

    append_ledger(
        db,
        user_id=redeemed_user_id,
        operator_user_id=operator_user_id,
        event_type="refund",
        delta_points=-refund_amount,
        balance_after=account.balance_points,
        redeem_batch_id=batch.id,
        redeem_code_id=code.id,
        redeem_code_mask=code.masked_code,
        note=f"废弃扣回:{code.masked_code}",
    )

    before = {"status": code.status}
    code.status = REDEEM_CODE_STATUS_ABANDONED
    db.add(code)
    db.flush()

    append_admin_operation_log(
        db,
        operator_user_id=operator_user_id,
        action_type="redeem_code_abandon",
        target_type="redeem_code",
        target_id=str(code.id),
        before_value=before,
        after_value={"status": code.status, "refund": True, "refund_amount": refund_amount},
        note="abandon_with_refund",
    )

    return {
        "status": code.status,
        "refunded": True,
        "refund_amount": refund_amount,
        "user_id": redeemed_user_id,
        "balance_after": account.balance_points,
    }


def delete_redeem_batch_and_codes(
    db: Session,
    *,
    batch_id: int,
    operator_user_id: int,
) -> dict[str, object]:
    batch = db.get(RedeemCodeBatch, batch_id)
    if not batch:
        raise BillingError("REDEEM_BATCH_NOT_FOUND", "批次不存在", str(batch_id))

    code_count = int(
        db.scalar(select(func.count(RedeemCode.id)).where(RedeemCode.batch_id == batch_id))
        or 0
    )

    db.execute(delete(RedeemCode).where(RedeemCode.batch_id == batch_id))
    db.delete(batch)

    append_admin_operation_log(
        db,
        operator_user_id=operator_user_id,
        action_type="redeem_batch_hard_delete",
        target_type="redeem_batch",
        target_id=str(batch_id),
        before_value={"batch_name": batch.batch_name, "code_count": code_count},
        after_value={"deleted": True},
        note="hard_delete",
    )

    return {"batch_id": batch_id, "deleted_code_count": code_count}


def abandon_redeem_batch(
    db: Session,
    *,
    batch_id: int,
    operator_user_id: int,
) -> dict[str, object]:
    batch = db.get(RedeemCodeBatch, batch_id)
    if not batch:
        raise BillingError("REDEEM_BATCH_NOT_FOUND", "批次不存在", str(batch_id))

    before_status = batch.status
    batch.status = REDEEM_BATCH_STATUS_EXPIRED
    db.add(batch)

    redeemed_codes = (
        db.scalars(
            select(RedeemCode).where(
                RedeemCode.batch_id == batch_id,
                RedeemCode.status == REDEEM_CODE_STATUS_REDEEMED,
            )
        ).all()
    )

    total_refund = 0
    refunded_users = 0
    for code in redeemed_codes:
        user_id = code.redeemed_by_user_id
        if user_id is None:
            continue
        refund_amount = batch.face_value_points
        account = get_or_create_wallet_account(db, user_id, for_update=True)
        account.balance_points -= refund_amount
        db.add(account)
        append_ledger(
            db,
            user_id=user_id,
            operator_user_id=operator_user_id,
            event_type="refund",
            delta_points=-refund_amount,
            balance_after=account.balance_points,
            redeem_batch_id=batch.id,
            redeem_code_id=code.id,
            redeem_code_mask=code.masked_code,
            note=f"废弃扣回:{code.masked_code}",
        )
        code.status = REDEEM_CODE_STATUS_ABANDONED
        db.add(code)
        total_refund += refund_amount
        refunded_users += 1

    append_admin_operation_log(
        db,
        operator_user_id=operator_user_id,
        action_type="redeem_batch_abandon",
        target_type="redeem_batch",
        target_id=str(batch_id),
        before_value={"status": before_status},
        after_value={
            "status": batch.status,
            "total_refund": total_refund,
            "refunded_users": refunded_users,
        },
        note="abandon_batch",
    )

    return {
        "batch_id": batch_id,
        "batch_status": batch.status,
        "total_refund": total_refund,
        "refunded_users": refunded_users,
        "refunded_codes": len(redeemed_codes),
    }


def append_redeem_attempt(
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


def check_daily_limit(db: Session, *, user_id: int, limit: int, now: datetime) -> bool:
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


def redeem_code_by_raw_code(
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
    now = now_local()

    code = db.scalar(select(RedeemCode).where(RedeemCode.code_hash == code_hash).with_for_update())
    if not code:
        append_redeem_attempt(
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
        append_redeem_attempt(
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
        append_redeem_attempt(
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
        append_redeem_attempt(
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
        append_redeem_attempt(
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
        append_redeem_attempt(
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
    if not check_daily_limit(db, user_id=user_id, limit=daily_limit, now=now):
        append_redeem_attempt(
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

    ledger = append_ledger(
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

    append_redeem_attempt(
        db,
        user_id=user_id,
        batch_id=batch.id,
        code_id=code.id,
        code_mask=code.masked_code,
        success=True,
    )
    return ledger


redeem_code = redeem_code_by_raw_code
