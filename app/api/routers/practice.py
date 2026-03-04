from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers._helpers import require_lesson_owner
from app.core.errors import error_response
from app.db import get_db
from app.models import User
from app.repositories.lessons import get_sentence
from app.repositories.progress import get_progress_for_user
from app.schemas import ErrorResponse, ProgressResponse, ProgressUpdateRequest, TokenCheckRequest, TokenCheckResponse, TokenResult
from app.services.practice_service import check_tokens


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
        updated_at=progress.updated_at,
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
        updated_at=progress.updated_at,
    )


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
