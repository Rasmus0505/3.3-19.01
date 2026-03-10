from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


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


class AdminOperationLogsResponse(BaseModel):
    ok: bool = True
    page: int
    page_size: int
    total: int
    items: list[AdminOperationLogItem]


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
