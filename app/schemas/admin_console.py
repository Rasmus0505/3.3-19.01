from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AdminVisualStat(BaseModel):
    label: str
    value: int | float | str
    hint: str = ""
    tone: str = "default"


class AdminVisualChartSeries(BaseModel):
    key: str
    name: str
    color: str = ""


class AdminVisualChart(BaseModel):
    title: str
    description: str = ""
    type: str = "line"
    x_key: str = "label"
    series: list[AdminVisualChartSeries] = Field(default_factory=list)
    data: list[dict[str, Any]] = Field(default_factory=list)


class AdminOverviewMetrics(BaseModel):
    today_new_users: int
    today_redeem_points: int
    today_spent_points: int
    translation_failures_24h: int
    incidents_24h: int
    active_batches: int


class AdminOverviewBatchItem(BaseModel):
    id: int
    batch_name: str
    status: str
    generated_count: int
    redeemed_count: int
    remaining_count: int
    redeem_rate: float
    face_value_points: int
    created_at: datetime
    expire_at: datetime


class AdminOperationLogItem(BaseModel):
    id: int
    operator_user_id: int | None
    operator_user_email: str | None
    action_type: str
    target_type: str
    target_id: str
    before_value: str
    after_value: str
    note: str
    created_at: datetime


class AdminOverviewResponse(BaseModel):
    ok: bool = True
    metrics: AdminOverviewMetrics
    recent_batches: list[AdminOverviewBatchItem]
    recent_operations: list[AdminOperationLogItem]
    summary_cards: list[AdminVisualStat] = Field(default_factory=list)
    charts: list[AdminVisualChart] = Field(default_factory=list)


class AdminOperationLogsResponse(BaseModel):
    ok: bool = True
    page: int
    page_size: int
    total: int
    items: list[AdminOperationLogItem]
    summary_cards: list[AdminVisualStat] = Field(default_factory=list)
    charts: list[AdminVisualChart] = Field(default_factory=list)


class AdminUserActivitySummary(BaseModel):
    user_id: int
    lesson_count: int
    latest_lesson_created_at: datetime | None
    latest_wallet_event_at: datetime | None
    latest_redeem_at: datetime | None
    consumed_points_30d: int
    redeemed_points_30d: int


class AdminUserActivitySummaryResponse(BaseModel):
    ok: bool = True
    summary: AdminUserActivitySummary


class AdminLessonTaskLogTranslationSummary(BaseModel):
    total_sentences: int = 0
    failed_sentences: int = 0
    request_count: int = 0
    success_request_count: int = 0
    total_tokens: int = 0
    charged_points: int = 0
    latest_error_summary: str = ""


class AdminLessonTaskFailureDebug(BaseModel):
    failed_stage: str = ""
    exception_type: str = ""
    detail_excerpt: str = ""
    traceback_excerpt: str = ""
    last_progress_text: str = ""
    stages: list[dict[str, Any]] = Field(default_factory=list)
    counters: dict[str, Any] = Field(default_factory=dict)
    translation_debug: dict[str, Any] | None = None
    failed_at: datetime | None = None


class AdminLessonTaskLogItem(BaseModel):
    id: int
    task_id: str
    owner_user_id: int
    user_email: str | None
    lesson_id: int | None
    source_filename: str
    asr_model: str
    status: str
    current_stage: str = ""
    error_code: str = ""
    message: str = ""
    detail_excerpt: str = ""
    traceback_excerpt: str = ""
    last_progress_text: str = ""
    exception_type: str = ""
    resume_available: bool = False
    translation_debug_summary: AdminLessonTaskLogTranslationSummary | None = None
    failure_debug: AdminLessonTaskFailureDebug | None = None
    artifact_expires_at: datetime | None = None
    failed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AdminLessonTaskLogsResponse(BaseModel):
    ok: bool = True
    page: int
    page_size: int
    total: int
    items: list[AdminLessonTaskLogItem]
    summary_cards: list[AdminVisualStat] = Field(default_factory=list)
    charts: list[AdminVisualChart] = Field(default_factory=list)
