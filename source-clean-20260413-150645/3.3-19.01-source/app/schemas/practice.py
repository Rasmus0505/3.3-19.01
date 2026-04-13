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
