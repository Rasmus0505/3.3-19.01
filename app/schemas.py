from __future__ import annotations

from pydantic import BaseModel, Field


class BilibiliTranscribeRequest(BaseModel):
    url: str = Field(..., min_length=1)


class SuccessResponse(BaseModel):
    ok: bool = True
    source_type: str
    model: str
    task_id: str
    task_status: str
    transcription_url: str
    preview_text: str
    elapsed_ms: int


class ErrorResponse(BaseModel):
    ok: bool = False
    error_code: str
    message: str
    detail: str = ""

