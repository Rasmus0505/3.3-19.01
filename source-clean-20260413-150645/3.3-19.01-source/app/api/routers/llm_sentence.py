from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers.llm_shared import CEFR_LEVELS, LLM_MODEL_DEEPSEEK_FAST
from app.db import get_db
from app.models import User
from app.schemas import ErrorResponse

router = APIRouter()


class SentenceExplanationRequest(BaseModel):
    sentence: str = Field(..., description="原始句子")
    words_above: list[dict] = Field(default=[], description="高于目标等级的词汇列表")
    target_level: str = Field(default="B1", description="用户目标 CEFR 等级")

    @field_validator("sentence")
    @classmethod
    def sentence_max_length(cls, value: str) -> str:
        if len(value) > 3000:
            raise ValueError("Sentence too long (max 3000 chars)")
        return value

    @field_validator("target_level")
    @classmethod
    def validate_target_level(cls, value: str) -> str:
        if value.upper() not in CEFR_LEVELS:
            raise ValueError(f"Invalid CEFR level '{value}'. Must be one of: {', '.join(sorted(CEFR_LEVELS))}")
        return value.upper()


class SentenceExplanationResponse(BaseModel):
    simplified_sentence: str = Field(..., description="简化后的句子")
    key_explanations: list[dict] = Field(default=[], description="关键词解释")
    listen_tips: str = Field(default="", description="听力技巧提示")


@router.post(
    "/explain-sentence",
    response_model=SentenceExplanationResponse,
    responses={503: {"model": ErrorResponse}, 402: {"model": ErrorResponse}},
)
def explain_sentence(
    body: SentenceExplanationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    为含有高于 i+1 词汇的句子生成讲解内容。
    返回简化句和关键词解释，用于听力前的讲解展示。
    """
    from app.api.routers import llm as llm_root
    from app.services.cefr_explain_service import CefrExplainService
    from app.services.llm_usage_service import log_llm_usage

    llm_root.ensure_default_billing_rates(db)

    try:
        rate = llm_root.get_model_rate(db, LLM_MODEL_DEEPSEEK_FAST)
    except Exception:
        raise HTTPException(status_code=503, detail="LLM model not available")

    trace_id = str(uuid.uuid4())
    service = CefrExplainService(db=db, target_level=body.target_level)
    result = service.generate_explanation(body.sentence, body.words_above)

    prompt_tokens = len(body.sentence.split()) * 2 + len(body.words_above) * 10
    completion_tokens = 150
    total_tokens = prompt_tokens + completion_tokens
    charge_cents = llm_root.calculate_llm_charge_by_tokens(
        total_tokens=total_tokens,
        points_per_1k_tokens=rate.points_per_1k_tokens,
    )

    try:
        llm_root.consume_points(
            db,
            user_id=current_user.id,
            points=charge_cents,
            model_name=LLM_MODEL_DEEPSEEK_FAST,
            lesson_id=None,
            event_type=llm_root.EVENT_CONSUME_LLM,
            note=f"生成句子讲解，total_tokens~={total_tokens}",
        )
    except Exception:
        pass

    log_llm_usage(
        db=db,
        user_id=current_user.id,
        model_name=LLM_MODEL_DEEPSEEK_FAST,
        category="llm",
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        input_cost_cents=None,
        charge_cents=charge_cents,
        lesson_id=None,
        enable_thinking=False,
        input_text_preview=body.sentence[:200],
        trace_id=trace_id,
    )

    db.commit()
    return SentenceExplanationResponse(**result)
