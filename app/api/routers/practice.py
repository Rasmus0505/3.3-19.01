from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers._helpers import require_lesson_owner
from app.core.errors import error_response
from datetime import timedelta

from app.core.timezone import now_shanghai_naive, to_shanghai_aware
from app.db import get_db
from app.models import LessonSentence, User
from app.repositories.lessons import get_sentence
from app.repositories.progress import get_progress_for_user
from app.schemas import ErrorResponse
from app.schemas.practice import (
    LearningSummaryResponse,
    ProgressResponse,
    ProgressUpdateRequest,
    TokenCheckRequest,
    TokenCheckResponse,
    TokenResult,
)
from app.services.learning_stats_service import (
    build_learning_progress_summary,
    ensure_learning_stats_schema,
    record_check_activity,
    record_progress_activity,
)
from app.services.practice_service import check_tokens


router = APIRouter(prefix="/api/lessons", tags=["practice"])


@router.get(
    "/progress/summary",
    response_model=LearningSummaryResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
)
def get_learning_progress_summary(
    range_days: int = Query(7, description="Only supports 7 or 30"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if range_days not in {7, 30}:
        return error_response(400, "INVALID_RANGE_DAYS", "仅支持 7 天或 30 天视图")
    payload = build_learning_progress_summary(db, user_id=current_user.id, range_days=range_days)
    return LearningSummaryResponse(**payload)


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
    ensure_learning_stats_schema(db)
    progress = get_progress_for_user(db, lesson_id, current_user.id)
    if not progress:
        return error_response(404, "PROGRESS_NOT_FOUND", "学习进度不存在")

    previous_completed_indexes = list(progress.completed_indexes_json or [])
    previous_updated_at = progress.updated_at
    sentence_total = int(
        db.scalar(select(func.count(LessonSentence.id)).where(LessonSentence.lesson_id == lesson_id))
        or 0
    )
    progress.current_sentence_idx = payload.current_sentence_index
    progress.completed_indexes_json = sorted(set(payload.completed_sentence_indexes))
    progress.last_played_at_ms = payload.last_played_at_ms
    db.add(progress)
    completed_lesson = sentence_total > 0 and len(progress.completed_indexes_json) >= sentence_total and len(previous_completed_indexes) < sentence_total
    stalled_recovery = bool(
        previous_updated_at is not None
        and previous_updated_at <= (now_shanghai_naive() - timedelta(days=3))
        and len(progress.completed_indexes_json) > len(previous_completed_indexes)
    )
    record_progress_activity(
        db,
        user_id=current_user.id,
        previous_completed_indexes=previous_completed_indexes,
        next_completed_indexes=progress.completed_indexes_json,
        completed_lesson=completed_lesson,
        stalled_recovery=stalled_recovery,
    )
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
    ensure_learning_stats_schema(db)
    sentence = get_sentence(db, lesson_id, payload.sentence_index)
    if not sentence:
        return error_response(404, "SENTENCE_NOT_FOUND", "句子不存在")

    passed, token_results_raw, normalized_expected, normalized_text = check_tokens(sentence.tokens_json or [], payload.user_tokens)
    record_check_activity(db, user_id=current_user.id, passed=passed)
    db.commit()
    token_results = [TokenResult(**item) for item in token_results_raw]
    return TokenCheckResponse(
        ok=True,
        passed=passed,
        token_results=token_results,
        expected_tokens=normalized_expected,
        normalized_expected=normalized_text,
    )
