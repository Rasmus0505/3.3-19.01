"""LLM Writing Evaluation endpoints — Task 5 (Reading+Writing overhaul)."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers.llm_shared import (
    _require_api_key,
    recover_json_payload,
    require_collins_level,
    strip_json_fences,
)
from app.db import get_db
from app.models import User
from app.schemas import ErrorResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# ─── Request / Response models ────────────────────────────────────────────────


class WritingPromptRequest(BaseModel):
    article_text: str = Field(..., min_length=20)
    target_level: int = Field(3, ge=1, le=5)
    key_vocabulary: list[str] = Field(default_factory=list)


class WritingPromptResponse(BaseModel):
    ok: bool
    prompt: str
    guidance: str


class WritingEvaluateRequest(BaseModel):
    article_text: str = Field(..., min_length=20)
    writing_prompt: str
    user_response: str = Field(..., min_length=5)
    target_level: int = Field(3, ge=1, le=5)


class WritingEvaluateResponse(BaseModel):
    ok: bool
    evaluation: dict


# ─── Prompts ─────────────────────────────────────────────────────────────────

_PROMPT_SYSTEM = (
    "You are an English writing teacher helping a learner practice writing.\n"
    "Based on the article text, generate a writing prompt and guidance for the learner.\n"
    "The learner's Collins level is {target_level}, where 5 is easier and 1 is harder.\n"
    "\n"
    "Rules:\n"
    "- The prompt should ask the learner to write 2-4 sentences about the article.\n"
    "- For A1-A2: simple summarization or opinion (\"What is the main idea?\")\n"
    "- For B1-B2: deeper analysis (\"Compare...\", \"Explain why...\", \"What would you do if...\")\n"
    "- For C1-C2: critical thinking (\"Evaluate the argument...\", \"Propose an alternative...\")\n"
    "- The guidance should include helpful phrases and vocabulary the learner can use.\n"
    "- If key_vocabulary is provided, suggest using 2-3 of those words.\n"
    "- Output ONLY a valid JSON object: {{\"prompt\": \"...\", \"guidance\": \"...\"}}\n"
    "- No markdown fences, no explanation.\n"
)

_EVALUATE_SYSTEM = (
    "You are an English writing teacher evaluating a learner's writing.\n"
    "The learner's Collins level is {target_level}, where 5 is easier and 1 is harder.\n"
    "\n"
    "Evaluate the writing based on:\n"
    "1. Grammar correctness\n"
    "2. Vocabulary usage and variety\n"
    "3. Content relevance to the article\n"
    "4. Coherence and clarity\n"
    "\n"
    "Provide:\n"
    "- An overall score from 0-100\n"
    "- Brief overall feedback (2-3 sentences)\n"
    "- A list of specific grammar/vocabulary corrections\n"
    "- i+1 vocabulary suggestions (words slightly above their level they could try)\n"
    "\n"
    "Output ONLY a valid JSON object with this structure:\n"
    "{{\n"
    '  "score": 75,\n'
    '  "feedback": "Good effort! ...",\n'
    '  "corrections": [\n'
    '    {{"original": "...", "corrected": "...", "type": "grammar", "explanation": "..."}}\n'
    "  ],\n"
    '  "i1_suggestions": [\n'
    '    {{"original_word": "good", "suggested_word": "excellent", "level": "B2", "context": "..."}}\n'
    "  ]\n"
    "}}\n"
    "No markdown fences, no explanation.\n"
)


# ─── Message builders ────────────────────────────────────────────────────────


def _build_prompt_messages(article_text: str, target_level: str, key_vocabulary: list[str]) -> list[dict]:
    system = _PROMPT_SYSTEM.replace("{target_level}", target_level)
    vocab_str = ", ".join(key_vocabulary[:10]) if key_vocabulary else "(none provided)"
    user_content = (
        f"Target level: {target_level}\n\n"
        f"Article:\n{article_text[:4000]}\n\n"
        f"Key vocabulary: {vocab_str}"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]


def _build_evaluate_messages(
    article_text: str, writing_prompt: str, user_response: str, target_level: str
) -> list[dict]:
    system = _EVALUATE_SYSTEM.replace("{target_level}", target_level)
    user_content = (
        f"Target level: {target_level}\n\n"
        f"Article:\n{article_text[:3000]}\n\n"
        f"Writing prompt given to learner:\n{writing_prompt}\n\n"
        f"Learner's response:\n{user_response}"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]


# ─── Endpoints ───────────────────────────────────────────────────────────────


@router.post(
    "/writing/generate-prompt",
    response_model=WritingPromptResponse,
    responses={503: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def generate_writing_prompt_endpoint(
    body: WritingPromptRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.api.routers import llm as llm_root

    api_key = _require_api_key()
    llm_root.ensure_default_billing_rates(db)
    target_level = require_collins_level(body.target_level, field_name="target_level", default=3)

    messages = _build_prompt_messages(body.article_text, str(target_level), body.key_vocabulary)

    try:
        raw_response, usage = llm_root.call_deepseek(
            messages=messages,
            api_key=api_key,
            enable_thinking=False,
            stream=False,
            temperature=0.7,
        )
    except Exception as exc:
        logger.warning("Writing prompt generation LLM call failed: %s", exc)
        raise HTTPException(status_code=503, detail="LLM call failed") from exc

    recovered = recover_json_payload(raw_response) or strip_json_fences(raw_response)
    try:
        data = json.loads(recovered)
        if not isinstance(data, dict) or "prompt" not in data:
            raise ValueError("Missing 'prompt' field")
    except Exception as exc:
        logger.warning("Writing prompt JSON parse failed. Raw: %.300s", raw_response)
        raise HTTPException(status_code=422, detail="Writing prompt generation returned invalid JSON") from exc

    # Billing
    try:
        rate = llm_root.get_model_rate(db, llm_root.LLM_MODEL_DEEPSEEK_FAST)
        if rate:
            total_tokens = usage.prompt_tokens + usage.completion_tokens
            charge = llm_root.calculate_llm_charge_by_tokens(
                total_tokens=total_tokens,
                points_per_1k_tokens=rate.points_per_1k_tokens,
            )
            if charge > 0:
                llm_root.consume_points(
                    db,
                    user_id=current_user.id,
                    points=charge,
                    model_name=llm_root.LLM_MODEL_DEEPSEEK_FAST,
                    lesson_id=None,
                    event_type=llm_root.EVENT_CONSUME_LLM,
                    note=f"writing prompt generation, tokens={total_tokens}",
                )
                db.commit()
    except Exception:
        logger.warning("Writing prompt billing failed silently for user %s", current_user.id)

    return WritingPromptResponse(
        ok=True,
        prompt=data.get("prompt", ""),
        guidance=data.get("guidance", ""),
    )


@router.post(
    "/writing/evaluate",
    response_model=WritingEvaluateResponse,
    responses={503: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def evaluate_writing_endpoint(
    body: WritingEvaluateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.api.routers import llm as llm_root

    api_key = _require_api_key()
    llm_root.ensure_default_billing_rates(db)
    target_level = require_collins_level(body.target_level, field_name="target_level", default=3)

    messages = _build_evaluate_messages(
        body.article_text, body.writing_prompt, body.user_response, str(target_level)
    )

    try:
        raw_response, usage = llm_root.call_deepseek(
            messages=messages,
            api_key=api_key,
            enable_thinking=False,
            stream=False,
            temperature=0.5,
        )
    except Exception as exc:
        logger.warning("Writing evaluation LLM call failed: %s", exc)
        raise HTTPException(status_code=503, detail="LLM call failed") from exc

    recovered = recover_json_payload(raw_response) or strip_json_fences(raw_response)
    try:
        evaluation = json.loads(recovered)
        if not isinstance(evaluation, dict) or "score" not in evaluation:
            raise ValueError("Missing 'score' field")
    except Exception as exc:
        logger.warning("Writing evaluation JSON parse failed. Raw: %.300s", raw_response)
        raise HTTPException(status_code=422, detail="Writing evaluation returned invalid JSON") from exc

    # Billing
    try:
        rate = llm_root.get_model_rate(db, llm_root.LLM_MODEL_DEEPSEEK_FAST)
        if rate:
            total_tokens = usage.prompt_tokens + usage.completion_tokens
            charge = llm_root.calculate_llm_charge_by_tokens(
                total_tokens=total_tokens,
                points_per_1k_tokens=rate.points_per_1k_tokens,
            )
            if charge > 0:
                llm_root.consume_points(
                    db,
                    user_id=current_user.id,
                    points=charge,
                    model_name=llm_root.LLM_MODEL_DEEPSEEK_FAST,
                    lesson_id=None,
                    event_type=llm_root.EVENT_CONSUME_LLM,
                    note=f"writing evaluation, tokens={total_tokens}",
                )
                db.commit()
    except Exception:
        logger.warning("Writing evaluation billing failed silently for user %s", current_user.id)

    return WritingEvaluateResponse(ok=True, evaluation=evaluation)
