"""
LLM API Router — DeepSeek V3.2 endpoints for reading material generation.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.config import DASHSCOPE_API_KEY
from app.core.errors import error_response
from app.core.timezone import now_shanghai_naive
from app.db import get_db
from app.infra.llm.deepseek import call_deepseek, generate_reading_material
from app.models import User
from app.schemas import ErrorResponse
from app.services.billing_service import (
    EVENT_CONSUME_LLM,
    calculate_llm_charge_by_tokens,
    consume_points,
    ensure_default_billing_rates,
    get_model_rate,
)
from app.services.llm_usage_service import get_llm_usage_summary, list_user_llm_usage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/llm", tags=["llm"])

LLM_MODEL_DEEPSEEK_THINKING = "deepseek-v3.2"
LLM_MODEL_DEEPSEEK_FAST = "deepseek-v3.2"
LLM_VALID_MODELS = {"deepseek-v3.2"}  # 你的 API Key 只有 deepseek-v3.2 的访问权限
CEFR_LEVELS = {"A1", "A2", "B1", "B2", "C1", "C2"}


class RewriteTextRequest(BaseModel):
    """JSON body for POST /rewrite-text (matches frontend useReadingRewrite)."""

    text: str = Field(..., min_length=1)
    target_level: str = Field(default="B1", max_length=8)
    enable_thinking: bool = False


def _require_api_key() -> str:
    key = DASHSCOPE_API_KEY
    if not key or not str(key).strip():
        raise HTTPException(status_code=503, detail="LLM API key not configured")
    return str(key).strip()


@router.post(
    "/generate-reading-material",
    responses={503: {"model": ErrorResponse}, 402: {"model": ErrorResponse}},
)
def generate_reading_material_endpoint(
    words: list[dict[str, Any]],
    target_level: str = Query(default="A2", max_length=4),
    enable_thinking: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate reading material from word list using DeepSeek V3.2.
    Charges the user according to the selected model rate.
    """
    # 确保计费配置已初始化
    ensure_default_billing_rates(db)

    if target_level.upper() not in CEFR_LEVELS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid target_level '{target_level}'. Must be one of: {', '.join(sorted(CEFR_LEVELS))}",
        )

    effective_model = LLM_MODEL_DEEPSEEK_THINKING if enable_thinking else LLM_MODEL_DEEPSEEK_FAST

    try:
        rate = get_model_rate(db, effective_model)
    except Exception:
        raise HTTPException(status_code=503, detail="LLM model not available")

    if not words or not isinstance(words, list):
        raise HTTPException(status_code=422, detail="words must be a non-empty list")

    api_key = _require_api_key()
    trace_id = str(uuid.uuid4())

    try:
        results = list(
            generate_reading_material(
                user_words=words,
                target_level=target_level.upper(),
                enable_thinking=enable_thinking,
                api_key=api_key,
            )
        )
    except Exception as exc:
        logger.exception("[DEBUG] llm.generate_failed user_id=%s error=%s", current_user.id, str(exc)[:200])
        raise HTTPException(status_code=502, detail=f"LLM call failed: {str(exc)[:200]}")

    if not results:
        raise HTTPException(status_code=502, detail="LLM returned empty result")

    content, usage = results[0]
    total_tokens = usage.prompt_tokens + usage.completion_tokens

    from app.services.billing_service import calculate_llm_charge_by_tokens

    charge_cents = calculate_llm_charge_by_tokens(
        total_tokens=total_tokens,
        points_per_1k_tokens=rate.points_per_1k_tokens,
    )

    try:
        consume_points(
            db,
            user_id=current_user.id,
            points=charge_cents,
            model_name=effective_model,
            lesson_id=None,
            event_type=EVENT_CONSUME_LLM,
            note=f"生成阅读材料，total_tokens={total_tokens}, enable_thinking={enable_thinking}",
        )
    except Exception as exc:
        logger.warning(
            "[DEBUG] llm.consume_failed user_id=%s charge_cents=%s error=%s",
            current_user.id,
            charge_cents,
            str(exc)[:200],
        )

    from app.services.llm_usage_service import log_llm_usage

    log_llm_usage(
        db,
        user_id=current_user.id,
        model_name=effective_model,
        category="llm",
        prompt_tokens=usage.prompt_tokens,
        completion_tokens=usage.completion_tokens,
        reasoning_tokens=usage.reasoning_tokens,
        total_tokens=total_tokens,
        input_cost_cents=None,
        charge_cents=charge_cents,
        lesson_id=None,
        enable_thinking=enable_thinking,
        input_text_preview="",
        trace_id=trace_id,
    )

    db.commit()

    return {
        "ok": True,
        "content": content,
        "model": effective_model,
        "usage": {
            "prompt_tokens": usage.prompt_tokens,
            "completion_tokens": usage.completion_tokens,
            "reasoning_tokens": usage.reasoning_tokens,
            "total_tokens": total_tokens,
        },
        "charge_cents": charge_cents,
        "trace_id": trace_id,
    }


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
    """
    List current user's LLM usage records.
    """
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
                "id": r.id,
                "trace_id": r.trace_id,
                "category": r.category,
                "model_name": r.model_name,
                "prompt_tokens": r.prompt_tokens,
                "completion_tokens": r.completion_tokens,
                "reasoning_tokens": r.reasoning_tokens,
                "total_tokens": r.total_tokens,
                "input_cost_cents": r.input_cost_cents,
                "charge_cents": r.charge_cents,
                "gross_profit_cents": r.gross_profit_cents,
                "enable_thinking": r.enable_thinking,
                "lesson_id": r.lesson_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
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
    """
    List available LLM models with pricing.
    """
    models = []
    for model_name in sorted(LLM_VALID_MODELS):
        try:
            rate = get_model_rate(db, model_name)
            models.append({
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
            })
        except Exception:
            pass
    return {"ok": True, "models": models}


# ============================================================
# 原有的阅读材料生成接口
# ============================================================

REWRITE_SYSTEM_PROMPT = (
    "You are an English text simplifier for language learners.\n"
    "Rewrite the given text at CEFR {target_level} level.\n"
    "Rules:\n"
    "- Replace complex vocabulary with simpler CEFR {target_level} equivalents\n"
    "- Keep sentence structure clear and understandable\n"
    "- Preserve the original meaning and key information\n"
    "- Output only the rewritten text, no explanations or markers\n"
    "- Keep approximately the same length as the original\n"
)

REWRITE_MAX_INPUT_CHARS = 12000
REWRITE_MAX_OUTPUT_TOKENS = 2048
REWRITE_MAX_INPUT_TOKENS = 3000


@router.post(
    "/rewrite-text",
    responses={503: {"model": ErrorResponse}, 402: {"model": ErrorResponse}},
)
def rewrite_text_endpoint(
    body: RewriteTextRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Rewrite given English text at CEFR target_level using DeepSeek V3.2.
    Charges the user according to the selected model rate.

    Expects a JSON body: {"text": "...", "target_level": "B2", "enable_thinking": false}.
    """
    # 确保计费配置已初始化
    try:
        ensure_default_billing_rates(db)
    except Exception as e:
        logger.exception("[DEBUG] llm.ensure_billing_rates_failed: %s", str(e)[:200])

    text = body.text.strip()
    target_level = body.target_level.strip()
    enable_thinking = body.enable_thinking

    if target_level.upper() not in CEFR_LEVELS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid target_level '{target_level}'. Must be one of: {', '.join(sorted(CEFR_LEVELS))}",
        )

    if not text:
        raise HTTPException(status_code=422, detail="text must be a non-empty string")

    if len(text) > REWRITE_MAX_INPUT_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"Text too long ({len(text)} chars). Maximum is {REWRITE_MAX_INPUT_CHARS} chars (~{REWRITE_MAX_INPUT_TOKENS} tokens).",
        )

    effective_model = LLM_MODEL_DEEPSEEK_THINKING if enable_thinking else LLM_MODEL_DEEPSEEK_FAST

    try:
        rate = get_model_rate(db, effective_model)
    except Exception as e:
        logger.exception("[DEBUG] llm.get_model_rate failed model=%s error=%s", effective_model, str(e)[:200])
        raise HTTPException(status_code=503, detail="LLM model not available")

    api_key = _require_api_key()
    if not api_key:
        logger.error("[DEBUG] llm.api_key_missing")
        raise HTTPException(status_code=503, detail="LLM API key not configured")

    trace_id = str(uuid.uuid4())

    system_prompt = REWRITE_SYSTEM_PROMPT.format(target_level=target_level.upper())
    logger.info("[DEBUG] llm.rewrite_start user_id=%s model=%s enable_thinking=%s text_len=%d",
                 current_user.id, effective_model, enable_thinking, len(text))
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": text},
    ]

    try:
        rewritten_text, usage = call_deepseek(
            messages=messages,
            api_key=api_key,
            enable_thinking=enable_thinking,
            stream=False,
            temperature=0.3,
            max_tokens=REWRITE_MAX_OUTPUT_TOKENS,
        )
    except Exception as exc:
        logger.exception("[DEBUG] llm.rewrite_failed user_id=%s error=%s", current_user.id, str(exc)[:200])
        raise HTTPException(status_code=502, detail=f"LLM call failed: {str(exc)[:200]}")

    if not rewritten_text:
        raise HTTPException(status_code=502, detail="LLM returned empty result")

    total_tokens = usage.prompt_tokens + usage.completion_tokens

    from app.services.billing_service import calculate_llm_charge_by_tokens

    charge_cents = calculate_llm_charge_by_tokens(
        total_tokens=total_tokens,
        points_per_1k_tokens=rate.points_per_1k_tokens,
    )

    try:
        consume_points(
            db,
            user_id=current_user.id,
            points=charge_cents,
            model_name=effective_model,
            lesson_id=None,
            event_type=EVENT_CONSUME_LLM,
            note=f"重写文本，total_tokens={total_tokens}, enable_thinking={enable_thinking}",
        )
    except Exception:
        pass

    from app.services.llm_usage_service import log_llm_usage

    log_llm_usage(
        db,
        user_id=current_user.id,
        model_name=effective_model,
        category="rewrite",
        prompt_tokens=usage.prompt_tokens,
        completion_tokens=usage.completion_tokens,
        reasoning_tokens=usage.reasoning_tokens,
        total_tokens=total_tokens,
        input_cost_cents=None,
        charge_cents=charge_cents,
        lesson_id=None,
        enable_thinking=enable_thinking,
        input_text_preview=text[:200],
        trace_id=trace_id,
    )

    db.commit()

    return {
        "ok": True,
        "rewritten_text": rewritten_text,
        "model": effective_model,
        "usage": {
            "prompt_tokens": usage.prompt_tokens,
            "completion_tokens": usage.completion_tokens,
            "reasoning_tokens": usage.reasoning_tokens,
            "total_tokens": total_tokens,
        },
        "charge_cents": charge_cents,
        "trace_id": trace_id,
    }
