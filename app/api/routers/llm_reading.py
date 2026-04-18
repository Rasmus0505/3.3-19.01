from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers.llm_shared import (
    LLM_MODEL_DEEPSEEK_FAST,
    LLM_MODEL_DEEPSEEK_THINKING,
    logger,
    require_collins_level,
)
from app.db import get_db
from app.models import User
from app.schemas import ErrorResponse

router = APIRouter()


@router.post(
    "/generate-reading-material",
    responses={503: {"model": ErrorResponse}, 402: {"model": ErrorResponse}},
)
def generate_reading_material_endpoint(
    words: list[dict[str, Any]],
    target_level: int = Query(default=3, ge=1, le=5),
    enable_thinking: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate reading material from word list using DeepSeek V3.2.
    Charges the user according to the selected model rate.
    """
    from app.api.routers import llm as llm_root
    from app.services.llm_usage_service import log_llm_usage

    llm_root.ensure_default_billing_rates(db)

    target_level = require_collins_level(target_level, field_name="target_level", default=3)

    effective_model = LLM_MODEL_DEEPSEEK_THINKING if enable_thinking else LLM_MODEL_DEEPSEEK_FAST

    try:
        rate = llm_root.get_model_rate(db, effective_model)
    except Exception:
        raise HTTPException(status_code=503, detail="LLM model not available")

    if not words or not isinstance(words, list):
        raise HTTPException(status_code=422, detail="words must be a non-empty list")

    api_key = llm_root._require_api_key()
    trace_id = str(uuid.uuid4())

    try:
        results = list(
            llm_root.generate_reading_material(
                user_words=words,
                target_level=target_level,
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
    charge_cents = llm_root.calculate_llm_charge_by_tokens(
        total_tokens=total_tokens,
        points_per_1k_tokens=rate.points_per_1k_tokens,
    )

    try:
        llm_root.consume_points(
            db,
            user_id=current_user.id,
            points=charge_cents,
            model_name=effective_model,
            lesson_id=None,
            event_type=llm_root.EVENT_CONSUME_LLM,
            note=f"生成阅读材料，total_tokens={total_tokens}, enable_thinking={enable_thinking}",
        )
    except Exception as exc:
        logger.warning(
            "[DEBUG] llm.consume_failed user_id=%s charge_cents=%s error=%s",
            current_user.id,
            charge_cents,
            str(exc)[:200],
        )

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
