"""Dictation lesson generation from reading pack — Phase 43."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.db import get_db
from app.models import User
from app.schemas import ErrorResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lessons", tags=["lessons"])


class ReadingPackDictationRequest(BaseModel):
    sentences: list[str]
    target_level: str
    article_title: str
    voice: str | None = None


class ReadingPackDictationResponse(BaseModel):
    ok: bool
    lesson_id: int
    sentence_count: int
    title: str


@router.post(
    "/from-reading-pack",
    response_model=ReadingPackDictationResponse,
    responses={503: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def create_dictation_from_reading_pack(
    body: ReadingPackDictationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not body.sentences:
        raise HTTPException(status_code=422, detail="No sentences provided")
    if len(body.sentences) > 100:
        raise HTTPException(status_code=422, detail="Too many sentences (max 100)")

    from app.services.dictation_service import generate_dictation_lesson

    try:
        lesson = generate_dictation_lesson(
            db,
            user_id=current_user.id,
            sentences=body.sentences,
            target_level=body.target_level,
            article_title=body.article_title,
            voice=body.voice,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Dictation lesson generation failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail="Dictation generation failed") from exc

    # Billing — deduct TTS credits; silent failure so lesson still returns
    try:
        from app.api.routers import llm as llm_root

        llm_root.ensure_default_billing_rates(db)
        total_chars = sum(len(s) for s in body.sentences)
        charge = max(1, total_chars // 100)  # ~1 point per 100 chars
        llm_root.consume_points(
            db,
            user_id=current_user.id,
            points=charge,
            model_name="tts_generated",
            lesson_id=lesson.id,
            event_type=llm_root.EVENT_CONSUME_LLM,
            note=f"dictation TTS, chars={total_chars}, sentences={len(body.sentences)}",
        )
        db.commit()
    except Exception:
        logger.warning("Dictation billing failed silently for user %s", current_user.id)

    sentence_count = len([s for s in lesson.sentences if s.audio_clip_path])

    return ReadingPackDictationResponse(
        ok=True,
        lesson_id=lesson.id,
        sentence_count=sentence_count,
        title=lesson.title,
    )
