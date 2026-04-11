"""Reading Packs API — CRUD for reading pack data persisted from client IndexedDB."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.db import Base, engine, get_db
from app.models.reading_pack import ReadingPack
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reading-packs", tags=["reading-packs"])

# Auto-create table on module load if it doesn't exist
try:
    insp = inspect(engine)
    table_names = insp.get_table_names(schema="app") if insp.has_schema("app") else insp.get_table_names()
    if "reading_packs" not in table_names:
        ReadingPack.__table__.create(engine, checkfirst=True)
        logger.info("reading_packs table auto-created")
except Exception as exc:
    logger.warning("reading_packs auto-create check failed (will retry on first request): %s", exc)


# ─── Schemas ─────────────────────────────────────────────────────────────────


class ReadingPackSyncRequest(BaseModel):
    article_id: str = Field(..., min_length=1)
    title: str = ""
    original_text: str = ""
    rewritten_text: str = ""
    target_level: str = "B1"
    flow_status: str = "idle"
    mappings: list[dict[str, Any]] | None = None
    word_levels: dict[str, Any] | None = None
    valid_i1_words: list[str] | None = None
    valid_above_i1_words: list[str] | None = None
    removed_words: list[dict[str, Any]] | None = None
    diagnostic: dict[str, Any] | None = None
    quiz: dict[str, Any] | None = None
    vocab_cards: dict[str, Any] | None = None
    course_data: dict[str, Any] | None = None


class ReadingPackResponse(BaseModel):
    id: int
    article_id: str
    title: str
    target_level: str
    flow_status: str
    original_text: str = ""
    rewritten_text: str = ""
    mappings: list | None = None
    word_levels: dict | None = None
    valid_i1_words: list | None = None
    valid_above_i1_words: list | None = None
    removed_words: list | None = None
    diagnostic: dict | None = None
    quiz: dict | None = None
    vocab_cards: dict | None = None
    course_data: dict | None = None
    created_at: str = ""
    updated_at: str = ""


def _to_response(pack: ReadingPack) -> ReadingPackResponse:
    return ReadingPackResponse(
        id=pack.id,
        article_id=pack.article_id,
        title=pack.title,
        target_level=pack.target_level,
        flow_status=pack.flow_status,
        original_text=pack.original_text,
        rewritten_text=pack.rewritten_text,
        mappings=pack.mappings_json,
        word_levels=pack.word_levels_json,
        valid_i1_words=pack.valid_i1_words_json,
        valid_above_i1_words=pack.valid_above_i1_words_json,
        removed_words=pack.removed_words_json,
        diagnostic=pack.diagnostic_json,
        quiz=pack.quiz_json,
        vocab_cards=pack.vocab_cards_json,
        course_data=pack.course_data_json,
        created_at=str(pack.created_at) if pack.created_at else "",
        updated_at=str(pack.updated_at) if pack.updated_at else "",
    )


# ─── Endpoints ───────────────────────────────────────────────────────────────


@router.post("", response_model=ReadingPackResponse)
def sync_reading_pack(
    body: ReadingPackSyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upsert a reading pack record. Called by the frontend after generation or progress update."""
    try:
        existing = (
            db.query(ReadingPack)
            .filter(ReadingPack.user_id == current_user.id, ReadingPack.article_id == body.article_id)
            .first()
        )
    except Exception:
        # Table might not exist yet — try to create it
        db.rollback()
        ReadingPack.__table__.create(engine, checkfirst=True)
        existing = None

    if existing:
        existing.title = body.title or existing.title
        existing.original_text = body.original_text or existing.original_text
        existing.rewritten_text = body.rewritten_text or existing.rewritten_text
        existing.target_level = body.target_level or existing.target_level
        existing.flow_status = body.flow_status or existing.flow_status
        if body.mappings is not None:
            existing.mappings_json = body.mappings
        if body.word_levels is not None:
            existing.word_levels_json = body.word_levels
        if body.valid_i1_words is not None:
            existing.valid_i1_words_json = body.valid_i1_words
        if body.valid_above_i1_words is not None:
            existing.valid_above_i1_words_json = body.valid_above_i1_words
        if body.removed_words is not None:
            existing.removed_words_json = body.removed_words
        if body.diagnostic is not None:
            existing.diagnostic_json = body.diagnostic
        if body.quiz is not None:
            existing.quiz_json = body.quiz
        if body.vocab_cards is not None:
            existing.vocab_cards_json = body.vocab_cards
        if body.course_data is not None:
            existing.course_data_json = body.course_data
        db.commit()
        db.refresh(existing)
        return _to_response(existing)

    pack = ReadingPack(
        user_id=current_user.id,
        article_id=body.article_id,
        title=body.title,
        original_text=body.original_text,
        rewritten_text=body.rewritten_text,
        target_level=body.target_level,
        flow_status=body.flow_status,
        mappings_json=body.mappings,
        word_levels_json=body.word_levels,
        valid_i1_words_json=body.valid_i1_words,
        valid_above_i1_words_json=body.valid_above_i1_words,
        removed_words_json=body.removed_words,
        diagnostic_json=body.diagnostic,
        quiz_json=body.quiz,
        vocab_cards_json=body.vocab_cards,
        course_data_json=body.course_data,
    )
    db.add(pack)
    db.commit()
    db.refresh(pack)
    return _to_response(pack)


@router.get("", response_model=list[ReadingPackResponse])
def list_reading_packs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all reading packs for the current user."""
    packs = (
        db.query(ReadingPack)
        .filter(ReadingPack.user_id == current_user.id)
        .order_by(ReadingPack.updated_at.desc())
        .all()
    )
    return [_to_response(p) for p in packs]


@router.get("/{pack_id}", response_model=ReadingPackResponse)
def get_reading_pack(
    pack_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single reading pack with full data."""
    pack = db.get(ReadingPack, pack_id)
    if not pack or pack.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Reading pack not found")
    return _to_response(pack)


@router.delete("/{pack_id}")
def delete_reading_pack(
    pack_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a reading pack."""
    pack = db.get(ReadingPack, pack_id)
    if not pack or pack.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Reading pack not found")
    db.delete(pack)
    db.commit()
    return {"ok": True, "id": pack_id}
