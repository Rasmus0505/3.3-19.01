"""费率管理服务 - 计费模块。

提供模型费率管理功能。

此文件是从 app/services/billing.py 中提取的费率相关逻辑。
"""
from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal
from typing import Iterable

from sqlalchemy import delete, func, inspect, select, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from app.models import BillingModelRate
from app.models.billing import cents_to_rate_yuan, normalize_rate_yuan as model_normalize_rate_yuan, rate_yuan_to_compat_cents
from app.repositories.billing_rates import list_billing_rates as query_billing_rates
from app.core.timezone import now_shanghai_naive
from app.services.billing.wallet import BillingError
from app.services.billing.constants import (
    DEFAULT_MODEL_RATES,
    ADMIN_BILLING_MODEL_ORDER,
    PUBLIC_BILLING_MODEL_ORDER,
    MT_FLASH_MODEL,
)


logger = logging.getLogger(__name__)


def _now() -> datetime:
    return now_shanghai_naive()


def _billing_model_rates_columns(db: Session) -> set[str]:
    """获取 billing_model_rates 表的列名。"""
    inspector = inspect(db.bind)
    tables = inspector.get_table_names()
    if "billing_model_rates" not in tables:
        return set()
    return {c["name"] for c in inspector.get_columns("billing_model_rates")}


def build_rate_payload(item: dict[str, object]) -> dict[str, object]:
    """构建费率负载（兼容旧格式）。"""
    model_name = str(item.get("model_name", ""))
    points_per_minute = int(item.get("points_per_minute", 0) or 0)
    price_per_minute_yuan = Decimal(str(item.get("price_per_minute_yuan", "0") or "0"))
    points_per_1k_tokens = int(item.get("points_per_1k_tokens", 0) or 0)
    cost_per_1k_tokens_input_cents = int(item.get("cost_per_1k_tokens_input_cents", 0) or 0)
    cost_per_1k_tokens_output_cents = int(item.get("cost_per_1k_tokens_output_cents", 0) or 0)

    return {
        "model_name": model_name,
        "points_per_minute": points_per_minute,
        "price_per_minute_yuan": price_per_minute_yuan,
        "price_per_minute_yuan_display": f"{float(price_per_minute_yuan):.2f}",
        "points_per_1k_tokens": points_per_1k_tokens,
        "cost_per_minute_cents": int(item.get("cost_per_minute_cents", 0) or 0),
        "cost_per_minute_yuan": Decimal(str(item.get("cost_per_minute_yuan", "0") or "0")),
        "cost_per_1k_tokens_input_cents": cost_per_1k_tokens_input_cents,
        "cost_per_1k_tokens_output_cents": cost_per_1k_tokens_output_cents,
        "billing_unit": str(item.get("billing_unit", "minute")),
        "parallel_enabled": bool(item.get("parallel_enabled", False)),
        "parallel_threshold_seconds": int(item.get("parallel_threshold_seconds", 0) or 0),
        "segment_seconds": int(item.get("segment_seconds", 0) or 0),
        "max_concurrency": int(item.get("max_concurrency", 1) or 1),
    }


def _sort_rates_by_model_order(rows: Iterable[BillingModelRate], model_order: tuple[str, ...]) -> list[BillingModelRate]:
    """按指定顺序排列费率。"""
    order_map = {m: i for i, m in enumerate(model_order)}
    return sorted(rows, key=lambda r: order_map.get(r.model_name, 999))


def list_admin_rates(db: Session) -> list[BillingModelRate]:
    """获取管理员费率列表（按管理后台顺序）。"""
    rates = query_billing_rates(db)
    return _sort_rates_by_model_order(rates, ADMIN_BILLING_MODEL_ORDER)


def list_public_rates(db: Session) -> list[BillingModelRate]:
    """获取公开费率列表（按用户界面顺序）。"""
    rates = query_billing_rates(db)
    return _sort_rates_by_model_order(rates, PUBLIC_BILLING_MODEL_ORDER)


def get_model_rate(db: Session, model_name: str, *, require_active: bool = True) -> BillingModelRate:
    """获取指定模型费率。"""
    stmt = select(BillingModelRate).where(BillingModelRate.model_name == model_name)
    if require_active:
        stmt = stmt.where(BillingModelRate.active == True)  # noqa: E712
    rate = db.scalars(stmt).first()
    if rate is None:
        raise BillingError("BILLING_RATE_NOT_FOUND", f"未找到模型 {model_name} 的费率")
    return rate


def _cleanup_non_flash_mt_rates(db: Session, *, ensure_flash: bool) -> tuple[int, bool]:
    """清理非 flash 的 MT 费率。"""
    from sqlalchemy import update

    # 删除非 qwen-mt-flash 的 qwen-mt-* 费率
    result = db.execute(
        delete(BillingModelRate)
        .where(BillingModelRate.model_name.like("qwen-mt-%"))
        .where(BillingModelRate.model_name != MT_FLASH_MODEL)
    )
    deleted = result.rowcount

    if ensure_flash and deleted > 0:
        # 确保 qwen-mt-flash 存在
        flash_rate = db.scalars(
            select(BillingModelRate).where(BillingModelRate.model_name == MT_FLASH_MODEL)
        ).first()
        if flash_rate is None:
            _insert_default_rate(db, MT_FLASH_MODEL, DEFAULT_MODEL_RATES[1])

    return deleted, ensure_flash


def _cleanup_removed_admin_rates(db: Session) -> int:
    """清理已从管理后台移除的费率。"""
    from sqlalchemy import delete

    removed_models = {"deepseek-v3.2"}  # 仅保留 ASR 和翻译费率
    result = db.execute(
        delete(BillingModelRate)
        .where(BillingModelRate.model_name.in_(removed_models))
    )
    return result.rowcount


def enforce_mt_flash_only_rates(db: Session) -> bool:
    """强制只保留 qwen-mt-flash 费率。"""
    deleted, _ = _cleanup_non_flash_mt_rates(db, ensure_flash=True)
    return deleted > 0


def _insert_default_rate(db: Session, model_name: str, rate_config: dict[str, object]) -> BillingModelRate:
    """插入默认费率。"""
    rate = BillingModelRate(
        model_name=model_name,
        points_per_minute=int(rate_config.get("points_per_minute", 0) or 0),
        price_per_minute_yuan_display=rate_config.get("price_per_minute_yuan", Decimal("0")),
        points_per_1k_tokens=int(rate_config.get("points_per_1k_tokens", 0) or 0),
        cost_per_minute_cents=int(rate_config.get("cost_per_minute_cents", 0) or 0),
        cost_per_1k_tokens_input_cents=int(rate_config.get("cost_per_1k_tokens_input_cents", 0) or 0),
        cost_per_1k_tokens_output_cents=int(rate_config.get("cost_per_1k_tokens_output_cents", 0) or 0),
        billing_unit=str(rate_config.get("billing_unit", "minute")),
        parallel_enabled=bool(rate_config.get("parallel_enabled", False)),
        parallel_threshold_seconds=int(rate_config.get("parallel_threshold_seconds", 0) or 0),
        segment_seconds=int(rate_config.get("segment_seconds", 0) or 0),
        max_concurrency=int(rate_config.get("max_concurrency", 1) or 1),
        active=True,
    )
    db.add(rate)
    db.flush()
    return rate


def ensure_default_billing_rates(db: Session) -> bool:
    """确保默认费率存在。"""
    # 清理非 flash 的 MT 费率
    _cleanup_non_flash_mt_rates(db, ensure_flash=True)

    # 清理已移除的费率
    _cleanup_removed_admin_rates(db)

    # 插入默认费率（如果不存在）
    for rate_config in DEFAULT_MODEL_RATES:
        model_name = str(rate_config.get("model_name", ""))
        existing = db.scalars(
            select(BillingModelRate).where(BillingModelRate.model_name == model_name)
        ).first()

        if existing is None:
            _insert_default_rate(db, model_name, rate_config)

    return True


__all__ = [
    "ensure_default_billing_rates",
    "list_admin_rates",
    "list_public_rates",
    "get_model_rate",
    "build_rate_payload",
    "enforce_mt_flash_only_rates",
]
