"""Vocabulary Card generation endpoints — Phase 42."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers.llm_shared import _require_api_key, recover_json_payload, strip_json_fences
from app.db import get_db
from app.models import User
from app.schemas.vocab_cards import (
    VocabCardGenerateRequest,
    VocabCardGenerateResponse,
    VocabCardImageRequest,
    VocabCardImageResponse,
    VocabCardResult,
)
from app.schemas import ErrorResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/vocab-cards", tags=["vocab-cards"])

# ─── LLM Prompt ──────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = (
    "You are an English vocabulary teacher creating flashcard content.\n"
    "For each word provided, generate:\n"
    "1. A concise definition in English (one sentence, suitable for CEFR {target_level} learners)\n"
    "2. A Chinese definition (简明中文释义)\n"
    "3. One example sentence from or inspired by the provided text context\n"
    "\n"
    "Output ONLY a valid JSON array. Each element:\n"
    '{{"word":"...","definition":"...","definition_zh":"...","example_sentence":"..."}}\n'
    "\n"
    "Rules:\n"
    "- Keep definitions clear and age-appropriate\n"
    "- Example sentences should use the word naturally in context\n"
    "- Target CEFR level: {target_level}\n"
    "- No markdown fences, no extra explanation\n"
)


def _build_messages(words: list[dict], target_level: str, context_text: str) -> list[dict]:
    system = _SYSTEM_PROMPT.replace("{target_level}", target_level)
    word_list = ", ".join(w["word"] for w in words)
    user_content = (
        f"Target level: {target_level}\n\n"
        f"Words to define: {word_list}\n\n"
        f"Text context:\n{context_text[:4000]}"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]


# ─── Card text generation ────────────────────────────────────────────────────


@router.post(
    "/generate",
    response_model=VocabCardGenerateResponse,
    responses={503: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def generate_vocab_cards(
    body: VocabCardGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.api.routers import llm as llm_root

    if not body.words or len(body.words) > 10:
        raise HTTPException(status_code=422, detail="Provide 1-10 words")

    api_key = _require_api_key()
    llm_root.ensure_default_billing_rates(db)

    word_dicts = [{"word": w.word, "cefr_level": w.cefr_level} for w in body.words]
    messages = _build_messages(word_dicts, body.target_level, body.context_text)

    try:
        raw_response, usage = llm_root.call_deepseek(
            messages=messages,
            api_key=api_key,
            enable_thinking=False,
            stream=False,
            temperature=0.7,
        )
    except Exception as exc:
        logger.warning("Vocab card LLM call failed: %s", exc)
        raise HTTPException(status_code=503, detail="LLM call failed") from exc

    recovered = recover_json_payload(raw_response) or strip_json_fences(raw_response)
    try:
        cards_raw = json.loads(recovered)
        if not isinstance(cards_raw, list):
            raise ValueError("Expected a JSON array")
    except Exception as exc:
        logger.warning("Vocab card JSON parse failed. Raw: %.300s", raw_response)
        raise HTTPException(status_code=422, detail="Card generation returned invalid JSON") from exc

    # Build result, matching by word
    word_input_map = {w.word.lower(): w for w in body.words}
    cards: list[VocabCardResult] = []
    for item in cards_raw:
        if not isinstance(item, dict) or "word" not in item:
            continue
        word = str(item["word"])
        input_word = word_input_map.get(word.lower())
        definition = str(item.get("definition", ""))
        definition_zh = str(item.get("definition_zh", ""))
        combined_definition = f"{definition}\n{definition_zh}" if definition_zh else definition
        cards.append(
            VocabCardResult(
                word=word,
                cefr_level=input_word.cefr_level if input_word else None,
                definition=combined_definition,
                example_sentence=str(item.get("example_sentence", "")),
                image_url=None,
            )
        )

    # Billing — silent failure so cards still return
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
                    note=f"vocab cards, tokens={total_tokens}",
                )
                db.commit()
    except Exception:
        logger.warning("Vocab card billing failed silently for user %s", current_user.id)

    return VocabCardGenerateResponse(ok=True, cards=cards)


# ─── Image generation ────────────────────────────────────────────────────────


@router.post(
    "/generate-image",
    response_model=VocabCardImageResponse,
    responses={503: {"model": ErrorResponse}},
)
def generate_vocab_card_image(
    body: VocabCardImageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.api.routers import llm as llm_root
    from app.infra.image_generation import ImageGenerationConfig
    from app.services.image_generation_service import ImageGenerationServiceError, generate_image

    prompt = (
        f"Educational vocabulary illustration for the English word \"{body.word}\". "
        f"Meaning: {body.definition[:200]}. "
        f"Scene inspired by: {body.example_sentence[:200]}. "
        "Clear, colorful, memorable visual. No text or letters in the image."
    )

    config = ImageGenerationConfig(
        model_name="qwen-image-2.0-pro",
        size="1024*1024",
        image_count=1,
        prompt_extend=True,
        watermark=False,
    )

    try:
        result = generate_image(prompt, config=config)
    except ImageGenerationServiceError as exc:
        logger.warning("Vocab card image generation failed: %s", exc)
        raise HTTPException(status_code=503, detail=f"Image generation failed: {exc}") from exc

    image_url = result.images[0].url if result.images else None
    if not image_url:
        raise HTTPException(status_code=503, detail="Image generation returned no images")

    # Billing — fixed cost per image
    try:
        llm_root.ensure_default_billing_rates(db)
        llm_root.consume_points(
            db,
            user_id=current_user.id,
            points=5,
            model_name="qwen-image-2.0-pro",
            lesson_id=None,
            event_type=llm_root.EVENT_CONSUME_LLM,
            note=f"vocab card image: {body.word}",
        )
        db.commit()
    except Exception:
        logger.warning("Vocab card image billing failed silently for user %s", current_user.id)

    return VocabCardImageResponse(ok=True, word=body.word, image_url=image_url)
