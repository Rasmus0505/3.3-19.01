"""Vocabulary Card generation endpoints — Phase 42."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers.llm_shared import _require_api_key, recover_json_payload, require_collins_level, strip_json_fences
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
    "1. A concise definition in English (one sentence, suitable for Collins {target_level} learners)\n"
    "2. A Chinese definition (简明中文释义)\n"
    "3. One example sentence from or inspired by the provided text context\n"
    "\n"
    "Output ONLY a valid JSON array. Each element:\n"
    '{{"word":"...","definition":"...","definition_zh":"...","example_sentence":"..."}}\n'
    "\n"
    "Rules:\n"
    "- Keep definitions clear and age-appropriate\n"
    "- Example sentences should use the word naturally in context\n"
    "- Target Collins level: {target_level}\n"
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


def _extract_cards_payload(payload: object) -> list[dict] | None:
    if isinstance(payload, list):
        return payload

    if not isinstance(payload, dict):
        return None

    for key in ("cards", "items", "results"):
        candidate = payload.get(key)
        if isinstance(candidate, list):
            return candidate

    data = payload.get("data")
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        nested = _extract_cards_payload(data)
        if nested is not None:
            return nested

    if "word" in payload:
        return [payload]

    list_values = [value for value in payload.values() if isinstance(value, list)]
    if len(list_values) == 1:
        return list_values[0]

    return None


# ─── Card text generation ────────────────────────────────────────────────────


@router.post(
    "/generate",
    response_model=VocabCardGenerateResponse,
    responses={502: {"model": ErrorResponse}, 503: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def generate_vocab_cards(
    body: VocabCardGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.api.routers import llm as llm_root

    if not body.words or len(body.words) > 10:
        raise HTTPException(status_code=422, detail="Provide 1-10 words")
    target_level = require_collins_level(body.target_level, field_name="target_level", default=3)

    api_key = _require_api_key()
    llm_root.ensure_default_billing_rates(db)

    word_dicts = [{"word": w.word, "collins_level": w.collins_level} for w in body.words]
    messages = _build_messages(word_dicts, str(target_level), body.context_text)

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
        parsed = json.loads(recovered)
        cards_raw = _extract_cards_payload(parsed)
        if cards_raw is None:
            raise ValueError("Expected a card array or wrapped card payload")
    except Exception as exc:
        logger.warning("Vocab card JSON parse failed. Raw: %.300s", raw_response)
        raise HTTPException(status_code=502, detail="Card generation returned invalid JSON") from exc

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
                collins_level=input_word.collins_level if input_word else None,
                definition=combined_definition,
                example_sentence=str(item.get("example_sentence", "")),
                image_url=None,
            )
        )

    if not cards:
        raise HTTPException(status_code=502, detail="Card generation returned no valid cards")

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
