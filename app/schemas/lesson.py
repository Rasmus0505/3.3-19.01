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
    strategy_version: int = 1
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
    updated_at: datetime | None = None


class LessonCatalogProgressSummaryResponse(BaseModel):
    current_sentence_index: int = 0
    completed_sentence_count: int = 0
    last_played_at_ms: int = 0
    updated_at: datetime | None = None


class LessonCatalogItemResponse(LessonItemResponse):
    sentence_count: int = 0
    progress_summary: LessonCatalogProgressSummaryResponse | None = None


class LessonCatalogResponse(BaseModel):
    ok: bool = True
    page: int
    page_size: int
    total: int
    has_more: bool
    items: list[LessonCatalogItemResponse]


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


class LessonBulkDeleteRequest(BaseModel):
    lesson_ids: list[int] = Field(default_factory=list)
    delete_all: bool = False


class LessonBulkDeleteResponse(BaseModel):
    ok: bool = True
    deleted_ids: list[int] = Field(default_factory=list)
    deleted_count: int = 0
    failed_ids: list[int] = Field(default_factory=list)


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
    charged_amount_cents: int = 0
    actual_cost_amount_cents: int = 0
    actual_revenue_amount_cents: int = 0
    gross_profit_amount_cents: int = 0


class LessonTaskTranslationDebugResponse(BaseModel):
    total_sentences: int = 0
    failed_sentences: int = 0
    request_count: int = 0
    success_request_count: int = 0
    estimated_charge_amount_cents: int = 0
    actual_charge_amount_cents: int = 0
    actual_cost_amount_cents: int = 0
    gross_profit_amount_cents: int = 0
    usage: LessonTaskTranslationUsageResponse = Field(default_factory=LessonTaskTranslationUsageResponse)
    latest_error_summary: str = ""


class LessonTaskFailureDebugResponse(BaseModel):
    failed_stage: str = ""
    exception_type: str = ""
    detail_excerpt: str = ""
    traceback_excerpt: str = ""
    last_progress_text: str = ""
    stages: list[LessonTaskStageResponse] = Field(default_factory=list)
    counters: LessonTaskCountersResponse = Field(default_factory=LessonTaskCountersResponse)
    translation_debug: LessonTaskTranslationDebugResponse | None = None
    dashscope_recovery: dict[str, Any] | None = None
    failed_at: datetime | None = None


class LessonTaskResponse(BaseModel):
    ok: bool = True
    task_id: str
    requested_asr_model: str = ""
    effective_asr_model: str = ""
    model_fallback_applied: bool = False
    model_fallback_reason: str = ""
    completion_kind: Literal["full", "partial"] = "full"
    result_kind: Literal["", "full_success", "asr_only"] = ""
    result_label: str = ""
    result_message: str = ""
    partial_failure_stage: str = ""
    partial_failure_code: str = ""
    partial_failure_message: str = ""
    status: Literal["pending", "running", "pausing", "paused", "terminating", "terminated", "succeeded", "failed"]
    overall_percent: int
    current_text: str
    stages: list[LessonTaskStageResponse]
    counters: LessonTaskCountersResponse
    lesson: LessonDetailResponse | None = None
    subtitle_cache_seed: SubtitleCacheSeedResponse | None = None
    translation_debug: LessonTaskTranslationDebugResponse | None = None
    failure_debug: LessonTaskFailureDebugResponse | None = None
    error_code: str = ""
    message: str = ""
    resume_available: bool = False
    resume_stage: str = ""
    artifact_expires_at: datetime | None = None
    control_action: Literal["", "pause", "terminate"] = ""
    paused_at: datetime | None = None
    terminated_at: datetime | None = None
    can_pause: bool = False
    can_terminate: bool = False


class LessonTaskDebugReportResponse(BaseModel):
    ok: bool = True
    task_id: str
    completion_kind: Literal["full", "partial"] = "full"
    report_text: str


class LessonTaskCreateResponse(BaseModel):
    ok: bool = True
    task_id: str
    requested_asr_model: str = ""
    effective_asr_model: str = ""
    model_fallback_applied: bool = False
    model_fallback_reason: str = ""


class LocalAsrLessonTaskCreateRequest(BaseModel):
    asr_model: str = Field(min_length=1, max_length=100)
    source_filename: str = Field(min_length=1, max_length=255)
    source_duration_ms: int = Field(gt=0)
    runtime_kind: str = Field(default="local_browser", min_length=1, max_length=64)
    asr_payload: dict[str, Any]


class LessonTaskResumeResponse(BaseModel):
    ok: bool = True
    task_id: str


class LessonTaskControlResponse(BaseModel):
    ok: bool = True
    task_id: str
    status: Literal["pending", "running", "pausing", "paused", "terminating", "terminated", "succeeded", "failed"]


class LessonTaskBatchTerminateResponse(BaseModel):
    ok: bool = True
    requested_task_ids: list[str] = Field(default_factory=list)
    requested_count: int = 0


class LessonSubtitleVariantRequest(BaseModel):
    asr_payload: dict[str, Any]
    semantic_split_enabled: bool


class LessonSubtitleVariantResponse(BaseModel):
    ok: bool = True
    lesson_id: int
    semantic_split_enabled: bool
    split_mode: str
    source_word_count: int = 0
    strategy_version: int = 1
    sentences: list[LessonSentenceResponse]


class LessonSubtitleVariantProgressEvent(BaseModel):
    stage: str
    message: str
    translate_done: int = 0
    translate_total: int = 0
    semantic_split_enabled: bool = False


class LessonSubtitleVariantErrorEvent(BaseModel):
    error_code: str = ""
    message: str
    detail: str = ""
