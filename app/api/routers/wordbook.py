from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers.lessons.helpers import require_lesson_owner
from app.db import get_db
from app.models import User
from app.schemas import ErrorResponse
from app.schemas.wordbook import (
    WordbookCollectRequest,
    WordbookCollectResponse,
    WordbookDeleteResponse,
    WordbookEntryResponse,
    WordbookListResponse,
    WordbookMutationResponse,
    WordbookReviewPreviewResponse,
    WordbookReviewQueueResponse,
    WordbookReviewRequest,
    WordbookSourceLessonResponse,
    WordbookStatusUpdateRequest,
)
from app.services.wordbook_service import (
    collect_wordbook_entry,
    delete_wordbook_entry,
    list_wordbook_entry_payloads,
    list_wordbook_review_queue_payloads,
    preview_wordbook_review_grades,
    review_wordbook_entry,
    update_wordbook_entry_status,
)


router = APIRouter(prefix="/api/wordbook", tags=["wordbook"])


def _entry_response_from_payload(payload: dict[str, object]) -> WordbookEntryResponse:
    return WordbookEntryResponse(**payload)


@router.get("", response_model=WordbookListResponse, responses={401: {"model": ErrorResponse}})
def list_wordbook(
    status: str = Query("active"),
    source_lesson_id: int | None = Query(None),
    sort: str = Query("recent"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = list_wordbook_entry_payloads(
        db,
        user_id=current_user.id,
        status=status,
        source_lesson_id=source_lesson_id,
        sort=sort,
    )
    return WordbookListResponse(
        ok=True,
        items=[_entry_response_from_payload(item) for item in payload["items"]],
        total=int(payload["total"]),
        due_count=int(payload["due_count"]),
        status=str(payload["status"]),
        sort=str(payload["sort"]),
        source_lesson_id=payload["source_lesson_id"],
        available_lessons=[WordbookSourceLessonResponse(**item) for item in payload["available_lessons"]],
    )


@router.get("/review-queue", response_model=WordbookReviewQueueResponse, responses={401: {"model": ErrorResponse}})
def list_wordbook_review_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = list_wordbook_review_queue_payloads(db, user_id=current_user.id)
    return WordbookReviewQueueResponse(
        ok=True,
        items=[_entry_response_from_payload(item) for item in payload["items"]],
        total=int(payload["total"]),
    )


@router.get("/review-preview/{entry_id}", response_model=WordbookReviewPreviewResponse, responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}})
def preview_wordbook_review(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = preview_wordbook_review_grades(db, entry_id=entry_id, user_id=current_user.id)
    return WordbookReviewPreviewResponse(
        ok=True,
        entry_id=int(payload["entry_id"]),
        current_interval=str(payload["current_interval"]),
        grades=payload["grades"],
    )


@router.get("/health")
def wordbook_health() -> dict[str, bool]:
    return {"ok": True}


@router.post(
    "/collect",
    response_model=WordbookCollectResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def collect_wordbook(
    payload: WordbookCollectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lesson = require_lesson_owner(db, payload.lesson_id, current_user.id)
    result = collect_wordbook_entry(
        db,
        lesson=lesson,
        user_id=current_user.id,
        sentence_index=payload.sentence_index,
        entry_type=payload.entry_type,
        entry_text=payload.entry_text,
        start_token_index=payload.start_token_index,
        end_token_index=payload.end_token_index,
    )
    return WordbookCollectResponse(
        ok=True,
        created=result.created,
        updated_context=result.updated_context,
        message="\u5df2\u52a0\u5165\u751f\u8bcd\u672c" if result.created else "\u5df2\u66f4\u65b0\u5230\u6700\u65b0\u8bed\u5883",
        entry=_entry_response_from_payload(result.payload),
    )


@router.patch(
    "/{entry_id}",
    response_model=WordbookMutationResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def update_wordbook_status(
    entry_id: int,
    payload: WordbookStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    updated_payload = update_wordbook_entry_status(db, entry_id=entry_id, user_id=current_user.id, status=payload.status)
    next_status = str(updated_payload["status"])
    message = "\u5df2\u6807\u8bb0\u4e3a\u638c\u63e1" if next_status == "mastered" else "\u5df2\u6062\u590d\u5230\u751f\u8bcd\u672c"
    return WordbookMutationResponse(
        ok=True,
        message=message,
        entry=_entry_response_from_payload(updated_payload),
        remaining_due=0,
    )


@router.post(
    "/{entry_id}/review",
    response_model=WordbookMutationResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def review_wordbook(
    entry_id: int,
    payload: WordbookReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = review_wordbook_entry(db, entry_id=entry_id, user_id=current_user.id, grade=payload.grade)
    review_result_data = result.get("review_result")
    return WordbookMutationResponse(
        ok=True,
        message="已记录复习结果",
        entry=_entry_response_from_payload(result["entry"]),
        remaining_due=int(result["remaining_due"]),
        review_result=review_result_data,
    )


@router.delete(
    "/{entry_id}",
    response_model=WordbookDeleteResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def delete_wordbook_item(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    delete_wordbook_entry(db, entry_id=entry_id, user_id=current_user.id)
    return WordbookDeleteResponse(ok=True, entry_id=entry_id)
