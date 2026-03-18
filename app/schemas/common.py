from __future__ import annotations

from typing import Any, Literal

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


class AsrModelStatusResponse(BaseModel):
    ok: bool = True
    model_key: str
    status: Literal["ready", "preparing", "missing", "error"]
    download_required: bool = False
    preparing: bool = False
    cached: bool = False
    message: str = ""
    last_error: str = ""
    model_dir: str = ""
    missing_files: list[str] = Field(default_factory=list)


class AsrModelPrepareResponse(AsrModelStatusResponse):
    pass
