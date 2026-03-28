from __future__ import annotations

import os

from app.core.config import DASHSCOPE_API_KEY

QWEN_ASR_MODEL = "qwen3-asr-flash-filetrans"
FASTER_WHISPER_ASR_MODEL = "faster-whisper-medium"

UPLOAD_ASR_MODEL_KEYS: tuple[str, ...] = (
    QWEN_ASR_MODEL,
)
TRANSCRIBE_ASR_MODEL_KEYS: tuple[str, ...] = (
    QWEN_ASR_MODEL,
    FASTER_WHISPER_ASR_MODEL,
)
LOCAL_BROWSER_ASR_MODEL_KEYS: tuple[str, ...] = ()
LOCAL_DESKTOP_ASR_MODEL_KEYS: tuple[str, ...] = (FASTER_WHISPER_ASR_MODEL,)
LOCAL_TASK_ASR_MODEL_KEYS: tuple[str, ...] = ()
ALL_ASR_MODEL_KEYS: tuple[str, ...] = (QWEN_ASR_MODEL, FASTER_WHISPER_ASR_MODEL)

STATUS_READY = "ready"
STATUS_PREPARING = "preparing"
STATUS_MISSING = "missing"
STATUS_ERROR = "error"
STATUS_UNSUPPORTED = "unsupported"

_FALSEY_ENV_VALUES = {"0", "false", "no", "off"}


def _get_qwen_status() -> dict[str, object]:
    if str(os.getenv("QWEN_ASR_ENABLED", "1") or "1").strip().lower() in _FALSEY_ENV_VALUES:
        return {
            "model_key": QWEN_ASR_MODEL,
            "display_name": "Bottle 2.0",
            "subtitle": "网页端默认路径，上传后即可开始生成。",
            "note": "Bottle 2.0 通过 DashScope 云端能力完成识别。",
            "runtime_kind": "cloud_api",
            "runtime_label": "Cloud API",
            "prepare_mode": "none",
            "cache_scope": "cloud",
            "supports_upload": True,
            "supports_preview": False,
            "supports_transcribe_api": True,
            "source_model_id": "",
            "deploy_path": "",
            "status": STATUS_ERROR,
            "available": False,
            "download_required": False,
            "preparing": False,
            "cached": False,
            "message": "Cloud API is disabled for this deployment.",
            "last_error": "qwen_asr_disabled",
            "model_dir": "",
            "missing_files": [],
            "actions": [{"key": "verify", "label": "Verify", "enabled": False, "primary": False}],
        }
    api_key = str(DASHSCOPE_API_KEY or "").strip()
    if not api_key:
        return {
            "model_key": QWEN_ASR_MODEL,
            "display_name": "Bottle 2.0",
            "subtitle": "网页端默认路径，上传后即可开始生成。",
            "note": "Bottle 2.0 通过 DashScope 云端能力完成识别。",
            "runtime_kind": "cloud_api",
            "runtime_label": "Cloud API",
            "prepare_mode": "none",
            "cache_scope": "cloud",
            "supports_upload": True,
            "supports_preview": False,
            "supports_transcribe_api": True,
            "source_model_id": "",
            "deploy_path": "",
            "status": STATUS_MISSING,
            "available": False,
            "download_required": False,
            "preparing": False,
            "cached": False,
            "message": "DASHSCOPE_API_KEY is missing.",
            "last_error": "DASHSCOPE_API_KEY is missing.",
            "model_dir": "",
            "missing_files": [],
            "actions": [{"key": "verify", "label": "Verify", "enabled": True, "primary": False}],
        }
    try:
        from app.infra.asr_dashscope import setup_dashscope

        setup_dashscope(api_key)
    except Exception as exc:  # pragma: no cover - defensive configuration check
        return {
            "model_key": QWEN_ASR_MODEL,
            "display_name": "Bottle 2.0",
            "subtitle": "网页端默认路径，上传后即可开始生成。",
            "note": "Bottle 2.0 通过 DashScope 云端能力完成识别。",
            "runtime_kind": "cloud_api",
            "runtime_label": "Cloud API",
            "prepare_mode": "none",
            "cache_scope": "cloud",
            "supports_upload": True,
            "supports_preview": False,
            "supports_transcribe_api": True,
            "source_model_id": "",
            "deploy_path": "",
            "status": STATUS_ERROR,
            "available": False,
            "download_required": False,
            "preparing": False,
            "cached": False,
            "message": "DashScope configuration is invalid.",
            "last_error": str(exc)[:1200],
            "model_dir": "",
            "missing_files": [],
            "actions": [{"key": "verify", "label": "Verify", "enabled": True, "primary": False}],
        }
    return {
        "model_key": QWEN_ASR_MODEL,
        "display_name": "Bottle 2.0",
        "subtitle": "网页端默认路径，上传后即可开始生成。",
        "note": "Bottle 2.0 通过 DashScope 云端能力完成识别。",
        "runtime_kind": "cloud_api",
        "runtime_label": "Cloud API",
        "prepare_mode": "none",
        "cache_scope": "cloud",
        "supports_upload": True,
        "supports_preview": False,
        "supports_transcribe_api": True,
        "source_model_id": "",
        "deploy_path": "",
        "status": STATUS_READY,
        "available": True,
        "download_required": False,
        "preparing": False,
        "cached": False,
        "message": "Cloud API is ready.",
        "last_error": "",
        "model_dir": "",
        "missing_files": [],
        "actions": [{"key": "verify", "label": "Verify", "enabled": True, "primary": False}],
    }


def list_asr_model_descriptors() -> list[dict[str, object]]:
    return [_get_qwen_status(), get_asr_model_status(FASTER_WHISPER_ASR_MODEL)]


def get_asr_model_status(model_key: str) -> dict[str, object]:
    if model_key == QWEN_ASR_MODEL:
        return _get_qwen_status()
    if model_key == FASTER_WHISPER_ASR_MODEL:
        from app.services.faster_whisper_asr import get_faster_whisper_model_status

        return get_faster_whisper_model_status()
    return {
        "model_key": str(model_key or "").strip() or "unknown",
        "status": STATUS_UNSUPPORTED,
        "available": False,
        "message": "Unsupported model.",
        "last_error": "",
        "actions": [{"key": "verify", "label": "Verify", "enabled": False, "primary": False}],
    }


def prepare_asr_model(model_key: str, *, force_refresh: bool = False) -> dict[str, object]:
    if model_key == FASTER_WHISPER_ASR_MODEL:
        from app.services.faster_whisper_asr import prepare_faster_whisper_model

        return prepare_faster_whisper_model()
    return _get_qwen_status()


def verify_asr_model(model_key: str) -> dict[str, object]:
    if model_key == FASTER_WHISPER_ASR_MODEL:
        return get_asr_model_status(model_key)
    return _get_qwen_status()


def list_asr_models_with_status() -> list[dict[str, object]]:
    return [_get_qwen_status(), get_asr_model_status(FASTER_WHISPER_ASR_MODEL)]


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
    if model_key == QWEN_ASR_MODEL:
        return "Bottle 2.0", "cloud"
    if model_key == FASTER_WHISPER_ASR_MODEL:
        return "Bottle 1.0", "desktop_local"
    return str(model_key or "").strip() or "Unnamed model", "cloud"
