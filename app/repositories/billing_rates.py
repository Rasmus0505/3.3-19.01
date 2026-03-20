from __future__ import annotations

import logging
from datetime import datetime
from types import SimpleNamespace

from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.db import APP_SCHEMA
from app.models import BillingModelRate
from app.models.billing import cents_to_rate_yuan, normalize_rate_yuan, rate_yuan_to_compat_cents


logger = logging.getLogger(__name__)


def _qualified_table(db: Session, table_name: str) -> str:
    bind = db.get_bind()
    if bind is not None and bind.dialect.name != "sqlite":
        return f"{APP_SCHEMA}.{table_name}"
    return table_name


def _schema_name(db: Session) -> str | None:
    bind = db.get_bind()
    if bind is not None and bind.dialect.name != "sqlite":
        return APP_SCHEMA
    return None


def _legacy_select_expr(column_names: set[str], column_name: str, fallback_sql: str) -> str:
    return column_name if column_name in column_names else f"{fallback_sql} AS {column_name}"


def _quantize_rate_yuan(value: object, *, fallback_cents: int = 0):
    if value not in (None, ""):
        return normalize_rate_yuan(value)
    return cents_to_rate_yuan(int(fallback_cents or 0))


def list_billing_rates(db: Session, *, active_only: bool = False) -> list[BillingModelRate | SimpleNamespace]:
    bind = db.get_bind()
    inspector = inspect(bind)
    schema = _schema_name(db)
    if not inspector.has_table(BillingModelRate.__tablename__, schema=schema):
        return []

    column_names = {
        str(item.get("name") or "").strip()
        for item in inspector.get_columns(BillingModelRate.__tablename__, schema=schema)
    }
    required_columns = {
        "points_per_1k_tokens",
        "cost_per_minute_cents",
        "price_per_minute_yuan",
        "cost_per_minute_yuan",
        "billing_unit",
        "parallel_enabled",
        "parallel_threshold_seconds",
        "segment_seconds",
        "max_concurrency",
    }
    if required_columns.issubset(column_names):
        stmt = select(BillingModelRate).order_by(BillingModelRate.model_name.asc())
        if active_only:
            stmt = stmt.where(BillingModelRate.is_active.is_(True))
        return list(db.scalars(stmt).all())

    logger.warning(
        "[DEBUG] billing_rates.partial_schema missing=%s",
        ",".join(sorted(required_columns - column_names)),
    )
    table_name = _qualified_table(db, BillingModelRate.__tablename__)
    where_clause = "WHERE is_active = TRUE" if active_only and "is_active" in column_names else ""
    rows = db.execute(
        text(
            f"""
            SELECT
                model_name,
                points_per_minute,
                {_legacy_select_expr(column_names, "points_per_1k_tokens", "0")},
                {_legacy_select_expr(column_names, "cost_per_minute_cents", "0")},
                {_legacy_select_expr(column_names, "price_per_minute_yuan", "ROUND(COALESCE(points_per_minute, 0) / 100.0, 4)")},
                {_legacy_select_expr(column_names, "cost_per_minute_yuan", "ROUND(COALESCE(cost_per_minute_cents, 0) / 100.0, 4)")},
                {_legacy_select_expr(column_names, "billing_unit", "'minute'")},
                {_legacy_select_expr(column_names, "is_active", "TRUE")},
                {_legacy_select_expr(column_names, "parallel_enabled", "FALSE")},
                {_legacy_select_expr(column_names, "parallel_threshold_seconds", "600")},
                {_legacy_select_expr(column_names, "segment_seconds", "300")},
                {_legacy_select_expr(column_names, "max_concurrency", "2")},
                updated_at
            FROM {table_name}
            {where_clause}
            ORDER BY model_name ASC
            """
        )
    ).mappings().all()
    items: list[SimpleNamespace] = []
    for row in rows:
        payload = dict(row)
        price_per_minute_yuan = _quantize_rate_yuan(
            payload.get("price_per_minute_yuan"),
            fallback_cents=int(payload.get("points_per_minute", 0) or 0),
        )
        cost_per_minute_yuan = _quantize_rate_yuan(
            payload.get("cost_per_minute_yuan"),
            fallback_cents=int(payload.get("cost_per_minute_cents", 0) or 0),
        )
        payload["price_per_minute_yuan"] = price_per_minute_yuan
        payload["cost_per_minute_yuan"] = cost_per_minute_yuan
        payload["price_per_minute_cents"] = rate_yuan_to_compat_cents(price_per_minute_yuan)
        payload["points_per_minute"] = payload["price_per_minute_cents"]
        payload["cost_per_1k_tokens_cents"] = int(payload.get("points_per_1k_tokens", 0) or 0)
        payload["cost_per_minute_cents"] = rate_yuan_to_compat_cents(cost_per_minute_yuan)
        payload["gross_profit_per_minute_yuan"] = normalize_rate_yuan(price_per_minute_yuan - cost_per_minute_yuan)
        payload["gross_profit_per_minute_cents"] = int(payload["price_per_minute_cents"]) - int(payload.get("cost_per_minute_cents", 0) or 0)
        updated_at = payload.get("updated_at")
        if isinstance(updated_at, str):
            try:
                payload["updated_at"] = datetime.fromisoformat(updated_at)
            except Exception:
                payload["updated_at"] = datetime.utcnow()
        items.append(SimpleNamespace(**payload))
    return items


def get_billing_rate(db: Session, model_name: str) -> BillingModelRate | None:
    return db.get(BillingModelRate, model_name)
