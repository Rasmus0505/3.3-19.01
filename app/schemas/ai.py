from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class AiModelActionResponse(BaseModel):
    key: str
    label: str
    enabled: bool = True
    primary: bool = False


class AiCapabilityResponse(BaseModel):
    capability_key: str
    display_name: str = ""
    description: str = ""
    default_model_key: str = ""


class AiModelResponse(BaseModel):
    model_key: str
    display_name: str = ""
    provider: str = ""
    capabilities: list[str] = Field(default_factory=list)
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
    actions: list[AiModelActionResponse] = Field(default_factory=list)
    default_for_capabilities: list[str] = Field(default_factory=list)
    supported_features: list[str] = Field(default_factory=list)


class AiCatalogResponse(BaseModel):
    ok: bool = True
    capabilities: list[AiCapabilityResponse] = Field(default_factory=list)
    models: list[AiModelResponse] = Field(default_factory=list)
    default_models: dict[str, str] = Field(default_factory=dict)
