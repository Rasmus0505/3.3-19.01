from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class LessonSentenceResponse(BaseModel):
    idx: int
    begin_ms: int
    end_ms: int
    text_en: str
    text_zh: str
    tokens: list[str]
    audio_url: str | None


class LessonItemResponse(BaseModel):
    id: int
    title: str
    source_filename: str
    asr_model: str
    duration_ms: int
    media_storage: Literal["server", "client_indexeddb"]
    source_duration_ms: int
    status: str
    created_at: datetime


class LessonDetailResponse(LessonItemResponse):
    sentences: list[LessonSentenceResponse]


class LessonCreateResponse(BaseModel):
    ok: bool = True
    lesson: LessonDetailResponse
