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


class LessonRenameRequest(BaseModel):
    title: str


class LessonDeleteResponse(BaseModel):
    ok: bool = True
    lesson_id: int


class LessonTaskStageResponse(BaseModel):
    key: str
    label: str
    status: Literal["pending", "running", "completed", "failed"]


class LessonTaskCountersResponse(BaseModel):
    asr_done: int = 0
    asr_estimated: int = 0
    translate_done: int = 0
    translate_total: int = 0
    segment_done: int = 0
    segment_total: int = 0


class LessonTaskResponse(BaseModel):
    ok: bool = True
    task_id: str
    status: Literal["pending", "running", "succeeded", "failed"]
    overall_percent: int
    current_text: str
    stages: list[LessonTaskStageResponse]
    counters: LessonTaskCountersResponse
    lesson: LessonDetailResponse | None = None
    error_code: str = ""
    message: str = ""


class LessonTaskCreateResponse(BaseModel):
    ok: bool = True
    task_id: str
