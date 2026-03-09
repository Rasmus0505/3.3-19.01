from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class LessonSentenceResponse(BaseModel):
    idx: int
    begin_ms: int
    end_ms: int
    text_en: str
    text_zh: str
    tokens: list[str]
    audio_url: str | None


class SubtitleCacheSeedResponse(BaseModel):
    semantic_split_enabled: bool
    split_mode: str
    source_word_count: int = 0
    asr_payload: dict[str, Any]
    sentences: list[LessonSentenceResponse]


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
    subtitle_cache_seed: SubtitleCacheSeedResponse | None = None


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


class LessonTaskTranslationUsageResponse(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    charged_points: int = 0


class LessonTaskTranslationDebugResponse(BaseModel):
    total_sentences: int = 0
    failed_sentences: int = 0
    request_count: int = 0
    success_request_count: int = 0
    usage: LessonTaskTranslationUsageResponse = Field(default_factory=LessonTaskTranslationUsageResponse)
    latest_error_summary: str = ""


class LessonTaskResponse(BaseModel):
    ok: bool = True
    task_id: str
    status: Literal["pending", "running", "succeeded", "failed"]
    overall_percent: int
    current_text: str
    stages: list[LessonTaskStageResponse]
    counters: LessonTaskCountersResponse
    lesson: LessonDetailResponse | None = None
    subtitle_cache_seed: SubtitleCacheSeedResponse | None = None
    translation_debug: LessonTaskTranslationDebugResponse | None = None
    error_code: str = ""
    message: str = ""


class LessonTaskCreateResponse(BaseModel):
    ok: bool = True
    task_id: str


class LessonSubtitleVariantRequest(BaseModel):
    asr_payload: dict[str, Any]
    semantic_split_enabled: bool


class LessonSubtitleVariantResponse(BaseModel):
    ok: bool = True
    lesson_id: int
    semantic_split_enabled: bool
    split_mode: str
    source_word_count: int = 0
    sentences: list[LessonSentenceResponse]
