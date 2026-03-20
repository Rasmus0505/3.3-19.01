from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TokenCheckRequest(BaseModel):
    sentence_index: int = Field(ge=0)
    user_tokens: list[str]


class TokenResult(BaseModel):
    expected: str
    input: str
    correct: bool


class TokenCheckResponse(BaseModel):
    ok: bool = True
    passed: bool
    token_results: list[TokenResult]
    expected_tokens: list[str]
    normalized_expected: str


class ProgressUpdateRequest(BaseModel):
    current_sentence_index: int = Field(ge=0)
    completed_sentence_indexes: list[int]
    last_played_at_ms: int = Field(ge=0, default=0)


class ProgressResponse(BaseModel):
    ok: bool = True
    lesson_id: int
    current_sentence_index: int
    completed_sentence_indexes: list[int]
    last_played_at_ms: int
    updated_at: datetime


class LearningSummaryCard(BaseModel):
    label: str
    value: int | float | str
    hint: str = ""
    tone: str = "default"


class LearningSummaryChartSeries(BaseModel):
    key: str
    name: str
    color: str = ""


class LearningSummaryChart(BaseModel):
    title: str
    description: str = ""
    type: str = "line"
    x_key: str = "label"
    series: list[LearningSummaryChartSeries] = Field(default_factory=list)
    data: list[dict[str, int | float | str]] = Field(default_factory=list)


class LearningSummaryOverview(BaseModel):
    streak_days: int = 0
    current_streak_days: int
    best_streak_days: int
    active_days_in_range: int
    total_active_days: int
    mission_days_in_range: int
    completed_sentences_in_range: int
    check_attempts_in_range: int
    check_passes_in_range: int
    pass_rate_in_range: float = 0.0
    completed_lessons_in_range: int
    lesson_total: int
    lesson_completed_total: int
    lesson_in_progress_total: int
    stalled_lessons: int = 0
    sentence_total: int = 0
    sentence_completed_total: int = 0
    completion_rate: float = 0.0
    recent_learning_at: datetime | None = None
    points_consumed_in_range: int = 0
    balance_points: int
    growth_points_in_range: int = 0
    total_growth_points: int = 0
    current_level: int = 1
    current_stage_label: str = ""
    level_progress_percent: float = 0.0
    next_level_points: int = 0
    points_to_next_level: int = 0
    is_active_today: bool = False
    unfinished_lessons: int = 0


class LearningSummaryHero(BaseModel):
    title: str
    subtitle: str
    level: int
    stage_label: str
    streak_days: int
    growth_points: int
    level_progress_percent: float
    next_level_points: int
    points_to_next_level: int
    momentum_label: str = ""


class LearningSummaryTask(BaseModel):
    key: str
    title: str
    description: str
    action_label: str
    action_kind: str
    xp_reward: int = 0
    status: str = "todo"
    tone: str = "default"
    lesson_id: int | None = None


class LearningSummaryRiskCard(BaseModel):
    key: str
    title: str
    description: str
    severity: str = "info"
    action_label: str = ""
    action_kind: str = ""
    lesson_id: int | None = None


class LearningSummaryMilestone(BaseModel):
    key: str
    label: str
    value: str
    hint: str = ""
    achieved: bool = False


class LearningSummaryLessonTarget(BaseModel):
    lesson_id: int
    title: str
    sentence_count: int
    completed_sentence_count: int
    progress_percent: float
    updated_at: datetime | None = None


class LearningSummaryRecommendation(BaseModel):
    kind: str
    title: str
    description: str
    action_label: str
    lesson_id: int | None = None


class LearningSummaryResponse(BaseModel):
    ok: bool = True
    range_days: int
    summary: LearningSummaryOverview
    hero: LearningSummaryHero
    today_tasks: list[LearningSummaryTask] = Field(default_factory=list)
    risk_cards: list[LearningSummaryRiskCard] = Field(default_factory=list)
    milestones: list[LearningSummaryMilestone] = Field(default_factory=list)
    focus_cards: list[LearningSummaryCard] = Field(default_factory=list)
    charts: list[LearningSummaryChart] = Field(default_factory=list)
    continue_lesson: LearningSummaryLessonTarget | None = None
    stalled_lesson: LearningSummaryLessonTarget | None = None
    primary_recommendation: LearningSummaryRecommendation
