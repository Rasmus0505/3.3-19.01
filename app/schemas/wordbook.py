from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


WordbookEntryType = Literal["word", "phrase"]
WordbookEntryStatus = Literal["active", "mastered"]
WordbookSortOrder = Literal["recent", "oldest"]


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
    status: WordbookEntryStatus = "active"
    sort: WordbookSortOrder = "recent"
    source_lesson_id: int | None = None
    available_lessons: list[WordbookSourceLessonResponse] = Field(default_factory=list)


class WordbookStatusUpdateRequest(BaseModel):
    status: WordbookEntryStatus


class WordbookMutationResponse(BaseModel):
    ok: bool = True
    message: str
    entry: WordbookEntryResponse


class WordbookDeleteResponse(BaseModel):
    ok: bool = True
    entry_id: int
