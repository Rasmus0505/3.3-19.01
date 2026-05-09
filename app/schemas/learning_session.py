from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


LearningSessionStatus = Literal["active", "paused", "completed", "discarded"]
PauseReason = Literal["manual", "idle", "hidden", "route_change", "logout", "lesson_change", "page_unload"]


class LearningSessionSummary(BaseModel):
    id: int
    lesson_id: int
    title_snapshot: str = ""
    started_at: datetime
    ended_at: datetime | None = None
    effective_seconds: int = 0
    paused_seconds: int = 0
    status: LearningSessionStatus
    last_activity_at: datetime
    manual_pause_count: int = 0
    auto_pause_count: int = 0
    notes: str = ""


class LearningSessionStartRequest(BaseModel):
    lesson_id: int
    title_snapshot: str = ""


class LearningSessionHeartbeatRequest(BaseModel):
    effective_seconds: int = Field(ge=0, default=0)
    paused_seconds: int = Field(ge=0, default=0)
    playing: bool = False
    typing_active: bool = False
    last_activity_at: datetime | None = None


class LearningSessionPauseRequest(BaseModel):
    effective_seconds: int = Field(ge=0, default=0)
    paused_seconds: int = Field(ge=0, default=0)
    reason: PauseReason = "manual"
    last_activity_at: datetime | None = None


class LearningSessionResumeRequest(BaseModel):
    effective_seconds: int = Field(ge=0, default=0)
    paused_seconds: int = Field(ge=0, default=0)
    last_activity_at: datetime | None = None


class LearningSessionFinishRequest(BaseModel):
    effective_seconds: int = Field(ge=0, default=0)
    paused_seconds: int = Field(ge=0, default=0)
    reason: PauseReason | Literal["completed"] = "completed"
    last_activity_at: datetime | None = None


class LearningSessionUpdateRequest(BaseModel):
    effective_seconds: int | None = Field(default=None, ge=0)
    notes: str | None = None


class LearningSessionResponse(BaseModel):
    ok: bool = True
    session: LearningSessionSummary


class LearningSessionListResponse(BaseModel):
    ok: bool = True
    items: list[LearningSessionSummary] = Field(default_factory=list)


class DashboardDailyStudyPoint(BaseModel):
    date: str
    minutes: int = 0


class DashboardLessonStudyPoint(BaseModel):
    lesson_id: int
    title_snapshot: str = ""
    minutes: int = 0


class DashboardStudyTimeResponse(BaseModel):
    ok: bool = True
    total_minutes: int = 0
    today_minutes: int = 0
    streak_days: int = 0
    latest_lesson_title: str = ""
    latest_activity_at: datetime | None = None
    daily_minutes: list[DashboardDailyStudyPoint] = Field(default_factory=list)
    lesson_minutes: list[DashboardLessonStudyPoint] = Field(default_factory=list)
    recent_sessions: list[LearningSessionSummary] = Field(default_factory=list)
