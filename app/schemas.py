from __future__ import annotations

from typing import Any

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
    asr_result_json: dict[str, Any]
    elapsed_ms: int


class ErrorResponse(BaseModel):
    ok: bool = False
    error_code: str
    message: str
    detail: Any = ""


class BilibiliDownloadGuideResponse(BaseModel):
    ok: bool = True
    url: str
    download_command_windows: str
    download_command_macos_linux: str
    notes: list[str]
