from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SuccessResponse(BaseModel):
    ok: bool = True
    source_type: str
    model: str
    task_id: str
    task_status: str
    transcription_url: str
    preview_text: str
    asr_result_json: dict[str, Any]
    elapsed_ms: int


class ErrorResponse(BaseModel):
    ok: bool = False
    error_code: str
    message: str
    detail: Any = ""


class AuthRequest(BaseModel):
    email: str
    password: str = Field(min_length=6, max_length=128)


class UserResponse(BaseModel):
    id: int
    email: str
    created_at: datetime


class AuthResponse(BaseModel):
    ok: bool = True
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutResponse(BaseModel):
    ok: bool = True
    message: str


class LessonSentenceResponse(BaseModel):
    idx: int
    begin_ms: int
    end_ms: int
    text_en: str
    text_zh: str
    tokens: list[str]
    audio_url: str


class LessonItemResponse(BaseModel):
    id: int
    title: str
    source_filename: str
    asr_model: str
    duration_ms: int
    status: str
    created_at: datetime


class LessonDetailResponse(LessonItemResponse):
    sentences: list[LessonSentenceResponse]


class LessonCreateResponse(BaseModel):
    ok: bool = True
    lesson: LessonDetailResponse


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
