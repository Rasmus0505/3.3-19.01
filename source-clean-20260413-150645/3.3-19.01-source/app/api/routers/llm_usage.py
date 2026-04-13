from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers.llm_shared import (
    LLM_MODEL_DEEPSEEK_THINKING,
    LLM_VALID_MODELS,
)
from app.db import get_db
from app.models import User
from app.services.llm_usage_service import list_user_llm_usage

router = APIRouter()


@router.get("/usage")
def list_llm_usage_endpoint(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    category: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List current user's LLM usage records."""
    rows, total = list_user_llm_usage(
        db,
        user_id=current_user.id,
        page=page,
        page_size=page_size,
        date_from=date_from,
        date_to=date_to,
        category=category,
    )
    return {
        "ok": True,
        "records": [
            {
                "id": row.id,
                "trace_id": row.trace_id,
                "category": row.category,
                "model_name": row.model_name,
                "prompt_tokens": row.prompt_tokens,
                "completion_tokens": row.completion_tokens,
                "reasoning_tokens": row.reasoning_tokens,
                "total_tokens": row.total_tokens,
                "input_cost_cents": row.input_cost_cents,
                "charge_cents": row.charge_cents,
                "gross_profit_cents": row.gross_profit_cents,
                "enable_thinking": row.enable_thinking,
                "lesson_id": row.lesson_id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/models")
def list_llm_models_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List available LLM models with pricing."""
    from app.api.routers import llm as llm_root

    models = []
    for model_name in sorted(LLM_VALID_MODELS):
        try:
            rate = llm_root.get_model_rate(db, model_name)
            models.append(
                {
                    "model_name": model_name,
                    "display_name": (
                        "DeepSeek V3.2 (思考模式)"
                        if model_name == LLM_MODEL_DEEPSEEK_THINKING
                        else "DeepSeek V3.2 (快速模式)"
                    ),
                    "enable_thinking": model_name == LLM_MODEL_DEEPSEEK_THINKING,
                    "points_per_1k_tokens": rate.points_per_1k_tokens,
                    "price_per_1k_tokens_yuan": rate.points_per_1k_tokens / 100.0,
                    "cost_per_1k_tokens_input_cents": rate.cost_per_1k_tokens_input_cents,
                    "cost_per_1k_tokens_output_cents": rate.cost_per_1k_tokens_output_cents,
                    "is_active": rate.is_active,
                }
            )
        except Exception:
            continue
    return {"ok": True, "models": models}


@router.get("/estimate-tokens")
def estimate_tokens_endpoint(
    text: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
):
    """
    估算给定文本的 token 数量（用于在重写前显示费用估算）。
    使用简单估算：英文约 4 字符/token。
    """
    from app.api.routers import llm as llm_root
    from app.db.session import SessionLocal

    char_count = len(text)
    estimated_tokens = max(1, char_count // 4)
    prompt_est = estimated_tokens
    completion_est = estimated_tokens // 2
    total_est = prompt_est + completion_est

    db = SessionLocal()
    try:
        rate = llm_root.get_model_rate(db, "deepseek-v3.2")
        est_charge = int(total_est * rate.points_per_1k_tokens / 10)
    except Exception:
        est_charge = int(total_est * 5)
    finally:
        db.close()

    return {
        "ok": True,
        "char_count": char_count,
        "estimated_tokens": total_est,
        "estimated_charge_cents": est_charge,
        "estimated_charge_yuan": est_charge / 100.0,
    }
