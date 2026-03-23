from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Callable

from app.core.config import DASHSCOPE_API_KEY, FASTER_WHISPER_MODEL_DIR
from app.services.faster_whisper_asr import (
    FASTER_WHISPER_ASR_MODEL,
    get_faster_whisper_model_status,
    prepare_faster_whisper_model as prepare_faster_whisper_runtime_model,
)

QWEN_ASR_MODEL = "qwen3-asr-flash-filetrans"

UPLOAD_ASR_MODEL_KEYS: tuple[str, ...] = (
    FASTER_WHISPER_ASR_MODEL,
    QWEN_ASR_MODEL,
)
TRANSCRIBE_ASR_MODEL_KEYS: tuple[str, ...] = UPLOAD_ASR_MODEL_KEYS
LOCAL_BROWSER_ASR_MODEL_KEYS: tuple[str, ...] = ()
LOCAL_DESKTOP_ASR_MODEL_KEYS: tuple[str, ...] = (
    FASTER_WHISPER_ASR_MODEL,
)
LOCAL_TASK_ASR_MODEL_KEYS: tuple[str, ...] = tuple(dict.fromkeys((*LOCAL_BROWSER_ASR_MODEL_KEYS, *LOCAL_DESKTOP_ASR_MODEL_KEYS)))
ALL_ASR_MODEL_KEYS: tuple[str, ...] = UPLOAD_ASR_MODEL_KEYS

STATUS_READY = "ready"
STATUS_PREPARING = "preparing"
STATUS_MISSING = "missing"
STATUS_ERROR = "error"
STATUS_UNSUPPORTED = "unsupported"

_FALSEY_ENV_VALUES = {"0", "false", "no", "off"}


@dataclass(frozen=True)
class AsrModelDescriptor:
    model_key: str
    display_name: str
    subtitle: str
    runtime_kind: str
    runtime_label: str
    prepare_mode: str
    cache_scope: str
    supports_upload: bool
    supports_preview: bool
    supports_transcribe_api: bool
    source_model_id: str = ""
    deploy_path: str = ""
    note: str = ""
    status_loader: Callable[[], dict[str, Any]] | None = None
    prepare_loader: Callable[[bool], dict[str, Any]] | None = None
    verify_loader: Callable[[], dict[str, Any]] | None = None


def _build_actions(state: dict[str, Any]) -> list[dict[str, Any]]:
    prepare_mode = str(state.get("prepare_mode") or "none")
    status = str(state.get("status") or "").lower()
    preparing = bool(state.get("preparing"))
    actions: list[dict[str, Any]] = []
    if prepare_mode != "none":
        actions.append(
            {
                "key": "prepare",
                "label": "Prepare",
                "enabled": not preparing,
                "primary": status in {STATUS_MISSING, STATUS_ERROR},
            }
        )
    actions.append({"key": "verify", "label": "Verify", "enabled": status != STATUS_UNSUPPORTED, "primary": False})
    return actions


def _base_state(descriptor: AsrModelDescriptor, **overrides: Any) -> dict[str, Any]:
    payload = {
        "model_key": descriptor.model_key,
        "display_name": descriptor.display_name,
        "subtitle": descriptor.subtitle,
        "note": descriptor.note,
        "runtime_kind": descriptor.runtime_kind,
        "runtime_label": descriptor.runtime_label,
        "prepare_mode": descriptor.prepare_mode,
        "cache_scope": descriptor.cache_scope,
        "supports_upload": bool(descriptor.supports_upload),
        "supports_preview": bool(descriptor.supports_preview),
        "supports_transcribe_api": bool(descriptor.supports_transcribe_api),
        "source_model_id": descriptor.source_model_id,
        "deploy_path": descriptor.deploy_path,
        "status": STATUS_READY,
        "available": True,
        "download_required": False,
        "preparing": False,
        "cached": False,
        "message": "",
        "last_error": "",
        "model_dir": "",
        "missing_files": [],
    }
    payload.update(overrides)
    payload["status"] = str(payload.get("status") or STATUS_READY).strip().lower()
    payload["available"] = bool(payload.get("available"))
    payload["download_required"] = bool(payload.get("download_required"))
    payload["preparing"] = bool(payload.get("preparing"))
    payload["cached"] = bool(payload.get("cached"))
    payload["message"] = str(payload.get("message") or "")
    payload["last_error"] = str(payload.get("last_error") or "")
    payload["model_dir"] = str(payload.get("model_dir") or "")
    payload["missing_files"] = [str(item) for item in list(payload.get("missing_files") or []) if str(item)]
    payload["actions"] = _build_actions(payload)
    return payload


def _require_descriptor(model_key: str) -> AsrModelDescriptor:
    descriptor = get_asr_model_descriptor(model_key)
    if descriptor is None:
        raise KeyError(str(model_key or "").strip())
    return descriptor


def _get_faster_whisper_status() -> dict[str, Any]:
    descriptor = _require_descriptor(FASTER_WHISPER_ASR_MODEL)
    payload = get_faster_whisper_model_status()
    normalized_status = str(payload.get("status") or STATUS_MISSING).strip().lower()
    available = bool(payload.get("cached")) or normalized_status in {STATUS_READY}
    return _base_state(
        descriptor,
        status=normalized_status,
        available=available,
        download_required=bool(payload.get("download_required")),
        preparing=bool(payload.get("preparing")),
        cached=bool(payload.get("cached")),
        message=str(payload.get("message") or ""),
        last_error=str(payload.get("last_error") or ""),
        model_dir=str(payload.get("model_dir") or str(FASTER_WHISPER_MODEL_DIR)),
        missing_files=list(payload.get("missing_files") or []),
    )


def _prepare_faster_whisper_model(force_refresh: bool = False) -> dict[str, Any]:
    descriptor = _require_descriptor(FASTER_WHISPER_ASR_MODEL)
    payload = prepare_faster_whisper_runtime_model(force_refresh=force_refresh)
    normalized_status = str(payload.get("status") or STATUS_MISSING).strip().lower()
    available = bool(payload.get("cached")) or normalized_status in {STATUS_READY}
    return _base_state(
        descriptor,
        status=normalized_status,
        available=available,
        download_required=bool(payload.get("download_required")),
        preparing=bool(payload.get("preparing")),
        cached=bool(payload.get("cached")),
        message=str(payload.get("message") or ""),
        last_error=str(payload.get("last_error") or ""),
        model_dir=str(payload.get("model_dir") or str(FASTER_WHISPER_MODEL_DIR)),
        missing_files=list(payload.get("missing_files") or []),
    )


def _get_qwen_status() -> dict[str, Any]:
    descriptor = _require_descriptor(QWEN_ASR_MODEL)
    if str(os.getenv("QWEN_ASR_ENABLED", "1") or "1").strip().lower() in _FALSEY_ENV_VALUES:
        return _base_state(
            descriptor,
            status=STATUS_ERROR,
            available=False,
            cached=False,
            download_required=False,
            message="Cloud API is disabled for this deployment.",
            last_error="qwen_asr_disabled",
        )
    api_key = str(DASHSCOPE_API_KEY or "").strip()
    if not api_key:
        return _base_state(
            descriptor,
            status=STATUS_MISSING,
            available=False,
            cached=False,
            download_required=False,
            message="DASHSCOPE_API_KEY is missing.",
            last_error="DASHSCOPE_API_KEY is missing.",
        )
    try:
        from app.infra.asr_dashscope import setup_dashscope

        setup_dashscope(api_key)
    except Exception as exc:  # pragma: no cover - defensive configuration check
        return _base_state(
            descriptor,
            status=STATUS_ERROR,
            available=False,
            cached=False,
            download_required=False,
            message="DashScope configuration is invalid.",
            last_error=str(exc)[:1200],
        )
    return _base_state(
        descriptor,
        status=STATUS_READY,
        available=True,
        cached=False,
        message="Cloud API is ready.",
    )


_ASR_MODEL_REGISTRY: tuple[AsrModelDescriptor, ...] = (
    AsrModelDescriptor(
        model_key=FASTER_WHISPER_ASR_MODEL,
        display_name="Bottle 1.0",
        subtitle="Higher accuracy, slower than Bottle 2.0.",
        runtime_kind="desktop_local_browser_local_cloud",
        runtime_label="Desktop Local / Browser Local / Cloud",
        prepare_mode="desktop_local_browser_local_or_cloud",
        cache_scope="desktop_and_server",
        supports_upload=True,
        supports_preview=False,
        supports_transcribe_api=True,
        source_model_id="Systran/faster-distil-whisper-small.en",
        deploy_path=str(FASTER_WHISPER_MODEL_DIR),
        note="Bottle 1.0 can switch between desktop local, browser local, and cloud runtime.",
        status_loader=_get_faster_whisper_status,
        prepare_loader=_prepare_faster_whisper_model,
        verify_loader=_get_faster_whisper_status,
    ),
    AsrModelDescriptor(
        model_key=QWEN_ASR_MODEL,
        display_name="Bottle 2.0",
        subtitle="Fast cloud transcription.",
        runtime_kind="cloud_api",
        runtime_label="Cloud API",
        prepare_mode="none",
        cache_scope="cloud",
        supports_upload=True,
        supports_preview=False,
        supports_transcribe_api=True,
        note="Cloud transcription route.",
        status_loader=_get_qwen_status,
        prepare_loader=lambda force_refresh=False: _get_qwen_status(),
        verify_loader=_get_qwen_status,
    ),
)
_REGISTRY_BY_KEY = {item.model_key: item for item in _ASR_MODEL_REGISTRY}


def list_asr_model_descriptors() -> list[AsrModelDescriptor]:
    return [item for item in _ASR_MODEL_REGISTRY if item.model_key in ALL_ASR_MODEL_KEYS]


def get_asr_model_descriptor(model_key: str) -> AsrModelDescriptor | None:
    normalized_model_key = str(model_key or "").strip()
    if normalized_model_key not in ALL_ASR_MODEL_KEYS:
        return None
    return _REGISTRY_BY_KEY.get(normalized_model_key)


def get_asr_model_status(model_key: str) -> dict[str, Any]:
    descriptor = get_asr_model_descriptor(model_key)
    if descriptor is None:
        raise KeyError(str(model_key or "").strip())
    loader = descriptor.status_loader or descriptor.verify_loader
    if loader is None:
        return _base_state(descriptor, status=STATUS_UNSUPPORTED, available=False, message="Unsupported model.")
    return loader()


def prepare_asr_model(model_key: str, *, force_refresh: bool = False) -> dict[str, Any]:
    descriptor = get_asr_model_descriptor(model_key)
    if descriptor is None:
        raise KeyError(str(model_key or "").strip())
    loader = descriptor.prepare_loader or descriptor.status_loader
    if loader is None:
        return _base_state(descriptor, status=STATUS_UNSUPPORTED, available=False, message="Unsupported model.")
    return loader(bool(force_refresh))


def verify_asr_model(model_key: str) -> dict[str, Any]:
    descriptor = get_asr_model_descriptor(model_key)
    if descriptor is None:
        raise KeyError(str(model_key or "").strip())
    loader = descriptor.verify_loader or descriptor.status_loader
    if loader is None:
        return _base_state(descriptor, status=STATUS_UNSUPPORTED, available=False, message="Unsupported model.")
    return loader()


def list_asr_models_with_status() -> list[dict[str, Any]]:
    return [get_asr_model_status(item.model_key) for item in list_asr_model_descriptors()]


def get_supported_upload_asr_model_keys() -> tuple[str, ...]:
    return UPLOAD_ASR_MODEL_KEYS


def get_supported_transcribe_asr_model_keys() -> tuple[str, ...]:
    return TRANSCRIBE_ASR_MODEL_KEYS


def get_supported_local_browser_asr_model_keys() -> tuple[str, ...]:
    return LOCAL_BROWSER_ASR_MODEL_KEYS


def get_supported_local_desktop_asr_model_keys() -> tuple[str, ...]:
    return LOCAL_DESKTOP_ASR_MODEL_KEYS


def get_supported_local_task_asr_model_keys() -> tuple[str, ...]:
    return LOCAL_TASK_ASR_MODEL_KEYS


def get_supported_asr_model_keys() -> tuple[str, ...]:
    return ALL_ASR_MODEL_KEYS


def get_asr_display_meta(model_key: str) -> tuple[str, str]:
    descriptor = get_asr_model_descriptor(model_key)
    if descriptor is None:
        return str(model_key or "").strip() or "Unnamed model", "cloud"
    if descriptor.runtime_kind == "cloud_api":
        return descriptor.display_name, "cloud"
    if descriptor.runtime_kind.startswith("server"):
        return descriptor.display_name, "server"
    if descriptor.runtime_kind.startswith("browser"):
        return descriptor.display_name, "browser"
    return descriptor.display_name, descriptor.runtime_kind
