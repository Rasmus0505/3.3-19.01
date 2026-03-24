from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers.lessons.helpers import require_lesson_owner
from app.core.errors import error_response
from app.core.timezone import to_shanghai_aware
from app.db import get_db
from app.models import Lesson, LessonProgress, User
from app.repositories.lessons import get_sentence
from app.repositories.progress import get_progress_for_user
from app.schemas import ErrorResponse
from app.schemas.practice import ProgressResponse, ProgressUpdateRequest, TokenCheckRequest, TokenCheckResponse, TokenResult
from app.services.practice_service import check_tokens

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/lessons", tags=["practice"])


@router.get(
    "/{lesson_id}/progress",
    response_model=ProgressResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_progress(lesson_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_lesson_owner(db, lesson_id, current_user.id)
    progress = get_progress_for_user(db, lesson_id, current_user.id)
    if not progress:
        return error_response(404, "PROGRESS_NOT_FOUND", "学习进度不存在")
    return ProgressResponse(
        ok=True,
        lesson_id=lesson_id,
        current_sentence_index=progress.current_sentence_idx,
        completed_sentence_indexes=list(progress.completed_indexes_json or []),
        last_played_at_ms=int(progress.last_played_at_ms or 0),
        updated_at=to_shanghai_aware(progress.updated_at),
    )


@router.put(
    "/{lesson_id}/progress",
    response_model=ProgressResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def upsert_progress(
    lesson_id: int,
    payload: ProgressUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_lesson_owner(db, lesson_id, current_user.id)
    from app.core.timezone import now_shanghai_naive
    progress = get_progress_for_user(db, lesson_id, current_user.id)
    if not progress:
        lesson = db.query(Lesson).filter(Lesson.id == lesson_id, Lesson.user_id == current_user.id).first()
        if not lesson:
            return error_response(404, "LESSON_NOT_FOUND", "课程不存在")
        progress = LessonProgress(
            lesson_id=lesson_id,
            user_id=current_user.id,
            current_sentence_idx=payload.current_sentence_index,
            completed_indexes_json=sorted(set(payload.completed_sentence_indexes)),
            last_played_at_ms=int(payload.last_played_at_ms or 0),
        )
        db.add(progress)
        db.commit()
        db.refresh(progress)
        logger.info("[DEBUG] sync.progress.upsert lesson_id=%s user_id=%s", lesson_id, current_user.id)
    else:
        progress.current_sentence_idx = payload.current_sentence_index
        progress.completed_indexes_json = sorted(set(payload.completed_sentence_indexes))
        progress.last_played_at_ms = int(payload.last_played_at_ms or 0)
        db.add(progress)
        db.commit()
        db.refresh(progress)
        logger.info("[DEBUG] sync.progress.update lesson_id=%s user_id=%s", lesson_id, current_user.id)
    return ProgressResponse(
        ok=True,
        lesson_id=lesson_id,
        current_sentence_index=progress.current_sentence_idx,
        completed_sentence_indexes=list(progress.completed_indexes_json or []),
        last_played_at_ms=int(progress.last_played_at_ms or 0),
        updated_at=to_shanghai_aware(progress.updated_at),
    )


@router.post(
    "/{lesson_id}/progress",
    response_model=ProgressResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def update_progress(
    lesson_id: int,
    payload: ProgressUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_lesson_owner(db, lesson_id, current_user.id)
    progress = get_progress_for_user(db, lesson_id, current_user.id)
    if not progress:
        return error_response(404, "PROGRESS_NOT_FOUND", "学习进度不存在")

    progress.current_sentence_idx = payload.current_sentence_index
    progress.completed_indexes_json = sorted(set(payload.completed_sentence_indexes))
    progress.last_played_at_ms = payload.last_played_at_ms
    db.add(progress)
    db.commit()
    db.refresh(progress)
    return ProgressResponse(
        ok=True,
        lesson_id=lesson_id,
        current_sentence_index=progress.current_sentence_idx,
        completed_sentence_indexes=list(progress.completed_indexes_json or []),
        last_played_at_ms=int(progress.last_played_at_ms or 0),
        updated_at=to_shanghai_aware(progress.updated_at),
    )


@router.get(
    "/progress/batch",
    response_model=dict,
    responses={401: {"model": ErrorResponse}},
)
def get_all_progress(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from sqlalchemy import select
    from app.models import LessonProgress as LP
    rows = db.scalars(
        select(LP).where(LP.user_id == current_user.id).order_by(LP.updated_at.desc())
    ).all()
    return {
        "items": [
            {
                "lesson_id": r.lesson_id,
                "current_sentence_index": r.current_sentence_idx,
                "completed_indexes": list(r.completed_indexes_json or []),
                "last_played_at_ms": int(r.last_played_at_ms or 0),
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]
    }


@router.post(
    "/{lesson_id}/check",
    response_model=TokenCheckResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def check_sentence_tokens(
    lesson_id: int,
    payload: TokenCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_lesson_owner(db, lesson_id, current_user.id)
    sentence = get_sentence(db, lesson_id, payload.sentence_index)
    if not sentence:
        return error_response(404, "SENTENCE_NOT_FOUND", "句子不存在")

    passed, token_results_raw, normalized_expected, normalized_text = check_tokens(sentence.tokens_json or [], payload.user_tokens)
    token_results = [TokenResult(**item) for item in token_results_raw]
    return TokenCheckResponse(
        ok=True,
        passed=passed,
        token_results=token_results,
        expected_tokens=normalized_expected,
        normalized_expected=normalized_text,
    )
