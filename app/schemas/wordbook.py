from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


WordbookEntryType = Literal["word", "phrase"]
WordbookEntryStatus = Literal["active", "mastered"]
WordbookSortOrder = Literal["recent", "oldest"]
WordbookReviewGrade = Literal["again", "hard", "good", "easy"]


class WordbookSourceLessonResponse(BaseModel):
    lesson_id: int
    title: str


class WordbookEntryResponse(BaseModel):
    id: int
    entry_text: str
    normalized_text: str
    entry_type: WordbookEntryType
    status: WordbookEntryStatus
    latest_sentence_idx: int
    latest_sentence_en: str
    latest_sentence_zh: str
    latest_collected_at: datetime
    next_review_at: datetime | None = None
    last_reviewed_at: datetime | None = None
    review_count: int = 0
    wrong_count: int = 0
    memory_score: float = 0.0
    created_at: datetime
    updated_at: datetime
    source_lesson_id: int | None = None
    source_lesson_title: str = ""
    source_count: int = 0


class WordbookCollectRequest(BaseModel):
    lesson_id: int
    sentence_index: int
    entry_text: str = Field(min_length=1, max_length=255)
    entry_type: WordbookEntryType
    start_token_index: int = Field(ge=0)
    end_token_index: int = Field(ge=0)


class WordbookCollectResponse(BaseModel):
    ok: bool = True
    created: bool
    updated_context: bool = False
    message: str
    entry: WordbookEntryResponse


class WordbookListResponse(BaseModel):
    ok: bool = True
    items: list[WordbookEntryResponse] = Field(default_factory=list)
    total: int = 0
    due_count: int = 0
    status: WordbookEntryStatus = "active"
    sort: WordbookSortOrder = "recent"
    source_lesson_id: int | None = None
    available_lessons: list[WordbookSourceLessonResponse] = Field(default_factory=list)


class WordbookReviewQueueResponse(BaseModel):
    ok: bool = True
    items: list[WordbookEntryResponse] = Field(default_factory=list)
    total: int = 0


class WordbookStatusUpdateRequest(BaseModel):
    status: WordbookEntryStatus


class WordbookReviewRequest(BaseModel):
    grade: WordbookReviewGrade


class WordbookReviewResult(BaseModel):
    previous_interval: str
    new_interval: str
    interval_change: str
    memory_score_change: float


class WordbookMutationResponse(BaseModel):
    ok: bool = True
    message: str
    entry: WordbookEntryResponse
    remaining_due: int = 0
    review_result: WordbookReviewResult | None = None


class WordbookDeleteResponse(BaseModel):
    ok: bool = True
    entry_id: int


class WordbookReviewPreviewGrade(BaseModel):
    grade: WordbookReviewGrade
    interval: str
    interval_hours: float


class WordbookReviewPreviewResponse(BaseModel):
    ok: bool = True
    entry_id: int
    current_interval: str
    grades: list[WordbookReviewPreviewGrade]
