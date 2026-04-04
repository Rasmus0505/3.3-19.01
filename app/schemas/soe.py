from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SOEWordResult(BaseModel):
    word: str = ""
    start_time: int = 0
    end_time: int = 0
    pronunciation_score: float = 0.0
    fluency_score: float = 0.0
    integrity_score: float = 0.0


class SOEAssessResponse(BaseModel):
    ok: bool = True
    voice_id: str
    ref_text: str
    user_text: str
    total_score: float
    pronunciation_score: float
    fluency_score: float
    completeness_score: float
    word_results: list[SOEWordResult] = Field(default_factory=list)
    saved_result_id: int | None = None


class SOEHistoryItem(BaseModel):
    id: int
    lesson_id: int | None = None
    sentence_id: int | None = None
    ref_text: str
    user_text: str
    total_score: float
    pronunciation_score: float
    fluency_score: float
    completeness_score: float
    created_at: str


class SOEHistoryResponse(BaseModel):
    ok: bool = True
    items: list[SOEHistoryItem] = Field(default_factory=list)


class SOEErrorResponse(BaseModel):
    ok: bool = False
    error_code: str
    message: str
    detail: Any = ""
