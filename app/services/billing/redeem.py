"""兑换码服务 - 计费模块。

提供兑换码的完整操作功能。

此文件是从 app/services/billing.py 中提取的兑换码相关逻辑。
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import RedeemCode, RedeemCodeAttempt, RedeemCodeBatch, WalletAccount
from app.core.timezone import now_shanghai_naive
from app.services.billing.wallet import (
    BillingError,
    get_or_create_wallet_account,
    _append_ledger,
)
from app.services.billing.constants import (
    REDEEM_CODE_STATUS_ACTIVE,
    REDEEM_CODE_STATUS_DISABLED,
    REDEEM_CODE_STATUS_ABANDONED,
    REDEEM_CODE_STATUS_REDEEMED,
    REDEEM_BATCH_STATUS_ACTIVE,
    REDEEM_BATCH_STATUS_PAUSED,
    REDEEM_BATCH_STATUS_EXPIRED,
    _REDEEM_ALPHABET,
    REDEEM_CODE_DEFAULT_VALID_DAYS,
    REDEEM_CODE_DEFAULT_DAILY_LIMIT,
)


logger = logging.getLogger(__name__)


# ── 工具函数 ───────────────────────────────────────────────────────────────


def _now() -> datetime:
    return now_shanghai_naive()


def normalize_redeem_code_input(code: str) -> str:
    """规范化兑换码输入（去空格转大写）。"""
    return code.strip().upper()


def hash_redeem_code(normalized_code: str) -> str:
    """哈希兑换码用于存储。"""
    return hashlib.sha256(normalized_code.encode()).hexdigest()[:16].upper()


def mask_redeem_code(normalized_code: str) -> str:
    """掩码兑换码用于显示。"""
    if len(normalized_code) <= 8:
        return normalized_code[:2] + "****"
    return normalized_code[:4] + "****" + normalized_code[-4:]


def _generate_redeem_code_plain() -> str:
    """生成随机兑换码明文。"""
    alphabet = _REDEEM_ALPHABET
    return "".join(secrets.choice(alphabet) for _ in range(12))


# ── 兑换码操作 ─────────────────────────────────────────────────────────────


def create_redeem_batch_and_codes(
    db: Session,
    admin_id: int,
    batch_name: str,
    points_per_code: int,
    quantity: int,
    valid_days: int = REDEEM_CODE_DEFAULT_VALID_DAYS,
    daily_limit: int = REDEEM_CODE_DEFAULT_DAILY_LIMIT,
) -> tuple[RedeemCodeBatch, list[RedeemCode]]:
    """创建兑换码批次和兑换码。"""
    if points_per_code <= 0:
        raise BillingError("INVALID_POINTS", f"每码点数必须大于 0: {points_per_code}")
    if quantity <= 0 or quantity > 10000:
        raise BillingError("INVALID_QUANTITY", f"数量必须在 1-10000 之间: {quantity}")

    now = _now()
    expire_at = datetime(year=2099, month=12, day=31)  # 永不过期

    batch = RedeemCodeBatch(
        name=batch_name,
        points_per_code=points_per_code,
        quantity=quantity,
        valid_days=valid_days,
        daily_limit=daily_limit,
        expire_at=expire_at,
        status=REDEEM_BATCH_STATUS_ACTIVE,
        created_by=admin_id,
    )
    db.add(batch)
    db.flush()

    codes = []
    for _ in range(quantity):
        plain_code = _generate_redeem_code_plain()
        code = RedeemCode(
            batch_id=batch.id,
            code_hash=hash_redeem_code(plain_code),
            code_plain=plain_code,  # 存储明文用于管理员查看
            points=points_per_code,
            status=REDEEM_CODE_STATUS_ACTIVE,
            expire_at=batch.expire_at,
            daily_limit=daily_limit,
        )
        db.add(code)
        codes.append(code)

    db.flush()
    return batch, codes


def copy_redeem_batch_and_codes(
    db: Session,
    admin_id: int,
    source_batch_id: int,
    new_batch_name: str | None = None,
) -> tuple[RedeemCodeBatch, list[RedeemCode]]:
    """复制兑换码批次。"""
    from sqlalchemy import select

    source_batch = db.scalars(
        select(RedeemCodeBatch).where(RedeemCodeBatch.id == source_batch_id)
    ).first()

    if source_batch is None:
        raise BillingError("REDEEM_BATCH_NOT_FOUND", f"批次不存在: {source_batch_id}")

    return create_redeem_batch_and_codes(
        db,
        admin_id,
        new_batch_name or f"{source_batch.name} (副本)",
        source_batch.points_per_code,
        source_batch.quantity,
        source_batch.valid_days or 0,
        source_batch.daily_limit or 0,
    )


def set_redeem_batch_status(
    db: Session,
    batch_id: int,
    status: str,
) -> RedeemCodeBatch:
    """设置兑换码批次状态。"""
    from sqlalchemy import select, update

    batch = db.scalars(
        select(RedeemCodeBatch).where(RedeemCodeBatch.id == batch_id)
    ).first()

    if batch is None:
        raise BillingError("REDEEM_BATCH_NOT_FOUND", f"批次不存在: {batch_id}")

    if status not in {REDEEM_BATCH_STATUS_ACTIVE, REDEEM_BATCH_STATUS_PAUSED, REDEEM_BATCH_STATUS_EXPIRED}:
        raise BillingError("INVALID_STATUS", f"无效的批次状态: {status}")

    batch.status = status
    db.flush()
    return batch


def update_redeem_code_status(
    db: Session,
    code_id: int,
    status: str,
) -> RedeemCode:
    """更新单个兑换码状态。"""
    from sqlalchemy import select

    code = db.scalars(
        select(RedeemCode).where(RedeemCode.id == code_id)
    ).first()

    if code is None:
        raise BillingError("REDEEM_CODE_NOT_FOUND", f"兑换码不存在: {code_id}")

    if status not in {REDEEM_CODE_STATUS_ACTIVE, REDEEM_CODE_STATUS_DISABLED, REDEEM_CODE_STATUS_ABANDONED}:
        raise BillingError("INVALID_STATUS", f"无效的兑换码状态: {status}")

    code.status = status
    db.flush()
    return code


def bulk_disable_redeem_codes(
    db: Session,
    code_ids: list[int],
) -> int:
    """批量禁用兑换码。"""
    from sqlalchemy import update

    result = db.execute(
        update(RedeemCode)
        .where(RedeemCode.id.in_(code_ids))
        .values(status=REDEEM_CODE_STATUS_DISABLED)
    )
    db.flush()
    return result.rowcount


def abandon_redeem_code_with_refund(
    db: Session,
    code_id: int,
    admin_id: int,
    reason: str = "",
) -> RedeemCode:
    """废弃兑换码并退款给使用者。"""
    from sqlalchemy import select

    code = db.scalars(
        select(RedeemCode).where(RedeemCode.id == code_id)
    ).first()

    if code is None:
        raise BillingError("REDEEM_CODE_NOT_FOUND", f"兑换码不存在: {code_id}")

    # 如果已被使用，需要退款
    if code.status == REDEEM_CODE_STATUS_REDEEMED and code.redeemed_by_user_id:
        try:
            refund_account = refund_points_by_redeem(
                db,
                code.redeemed_by_user_id,
                code.points,
                reason=f"兑换码 {code_id} 被废弃: {reason}",
            )
            logger.info(
                "[DEBUG] abandon_redeem_code refunded %s points to user %s",
                code.points,
                code.redeemed_by_user_id,
            )
        except Exception as e:
            logger.warning("[DEBUG] abandon_redeem_code refund failed: %s", e)

    code.status = REDEEM_CODE_STATUS_ABANDONED
    db.flush()
    return code


def delete_redeem_batch_and_codes(
    db: Session,
    batch_id: int,
) -> int:
    """删除兑换码批次及其所有兑换码。"""
    from sqlalchemy import delete, select

    # 先删除兑换码
    result = db.execute(
        delete(RedeemCode).where(RedeemCode.batch_id == batch_id)
    )
    deleted_codes = result.rowcount

    # 再删除批次
    db.execute(
        delete(RedeemCodeBatch).where(RedeemCodeBatch.id == batch_id)
    )
    db.flush()

    return deleted_codes


def abandon_redeem_batch(
    db: Session,
    batch_id: int,
    admin_id: int,
    reason: str = "",
    refund_used: bool = True,
) -> RedeemCodeBatch:
    """废弃整个兑换码批次。"""
    from sqlalchemy import select, update

    batch = db.scalars(
        select(RedeemCodeBatch).where(RedeemCodeBatch.id == batch_id)
    ).first()

    if batch is None:
        raise BillingError("REDEEM_BATCH_NOT_FOUND", f"批次不存在: {batch_id}")

    batch.status = REDEEM_BATCH_STATUS_EXPIRED

    # 批量禁用未使用的兑换码
    db.execute(
        update(RedeemCode)
        .where(RedeemCode.batch_id == batch_id)
        .where(RedeemCode.status == REDEEM_CODE_STATUS_ACTIVE)
        .values(status=REDEEM_CODE_STATUS_ABANDONED)
    )

    db.flush()
    return batch


def _append_redeem_attempt(
    db: Session,
    user_id: int,
    code_id: int,
    success: bool,
    fail_reason: str = "",
) -> RedeemCodeAttempt:
    """记录兑换尝试。"""
    attempt = RedeemCodeAttempt(
        user_id=user_id,
        code_id=code_id,
        success=success,
        fail_reason=fail_reason,
    )
    db.add(attempt)
    db.flush()
    return attempt


def _check_daily_limit(
    db: Session,
    *,
    user_id: int,
    limit: int,
    now: datetime,
) -> bool:
    """检查用户今日兑换次数是否超限。"""
    from sqlalchemy import func, select

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    count = db.scalars(
        select(func.count(RedeemCodeAttempt.id))
        .where(RedeemCodeAttempt.user_id == user_id)
        .where(RedeemCodeAttempt.success == True)  # noqa: E712
        .where(RedeemCodeAttempt.created_at >= today_start)
    ).scalar()

    return count < limit


def redeem_code(
    db: Session,
    user_id: int,
    code: str,
) -> tuple[RedeemCode, WalletAccount]:
    """兑换码。"""
    from sqlalchemy import select

    normalized = normalize_redeem_code_input(code)
    code_hash = hash_redeem_code(normalized)

    # 查询兑换码
    redeem_code = db.scalars(
        select(RedeemCode)
        .where(RedeemCode.code_hash == code_hash)
    ).first()

    if redeem_code is None:
        _append_redeem_attempt(db, user_id, 0, False, "code_not_found")
        raise BillingError("REDEEM_CODE_NOT_FOUND", f"兑换码不存在: {mask_redeem_code(normalized)}")

    # 检查状态
    if redeem_code.status == REDEEM_CODE_STATUS_REDEEMED:
        _append_redeem_attempt(db, user_id, redeem_code.id, False, "already_used")
        raise BillingError("REDEEM_CODE_ALREADY_USED", f"兑换码已被使用")

    if redeem_code.status == REDEEM_CODE_STATUS_DISABLED:
        _append_redeem_attempt(db, user_id, redeem_code.id, False, "disabled")
        raise BillingError("REDEEM_CODE_DISABLED", f"兑换码已禁用")

    if redeem_code.status == REDEEM_CODE_STATUS_ABANDONED:
        _append_redeem_attempt(db, user_id, redeem_code.id, False, "abandoned")
        raise BillingError("REDEEM_CODE_EXPIRED", f"兑换码已废弃")

    # 检查批次状态
    batch = db.scalars(
        select(RedeemCodeBatch).where(RedeemCodeBatch.id == redeem_code.batch_id)
    ).first()

    if batch is None or batch.status != REDEEM_BATCH_STATUS_ACTIVE:
        _append_redeem_attempt(db, user_id, redeem_code.id, False, "batch_inactive")
        raise BillingError("REDEEM_CODE_NOT_ACTIVE", f"兑换码批次未激活")

    # 检查过期时间
    now = _now()
    if redeem_code.expire_at and redeem_code.expire_at < now:
        _append_redeem_attempt(db, user_id, redeem_code.id, False, "expired")
        raise BillingError("REDEEM_CODE_EXPIRED", f"兑换码已过期")

    # 检查每日限制
    daily_limit = redeem_code.daily_limit or 0
    if daily_limit > 0 and not _check_daily_limit(db, user_id=user_id, limit=daily_limit, now=now):
        _append_redeem_attempt(db, user_id, redeem_code.id, False, "daily_limit_exceeded")
        raise BillingError("REDEEM_CODE_DAILY_LIMIT_EXCEEDED", f"今日兑换次数已达上限")

    # 执行兑换
    account = get_or_create_wallet_account(db, user_id, for_update=True)

    # 添加点数
    _append_ledger(
        db,
        account,
        "redeem_code",
        redeem_code.points,
        note=f"兑换码 {mask_redeem_code(normalized)}",
        extra={"event_types": "redeem_code", "code_id": redeem_code.id},
    )
    account.balance += redeem_code.points

    # 更新兑换码状态
    redeem_code.status = REDEEM_CODE_STATUS_REDEEMED
    redeem_code.redeemed_by_user_id = user_id
    redeem_code.redeemed_at = now

    # 记录成功
    _append_redeem_attempt(db, user_id, redeem_code.id, True)
    db.flush()

    return redeem_code, account


def refund_points_by_redeem(
    db: Session,
    user_id: int,
    points: int,
    reason: str = "",
) -> WalletAccount:
    """从兑换退款到钱包。"""
    account = get_or_create_wallet_account(db, user_id, for_update=True)

    _append_ledger(
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


__all__ = [
    "create_redeem_batch_and_codes",
    "copy_redeem_batch_and_codes",
    "set_redeem_batch_status",
    "update_redeem_code_status",
    "bulk_disable_redeem_codes",
    "abandon_redeem_code_with_refund",
    "delete_redeem_batch_and_codes",
    "abandon_redeem_batch",
    "redeem_code",
    "normalize_redeem_code_input",
    "hash_redeem_code",
    "mask_redeem_code",
]
