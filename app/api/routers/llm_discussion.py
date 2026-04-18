"""LLM Discussion Script Generation — generates a Teacher+Student dialogue about an article."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers.llm_shared import _require_api_key, recover_json_payload, require_collins_level, strip_json_fences
from app.db import get_db
from app.models import User
from app.schemas import ErrorResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# ─── Request / Response models ────────────────────────────────────────────────


class DiscussionGenerateRequest(BaseModel):
    article_text: str = Field(..., min_length=20)
    target_level: int = Field(3, ge=1, le=5)
    key_vocabulary: list[str] = Field(default_factory=list)
    explanation_language: str = Field("zh", pattern="^(zh|en)$")


class DiscussionMessage(BaseModel):
    role: str
    content: str


class DiscussionGenerateResponse(BaseModel):
    ok: bool
    discussion: dict


# ─── Prompts ─────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT_ZH = """\
You are a script writer for an English learning classroom discussion.
Write a natural dialogue between a Teacher and a Student about the provided article.

## Roles
- **Teacher**: An experienced, encouraging English teacher. Explains key points using a MIX of Chinese and English (use Chinese for explanations, keep English terms/examples in English). Uses simple language appropriate for the student's level.
- **Student**: A curious learner around Collins {target_level}. Asks questions a real student would ask — about vocabulary, grammar, or meaning. Speaks mostly in English with occasional Chinese when confused.

## Rules
- Generate 8-12 messages, alternating Teacher and Student
- Teacher should START the conversation by introducing the article topic
- Cover: article theme, 2-3 key vocabulary words, one grammar point, and a comprehension check
- Teacher explains vocabulary IN CONTEXT (not dictionary definitions)
- Student asks genuine questions, not just "yes teacher"
- Keep each message 1-3 sentences (natural conversation length)
- The conversation should feel like a real tutoring session

## Key vocabulary to cover
{vocabulary_list}

## Output
Return ONLY valid JSON (no markdown fences):
{{
  "messages": [
    {{"role": "teacher", "content": "..."}},
    {{"role": "student", "content": "..."}}
  ],
  "key_vocabulary": ["word1", "word2"],
  "summary": "One-sentence summary of what was discussed"
}}
"""

_SYSTEM_PROMPT_EN = """\
You are a script writer for an English learning classroom discussion.
Write a natural dialogue between a Teacher and a Student about the provided article.

## Roles
- **Teacher**: An experienced, encouraging English teacher. Explains everything in clear, simple English appropriate for the student's level. Uses examples and analogies.
- **Student**: A curious learner around Collins {target_level}. Asks questions a real student would ask — about vocabulary, grammar, or meaning.

## Rules
- Generate 8-12 messages, alternating Teacher and Student
- Teacher should START the conversation by introducing the article topic
- Cover: article theme, 2-3 key vocabulary words, one grammar point, and a comprehension check
- Teacher explains vocabulary IN CONTEXT (not dictionary definitions)
- Student asks genuine questions, not just "yes teacher"
- Keep each message 1-3 sentences (natural conversation length)
- All dialogue in English only

## Key vocabulary to cover
{vocabulary_list}

## Output
Return ONLY valid JSON (no markdown fences):
{{
  "messages": [
    {{"role": "teacher", "content": "..."}},
    {{"role": "student", "content": "..."}}
  ],
  "key_vocabulary": ["word1", "word2"],
  "summary": "One-sentence summary of what was discussed"
}}
"""


def _build_messages(
    article_text: str,
    target_level: str,
    key_vocabulary: list[str],
    explanation_language: str,
) -> list[dict]:
    vocab_str = ", ".join(key_vocabulary[:10]) if key_vocabulary else "(use your judgment to pick important words)"

    template = _SYSTEM_PROMPT_ZH if explanation_language == "zh" else _SYSTEM_PROMPT_EN
    system = template.format(target_level=target_level, vocabulary_list=vocab_str)

    user_content = (
        f"Collins target level: {target_level}\n\n"
        f"Article:\n{article_text[:5000]}"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]


# ─── Validation ──────────────────────────────────────────────────────────────


def _validate_discussion(data: dict) -> dict | None:
    messages = data.get("messages")
    if not isinstance(messages, list) or len(messages) < 4:
        return None
    valid_messages = []
    for msg in messages:
        if (
            isinstance(msg, dict)
            and msg.get("role") in ("teacher", "student")
            and isinstance(msg.get("content"), str)
            and len(msg["content"].strip()) > 0
        ):
            valid_messages.append({"role": msg["role"], "content": msg["content"].strip()})
    if len(valid_messages) < 4:
        return None
    return {
        "messages": valid_messages,
        "key_vocabulary": data.get("key_vocabulary", []),
        "summary": data.get("summary", ""),
    }


# ─── Endpoint ────────────────────────────────────────────────────────────────


@router.post(
    "/discussion/generate",
    response_model=DiscussionGenerateResponse,
    responses={503: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def generate_discussion_endpoint(
    body: DiscussionGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.api.routers import llm as llm_root

    api_key = _require_api_key()
    llm_root.ensure_default_billing_rates(db)
    target_level = require_collins_level(body.target_level, field_name="target_level", default=3)

    messages = _build_messages(
        article_text=body.article_text,
        target_level=str(target_level),
        key_vocabulary=body.key_vocabulary,
        explanation_language=body.explanation_language,
    )

    try:
        raw_response, usage = llm_root.call_deepseek(
            messages=messages,
            api_key=api_key,
            enable_thinking=False,
            stream=False,
            temperature=0.7,
            max_tokens=2048,
        )
    except Exception as exc:
        logger.warning("Discussion generation LLM call failed: %s", exc)
        raise HTTPException(status_code=503, detail="LLM call failed") from exc

    # Parse JSON
    recovered = recover_json_payload(raw_response) or strip_json_fences(raw_response)
    try:
        parsed = json.loads(recovered)
        if not isinstance(parsed, dict):
            raise ValueError("Expected a JSON object")
    except Exception as exc:
        logger.warning("Discussion JSON parse failed. Raw: %.300s", raw_response)
        raise HTTPException(status_code=422, detail="Discussion generation returned invalid JSON") from exc

    discussion = _validate_discussion(parsed)
    if not discussion:
        raise HTTPException(status_code=422, detail="Discussion validation failed — too few valid messages")

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
                    note=f"discussion generation, tokens={total_tokens}",
                )
                db.commit()
    except Exception:
        logger.warning("Discussion billing failed silently for user %s", current_user.id)

    return DiscussionGenerateResponse(ok=True, discussion=discussion)
