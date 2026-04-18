"""LLM Quiz Generation endpoint — Phase 41."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers.llm_shared import _require_api_key, recover_json_payload, require_collins_level, strip_json_fences
from app.db import get_db
from app.models import User
from app.schemas import ErrorResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# ─── Request / Response models ────────────────────────────────────────────────


class QuizGenerateRequest(BaseModel):
    pack_text: str
    original_text: str
    target_level: int


class QuizGenerateResponse(BaseModel):
    ok: bool
    questions: list[dict]


# ─── Prompt ───────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = (
    "You are an English language teacher creating comprehension questions for a learner.\n"
    "Generate 5-8 questions based on the provided text. Mix three types:\n"
    "1. MCQ (multiple choice): {\"type\":\"mcq\",\"question\":\"...\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"answer\":\"A\"}\n"
    "   - 'answer' must be one of the option strings (not a label like A/B/C/D)\n"
    "2. Fill-in-the-blank: {\"type\":\"fill\",\"sentence\":\"He ___ to the store.\",\"answer\":\"went\"}\n"
    "   - Use ___ (three underscores) as placeholder in the sentence\n"
    "   - 'answer' must be a single word or short phrase\n"
    "3. Sentence ordering: {\"type\":\"order\",\"sentences\":[\"s1\",\"s2\",\"s3\"],\"correct_order\":[2,0,1]}\n"
    "   - 'correct_order' is the indices of 'sentences' in the correct reading order\n"
    "   - Use 3-4 sentences per ordering question\n"
    "\n"
    "Rules:\n"
    "- Target Collins level: {target_level}\n"
    "- Questions must test comprehension, not surface recall\n"
    "- Aim for: ~3 MCQ, ~2 fill, ~1-2 order questions\n"
    "- Output ONLY a valid JSON array. No markdown fences, no explanation.\n"
)


def _build_messages(pack_text: str, original_text: str, target_level: str) -> list[dict]:
    system = _SYSTEM_PROMPT.replace("{target_level}", target_level)
    user_content = (
        f"Target level: {target_level}\n\n"
        f"Text to test comprehension on:\n{pack_text[:4000]}\n\n"
        f"Original text (for context only):\n{original_text[:2000]}"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]


# ─── Validation ───────────────────────────────────────────────────────────────


def _validate_question(q: dict) -> bool:
    """Return True if q has the required fields for its type."""
    q_type = q.get("type")
    if q_type == "mcq":
        return (
            isinstance(q.get("question"), str)
            and isinstance(q.get("options"), list)
            and len(q["options"]) >= 2
            and isinstance(q.get("answer"), str)
        )
    if q_type == "fill":
        return (
            isinstance(q.get("sentence"), str)
            and "___" in q["sentence"]
            and isinstance(q.get("answer"), str)
        )
    if q_type == "order":
        return (
            isinstance(q.get("sentences"), list)
            and len(q["sentences"]) >= 2
            and isinstance(q.get("correct_order"), list)
            and len(q["correct_order"]) == len(q["sentences"])
        )
    return False


# ─── Endpoint ─────────────────────────────────────────────────────────────────


@router.post(
    "/quiz/generate",
    response_model=QuizGenerateResponse,
    responses={503: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def generate_quiz_endpoint(
    body: QuizGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.api.routers import llm as llm_root

    if not body.pack_text or len(body.pack_text.split()) < 50:
        raise HTTPException(status_code=422, detail="Text too short to generate quiz")

    api_key = _require_api_key()
    target_level = require_collins_level(body.target_level, field_name="target_level", default=3)

    llm_root.ensure_default_billing_rates(db)

    messages = _build_messages(body.pack_text, body.original_text, str(target_level))

    try:
        raw_response, usage = llm_root.call_deepseek(
            messages=messages,
            api_key=api_key,
            enable_thinking=False,
            stream=False,
            temperature=0.7,
        )
    except Exception as exc:
        logger.warning("Quiz generation LLM call failed: %s", exc)
        raise HTTPException(status_code=503, detail="LLM call failed") from exc

    # Parse JSON
    recovered = recover_json_payload(raw_response) or strip_json_fences(raw_response)
    try:
        questions_raw = json.loads(recovered)
        if not isinstance(questions_raw, list):
            raise ValueError("Expected a JSON array")
    except Exception as exc:
        logger.warning("Quiz JSON parse failed. Raw: %.300s", raw_response)
        raise HTTPException(status_code=422, detail="Quiz generation returned invalid JSON") from exc

    # Validate and filter questions
    valid_questions = [q for q in questions_raw if isinstance(q, dict) and _validate_question(q)]
    if not valid_questions:
        raise HTTPException(status_code=422, detail="No valid questions in LLM response")

    # Billing — deduct points; silent failure so quiz still returns on billing error
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
                    note=f"quiz generation, tokens={total_tokens}",
                )
                db.commit()
    except Exception:
        logger.warning("Quiz billing failed silently for user %s", current_user.id)

    return QuizGenerateResponse(ok=True, questions=valid_questions)
