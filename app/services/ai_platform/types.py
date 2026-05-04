from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

AiCapabilityKey = Literal[
    "asr",
    "mt",
    "llm",
    "tts",
    "soe",
    "vision",
    "image_generation",
    "voice_clone",
    "ocr",
]

AiRuntimeKind = Literal["cloud_api", "local_runtime", "hybrid"]
AiStatus = Literal["ready", "preparing", "missing", "error", "unsupported"]


@dataclass(frozen=True)
class AiModelAction:
    key: str
    label: str
    enabled: bool = True
    primary: bool = False


@dataclass(frozen=True)
class AiCapabilityDescriptor:
    capability_key: AiCapabilityKey
    display_name: str
    description: str
    default_model_key: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "capability_key": self.capability_key,
            "display_name": self.display_name,
            "description": self.description,
            "default_model_key": self.default_model_key,
        }


@dataclass(frozen=True)
class AiModelDescriptor:
    model_key: str
    display_name: str
    provider: str
    capabilities: tuple[AiCapabilityKey, ...]
    subtitle: str = ""
    note: str = ""
    runtime_kind: AiRuntimeKind = "cloud_api"
    runtime_label: str = "Cloud API"
    prepare_mode: str = "none"
    cache_scope: str = "cloud"
    source_model_id: str = ""
    deploy_path: str = ""
    status: AiStatus = "ready"
    available: bool = True
    download_required: bool = False
    preparing: bool = False
    cached: bool = False
    message: str = ""
    last_error: str = ""
    model_dir: str = ""
    missing_files: tuple[str, ...] = ()
    actions: tuple[AiModelAction, ...] = ()
    supports_upload: bool = False
    supports_preview: bool = False
    supports_transcribe_api: bool = False
    default_for_capabilities: tuple[AiCapabilityKey, ...] = ()
    supported_features: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "model_key": self.model_key,
            "display_name": self.display_name,
            "provider": self.provider,
            "capabilities": list(self.capabilities),
            "subtitle": self.subtitle,
            "note": self.note,
            "runtime_kind": self.runtime_kind,
            "runtime_label": self.runtime_label,
            "prepare_mode": self.prepare_mode,
            "cache_scope": self.cache_scope,
            "source_model_id": self.source_model_id,
            "deploy_path": self.deploy_path,
            "status": self.status,
            "available": self.available,
            "download_required": self.download_required,
            "preparing": self.preparing,
            "cached": self.cached,
            "message": self.message,
            "last_error": self.last_error,
            "model_dir": self.model_dir,
            "missing_files": list(self.missing_files),
            "actions": [
                {
                    "key": item.key,
                    "label": item.label,
                    "enabled": item.enabled,
                    "primary": item.primary,
                }
                for item in self.actions
            ],
            "supports_upload": self.supports_upload,
            "supports_preview": self.supports_preview,
            "supports_transcribe_api": self.supports_transcribe_api,
            "default_for_capabilities": list(self.default_for_capabilities),
            "supported_features": list(self.supported_features),
        }


@dataclass
class AiExecutionRequest:
    capability: AiCapabilityKey
    model_key: str = ""
    payload: dict[str, Any] = field(default_factory=dict)


class AiPlatformError(RuntimeError):
    def __init__(self, code: str, message: str, detail: str = ""):
        self.code = str(code or "AI_PLATFORM_ERROR").strip() or "AI_PLATFORM_ERROR"
        self.message = str(message or "AI platform request failed").strip() or "AI platform request failed"
        self.detail = str(detail or "").strip()
        super().__init__(self.message)
