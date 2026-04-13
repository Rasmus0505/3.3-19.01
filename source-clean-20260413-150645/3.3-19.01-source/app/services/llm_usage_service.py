"""
LLM Token Usage Service — unified usage logging for ASR / MT / LLM.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Iterable

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models import LLMUsageLog
from app.models.billing import BillingModelRate
from app.services.billing import calculate_llm_charge_by_tokens, calculate_llm_cost_by_tokens


def _now() -> datetime:
    from app.core.timezone import now_shanghai_naive
    return now_shanghai_naive()


def _default_trace_id() -> str:
    return str(uuid.uuid4())


def log_llm_usage(
    db: Session,
    *,
    user_id: int,
    model_name: str,
    category: str,
    prompt_tokens: int,
    completion_tokens: int,
    reasoning_tokens: int = 0,
    total_tokens: int | None = None,
    input_cost_cents: int | None = None,
    charge_cents: int | None = None,
    lesson_id: int | None = None,
    enable_thinking: bool = False,
    input_text_preview: str = "",
    trace_id: str | None = None,
) -> LLMUsageLog:
    """
    Write a unified LLM/MT/ASR usage log entry.

    If input_cost_cents / charge_cents are not provided, they are calculated
    from the model's billing rate.
    """
    effective_total = total_tokens if total_tokens is not None else (prompt_tokens + completion_tokens)

    if input_cost_cents is None or charge_cents is None:
        rate = db.get(BillingModelRate, model_name)
        if rate is not None:
            if input_cost_cents is None:
                input_cost_cents = calculate_llm_cost_by_tokens(
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    cost_per_1k_tokens_input_cents=rate.cost_per_1k_tokens_input_cents,
                    cost_per_1k_tokens_output_cents=rate.cost_per_1k_tokens_output_cents,
                )
            if charge_cents is None:
                charge_cents = calculate_llm_charge_by_tokens(
                    total_tokens=effective_total,
                    points_per_1k_tokens=rate.points_per_1k_tokens,
                )
        else:
            if input_cost_cents is None:
                input_cost_cents = 0
            if charge_cents is None:
                charge_cents = 0

    effective_input_cost = max(0, int(input_cost_cents or 0))
    effective_charge = max(0, int(charge_cents or 0))
    gross_profit = effective_charge - effective_input_cost

    row = LLMUsageLog(
        user_id=user_id,
        trace_id=trace_id or _default_trace_id(),
        category=str(category or "llm").strip().lower(),
        model_name=str(model_name or "").strip(),
        prompt_tokens=max(0, int(prompt_tokens or 0)),
        completion_tokens=max(0, int(completion_tokens or 0)),
        reasoning_tokens=max(0, int(reasoning_tokens or 0)),
        total_tokens=max(0, int(effective_total or 0)),
        input_cost_cents=effective_input_cost,
        charge_cents=effective_charge,
        gross_profit_cents=gross_profit,
        enable_thinking=bool(enable_thinking),
        input_text_preview=str(input_text_preview or "")[:300],
        lesson_id=int(lesson_id) if lesson_id is not None else None,
        created_at=_now(),
    )
    db.add(row)
    db.flush()
    return row


def list_user_llm_usage(
    db: Session,
    *,
    user_id: int,
    page: int = 1,
    page_size: int = 20,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    category: str | None = None,
) -> tuple[list[LLMUsageLog], int]:
    """
    List a single user's LLM usage records with pagination.
    Returns (records, total_count).
    """
    page = max(1, int(page or 1))
    page_size = max(1, min(100, int(page_size or 20)))
    offset = (page - 1) * page_size

    conditions = [LLMUsageLog.user_id == user_id]
    if date_from is not None:
        conditions.append(LLMUsageLog.created_at >= date_from)
    if date_to is not None:
        conditions.append(LLMUsageLog.created_at <= date_to)
    if category:
        conditions.append(LLMUsageLog.category == str(category).strip().lower())

    where_clause = and_(*conditions)

    total = int(
        db.scalar(
            select(func.count(LLMUsageLog.id)).where(where_clause)
        )
        or 0
    )

    rows = list(
        db.scalars(
            select(LLMUsageLog)
            .where(where_clause)
            .order_by(LLMUsageLog.created_at.desc())
            .offset(offset)
            .limit(page_size)
        ).all()
    )
    return rows, total


def list_all_llm_usage(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 20,
    model_name: str | None = None,
    category: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    user_id: int | None = None,
) -> tuple[list[LLMUsageLog], int]:
    """
    List all LLM usage records (admin view) with filters and pagination.
    Returns (records, total_count).
    """
    page = max(1, int(page or 1))
    page_size = max(1, min(100, int(page_size or 20)))
    offset = (page - 1) * page_size

    conditions: list[object] = []
    if model_name:
        conditions.append(LLMUsageLog.model_name == str(model_name).strip())
    if category:
        conditions.append(LLMUsageLog.category == str(category).strip().lower())
    if date_from is not None:
        conditions.append(LLMUsageLog.created_at >= date_from)
    if date_to is not None:
        conditions.append(LLMUsageLog.created_at <= date_to)
    if user_id is not None:
        conditions.append(LLMUsageLog.user_id == int(user_id))

    where_clause = and_(*conditions) if conditions else True

    total = int(
        db.scalar(
            select(func.count(LLMUsageLog.id)).where(where_clause)  # type: ignore[arg-type]
        )
        or 0
    )

    rows = list(
        db.scalars(
            select(LLMUsageLog)
            .where(where_clause)  # type: ignore[arg-type]
            .order_by(LLMUsageLog.created_at.desc())
            .offset(offset)
            .limit(page_size)
        ).all()
    )
    return rows, total


def get_llm_usage_summary(
    db: Session,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    category: str | None = None,
    user_id: int | None = None,
) -> dict[str, object]:
    """
    Return aggregated usage summary (by model, by category).
    """
    conditions: list[object] = []
    if date_from is not None:
        conditions.append(LLMUsageLog.created_at >= date_from)
    if date_to is not None:
        conditions.append(LLMUsageLog.created_at <= date_to)
    if category:
        conditions.append(LLMUsageLog.category == str(category).strip().lower())
    if user_id is not None:
        conditions.append(LLMUsageLog.user_id == int(user_id))

    where_clause = and_(*conditions) if conditions else True

    by_model = db.execute(
        select(
            LLMUsageLog.model_name,
            func.count(LLMUsageLog.id).label("count"),
            func.sum(LLMUsageLog.prompt_tokens).label("prompt_tokens"),
            func.sum(LLMUsageLog.completion_tokens).label("completion_tokens"),
            func.sum(LLMUsageLog.total_tokens).label("total_tokens"),
            func.sum(LLMUsageLog.input_cost_cents).label("input_cost_cents"),
            func.sum(LLMUsageLog.charge_cents).label("charge_cents"),
            func.sum(LLMUsageLog.gross_profit_cents).label("gross_profit_cents"),
        )
        .where(where_clause)  # type: ignore[arg-type]
        .group_by(LLMUsageLog.model_name)
    ).fetchall()

    by_category = db.execute(
        select(
            LLMUsageLog.category,
            func.count(LLMUsageLog.id).label("count"),
            func.sum(LLMUsageLog.total_tokens).label("total_tokens"),
            func.sum(LLMUsageLog.input_cost_cents).label("input_cost_cents"),
            func.sum(LLMUsageLog.charge_cents).label("charge_cents"),
            func.sum(LLMUsageLog.gross_profit_cents).label("gross_profit_cents"),
        )
        .where(where_clause)  # type: ignore[arg-type]
        .group_by(LLMUsageLog.category)
    ).fetchall()

    return {
        "by_model": [
            {
                "model_name": str(row[0] or ""),
                "count": int(row[1] or 0),
                "prompt_tokens": int(row[2] or 0),
                "completion_tokens": int(row[3] or 0),
                "total_tokens": int(row[4] or 0),
                "input_cost_cents": int(row[5] or 0),
                "charge_cents": int(row[6] or 0),
                "gross_profit_cents": int(row[7] or 0),
            }
            for row in by_model
        ],
        "by_category": [
            {
                "category": str(row[0] or ""),
                "count": int(row[1] or 0),
                "total_tokens": int(row[2] or 0),
                "input_cost_cents": int(row[3] or 0),
                "charge_cents": int(row[4] or 0),
                "gross_profit_cents": int(row[5] or 0),
            }
            for row in by_category
        ],
    }
