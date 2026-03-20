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


class AsrModelActionItem(BaseModel):
    key: str
    label: str
    enabled: bool = True
    primary: bool = False


class AsrModelStatusResponse(BaseModel):
    ok: bool = True
    model_key: str
    display_name: str = ""
    subtitle: str = ""
    note: str = ""
    runtime_kind: str = "cloud_api"
    runtime_label: str = ""
    prepare_mode: str = "none"
    cache_scope: str = ""
    supports_upload: bool = False
    supports_preview: bool = False
    supports_transcribe_api: bool = False
    source_model_id: str = ""
    deploy_path: str = ""
    status: Literal["ready", "preparing", "missing", "error", "unsupported"]
    available: bool = False
    download_required: bool = False
    preparing: bool = False
    cached: bool = False
    message: str = ""
    last_error: str = ""
    model_dir: str = ""
    missing_files: list[str] = Field(default_factory=list)
    actions: list[AsrModelActionItem] = Field(default_factory=list)


class AsrModelPrepareResponse(AsrModelStatusResponse):
    pass


class AsrModelListResponse(BaseModel):
    ok: bool = True
    models: list[AsrModelStatusResponse] = Field(default_factory=list)
