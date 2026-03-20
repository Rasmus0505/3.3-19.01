from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from app.services.faster_whisper_asr import (
    FASTER_WHISPER_ASR_MODEL,
    FASTER_WHISPER_MODEL_DIR,
    get_faster_whisper_model_status,
    prepare_faster_whisper_model as prepare_faster_whisper_runtime_model,
)
from app.services.sensevoice import SENSEVOICE_ASR_MODEL


QWEN_ASR_MODEL = "qwen3-asr-flash-filetrans"
LOCAL_SENSEVOICE_ASR_MODEL = "local-sensevoice-small"

UPLOAD_ASR_MODEL_KEYS: tuple[str, ...] = (
    SENSEVOICE_ASR_MODEL,
    FASTER_WHISPER_ASR_MODEL,
    QWEN_ASR_MODEL,
)
TRANSCRIBE_ASR_MODEL_KEYS: tuple[str, ...] = UPLOAD_ASR_MODEL_KEYS
LOCAL_BROWSER_ASR_MODEL_KEYS: tuple[str, ...] = (
    LOCAL_SENSEVOICE_ASR_MODEL,
)
ALL_ASR_MODEL_KEYS: tuple[str, ...] = (
    *UPLOAD_ASR_MODEL_KEYS,
    *LOCAL_BROWSER_ASR_MODEL_KEYS,
)

STATUS_READY = "ready"
STATUS_PREPARING = "preparing"
STATUS_MISSING = "missing"
STATUS_ERROR = "error"
STATUS_UNSUPPORTED = "unsupported"


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


def _build_actions(state: dict[str, Any]) -> list[dict[str, Any]]:
    model_key = str(state.get("model_key") or "")
    runtime_kind = str(state.get("runtime_kind") or "")
    prepare_mode = str(state.get("prepare_mode") or "none")
    status = str(state.get("status") or "").lower()
    preparing = bool(state.get("preparing"))
    available = bool(state.get("available"))
    actions: list[dict[str, Any]] = []

    if runtime_kind == "browser_local":
        actions.append(
            {
                "key": "download",
                "label": "下载模型",
                "enabled": True,
                "primary": True,
            }
        )
        actions.append(
            {
                "key": "verify",
                "label": "重新校验",
                "enabled": True,
                "primary": False,
            }
        )
        return actions

    if prepare_mode != "none":
        actions.append(
            {
                "key": "prepare",
                "label": "准备模型",
                "enabled": not preparing,
                "primary": not available,
            }
        )

    actions.append(
        {
            "key": "verify",
            "label": "检查状态",
            "enabled": status != STATUS_UNSUPPORTED,
            "primary": False,
        }
    )
    return actions


def _sensevoice_model_dir() -> str:
    try:
        from app.db import SessionLocal
        from app.services.sensevoice import get_sensevoice_settings_snapshot

        db = SessionLocal()
        try:
            snapshot = get_sensevoice_settings_snapshot(db)
            return str(snapshot.model_dir or "").strip()
        finally:
            db.close()
    except Exception:
        return ""


def _get_sensevoice_model_status() -> dict[str, Any]:
    descriptor = get_asr_model_descriptor(SENSEVOICE_ASR_MODEL)
    model_dir = _sensevoice_model_dir()
    resolved_path = Path(model_dir) if model_dir else None
    cached = bool(resolved_path and resolved_path.exists())
    message = "按当前服务端配置运行"
    if cached:
        message = "服务端模型路径已就绪"
    elif model_dir:
        message = "模型将按当前配置在服务端运行时加载"
    return _base_state(
        descriptor,
        status=STATUS_READY,
        available=bool(model_dir or True),
        cached=cached,
        message=message,
        model_dir=model_dir,
    )


def _prepare_sensevoice_model(force_refresh: bool = False) -> dict[str, Any]:
    _ = force_refresh
    descriptor = get_asr_model_descriptor(SENSEVOICE_ASR_MODEL)
    model_dir = _sensevoice_model_dir()
    try:
        from app.db import SessionLocal
        from app.services.sensevoice import _get_or_create_model, get_sensevoice_settings_snapshot

        db = SessionLocal()
        try:
            snapshot = get_sensevoice_settings_snapshot(db)
        finally:
            db.close()
        _get_or_create_model(snapshot)
        return _base_state(
            descriptor,
            status=STATUS_READY,
            available=True,
            cached=True,
            message="服务端模型已就绪",
            model_dir=model_dir,
        )
    except Exception as exc:
        return _base_state(
            descriptor,
            status=STATUS_ERROR,
            available=False,
            cached=False,
            message="服务端模型校验失败",
            last_error=str(exc)[:1200],
            model_dir=model_dir,
        )


def _get_faster_whisper_status() -> dict[str, Any]:
    descriptor = get_asr_model_descriptor(FASTER_WHISPER_ASR_MODEL)
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
    descriptor = get_asr_model_descriptor(FASTER_WHISPER_ASR_MODEL)
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
    return _base_state(
        get_asr_model_descriptor(QWEN_ASR_MODEL),
        status=STATUS_READY,
        available=True,
        cached=False,
        message="云端接口可直接使用",
    )


def _get_local_browser_sensevoice_status() -> dict[str, Any]:
    return _base_state(
        get_asr_model_descriptor(LOCAL_SENSEVOICE_ASR_MODEL),
        status=STATUS_MISSING,
        available=False,
        download_required=True,
        cached=False,
        message="需要在当前浏览器中校验或下载模型",
    )


_ASR_MODEL_REGISTRY: tuple[AsrModelDescriptor, ...] = (
    AsrModelDescriptor(
        model_key=SENSEVOICE_ASR_MODEL,
        display_name="SenseVoice Small",
        subtitle="服务端均衡模式，按当前服务端模型配置运行。",
        runtime_kind="server_local",
        runtime_label="Server Runtime",
        prepare_mode="auto_on_demand",
        cache_scope="server",
        supports_upload=True,
        supports_preview=False,
        supports_transcribe_api=True,
        status_loader=_get_sensevoice_model_status,
        prepare_loader=_prepare_sensevoice_model,
        verify_loader=_get_sensevoice_model_status,
    ),
    AsrModelDescriptor(
        model_key=FASTER_WHISPER_ASR_MODEL,
        display_name="Faster Whisper Medium",
        subtitle="服务端缓存模型，首次使用时按需准备。",
        runtime_kind="server_cached",
        runtime_label="Server Cached Model",
        prepare_mode="auto_on_demand",
        cache_scope="server",
        supports_upload=True,
        supports_preview=False,
        supports_transcribe_api=True,
        source_model_id="pengzhendong/faster-whisper-medium",
        deploy_path=str(FASTER_WHISPER_MODEL_DIR),
        note="首次使用前会按需准备服务端模型缓存。",
        status_loader=_get_faster_whisper_status,
        prepare_loader=_prepare_faster_whisper_model,
        verify_loader=_get_faster_whisper_status,
    ),
    AsrModelDescriptor(
        model_key=QWEN_ASR_MODEL,
        display_name="Qwen ASR Flash",
        subtitle="云端文件转写，启动最快，无需准备服务端缓存。",
        runtime_kind="cloud_api",
        runtime_label="Cloud API",
        prepare_mode="none",
        cache_scope="cloud",
        supports_upload=True,
        supports_preview=False,
        supports_transcribe_api=True,
        status_loader=_get_qwen_status,
        prepare_loader=lambda force_refresh=False: _get_qwen_status(),
        verify_loader=_get_qwen_status,
    ),
    AsrModelDescriptor(
        model_key=LOCAL_SENSEVOICE_ASR_MODEL,
        display_name="SenseVoice Small",
        subtitle="浏览器本地模型，首次使用时在当前浏览器中下载或校验。",
        runtime_kind="browser_local",
        runtime_label="Browser WASM",
        prepare_mode="auto_on_demand",
        cache_scope="browser",
        supports_upload=True,
        supports_preview=True,
        supports_transcribe_api=False,
        note="浏览器本地缓存与服务端部署缓存互不共享。",
        status_loader=_get_local_browser_sensevoice_status,
        prepare_loader=lambda force_refresh=False: _get_local_browser_sensevoice_status(),
        verify_loader=_get_local_browser_sensevoice_status,
    ),
)
_REGISTRY_BY_KEY = {item.model_key: item for item in _ASR_MODEL_REGISTRY}


def list_asr_model_descriptors() -> list[AsrModelDescriptor]:
    return list(_ASR_MODEL_REGISTRY)


def get_asr_model_descriptor(model_key: str) -> AsrModelDescriptor | None:
    return _REGISTRY_BY_KEY.get(str(model_key or "").strip())


def get_asr_model_status(model_key: str) -> dict[str, Any]:
    descriptor = get_asr_model_descriptor(model_key)
    if descriptor is None:
        raise KeyError(str(model_key or "").strip())
    loader = descriptor.status_loader or descriptor.verify_loader
    if loader is None:
        return _base_state(descriptor, status=STATUS_UNSUPPORTED, available=False, message="模型状态不可用")
    return loader()


def prepare_asr_model(model_key: str, *, force_refresh: bool = False) -> dict[str, Any]:
    descriptor = get_asr_model_descriptor(model_key)
    if descriptor is None:
        raise KeyError(str(model_key or "").strip())
    loader = descriptor.prepare_loader or descriptor.status_loader
    if loader is None:
        return _base_state(descriptor, status=STATUS_UNSUPPORTED, available=False, message="模型不支持准备")
    return loader(bool(force_refresh))


def verify_asr_model(model_key: str) -> dict[str, Any]:
    descriptor = get_asr_model_descriptor(model_key)
    if descriptor is None:
        raise KeyError(str(model_key or "").strip())
    loader = descriptor.verify_loader or descriptor.status_loader
    if loader is None:
        return _base_state(descriptor, status=STATUS_UNSUPPORTED, available=False, message="模型不支持校验")
    return loader()


def list_asr_models_with_status() -> list[dict[str, Any]]:
    return [get_asr_model_status(item.model_key) for item in _ASR_MODEL_REGISTRY]


def get_supported_upload_asr_model_keys() -> tuple[str, ...]:
    return UPLOAD_ASR_MODEL_KEYS


def get_supported_transcribe_asr_model_keys() -> tuple[str, ...]:
    return TRANSCRIBE_ASR_MODEL_KEYS


def get_supported_local_browser_asr_model_keys() -> tuple[str, ...]:
    return LOCAL_BROWSER_ASR_MODEL_KEYS


def get_supported_asr_model_keys() -> tuple[str, ...]:
    return ALL_ASR_MODEL_KEYS


def get_asr_display_meta(model_key: str) -> tuple[str, str]:
    descriptor = get_asr_model_descriptor(model_key)
    if descriptor is None:
        return str(model_key or "").strip() or "未命名模型", "cloud"
    normalized_model_key = str(model_key or "").strip()
    if normalized_model_key == LOCAL_SENSEVOICE_ASR_MODEL:
        return f"{descriptor.display_name} · 本地", "local"
    if normalized_model_key == SENSEVOICE_ASR_MODEL:
        return f"{descriptor.display_name} · 服务端 ASR", "cloud"
    if normalized_model_key == FASTER_WHISPER_ASR_MODEL:
        return f"{descriptor.display_name} · 服务端 ASR", "cloud"
    if normalized_model_key == QWEN_ASR_MODEL:
        return "高速 · 云端 ASR", "cloud"
    runtime_kind = descriptor.runtime_kind
    if runtime_kind == "browser_local":
        return descriptor.display_name, "local"
    if runtime_kind == "cloud_api":
        return descriptor.display_name, "cloud"
    return descriptor.display_name, "cloud"
