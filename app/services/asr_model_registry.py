from __future__ import annotations

from app.infra.asr_stepfun import STEPFUN_ASR_MODEL
from app.services.ai_platform.registry import QWEN_ASR_MODEL, filter_models_by_capability, get_model_descriptor


UPLOAD_ASR_MODEL_KEYS: tuple[str, ...] = (
    QWEN_ASR_MODEL,
    STEPFUN_ASR_MODEL,
)
TRANSCRIBE_ASR_MODEL_KEYS: tuple[str, ...] = UPLOAD_ASR_MODEL_KEYS
LOCAL_BROWSER_ASR_MODEL_KEYS: tuple[str, ...] = ()
LOCAL_DESKTOP_ASR_MODEL_KEYS: tuple[str, ...] = ()
LOCAL_TASK_ASR_MODEL_KEYS: tuple[str, ...] = ()
ALL_ASR_MODEL_KEYS: tuple[str, ...] = UPLOAD_ASR_MODEL_KEYS

STATUS_READY = "ready"
STATUS_PREPARING = "preparing"
STATUS_MISSING = "missing"
STATUS_ERROR = "error"
STATUS_UNSUPPORTED = "unsupported"


def _descriptor_to_payload(model_key: str) -> dict[str, object]:
    descriptor = get_model_descriptor(model_key)
    if descriptor is None or "asr" not in set(descriptor.capabilities):
        return {
            "model_key": str(model_key or "").strip() or "unknown",
            "display_name": str(model_key or "").strip() or "Unsupported model",
            "subtitle": "",
            "note": "",
            "runtime_kind": "cloud_api",
            "runtime_label": "Cloud API",
            "prepare_mode": "none",
            "cache_scope": "cloud",
            "supports_upload": False,
            "supports_preview": False,
            "supports_transcribe_api": False,
            "source_model_id": "",
            "deploy_path": "",
            "status": STATUS_UNSUPPORTED,
            "available": False,
            "download_required": False,
            "preparing": False,
            "cached": False,
            "message": "Unsupported model.",
            "last_error": "",
            "model_dir": "",
            "missing_files": [],
            "actions": [{"key": "verify", "label": "Verify", "enabled": False, "primary": False}],
        }
    payload = descriptor.to_dict()
    payload.pop("provider", None)
    payload.pop("capabilities", None)
    payload.pop("default_for_capabilities", None)
    payload.pop("supported_features", None)
    return payload


def list_asr_model_descriptors() -> list[dict[str, object]]:
    return [item.to_dict() for item in filter_models_by_capability("asr")]


def get_asr_model_status(model_key: str) -> dict[str, object]:
    return _descriptor_to_payload(model_key)


def prepare_asr_model(model_key: str, *, force_refresh: bool = False) -> dict[str, object]:
    _ = force_refresh
    return _descriptor_to_payload(model_key)


def verify_asr_model(model_key: str) -> dict[str, object]:
    return _descriptor_to_payload(model_key)


def list_asr_models_with_status() -> list[dict[str, object]]:
    return [_descriptor_to_payload(item.model_key) for item in filter_models_by_capability("asr")]


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
    descriptor = get_model_descriptor(model_key)
    if descriptor is None:
        return str(model_key or "").strip() or "Unnamed model", "cloud"
    return descriptor.display_name, "cloud"
