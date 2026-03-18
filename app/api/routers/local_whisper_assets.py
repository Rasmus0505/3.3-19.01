from __future__ import annotations

import logging
import shutil
import threading
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import WHISPER_MIRROR_MODELS, WHISPER_MIRROR_ROOT, WHISPER_PREFETCH_ON_START


router = APIRouter(prefix="/api/local-whisper-assets", tags=["local-whisper-assets"])
logger = logging.getLogger(__name__)

HUGGINGFACE_BASE_URL = "https://huggingface.co"
WHISPER_CACHE_VERSION_FILE = ".cache_version"
WHISPER_CACHE_HEADERS = {
    "Cache-Control": "public, max-age=86400",
}
WHISPER_MODEL_SPECS: dict[str, dict[str, Any]] = {
    "whisper-base": {
        "repo_id": "openai/whisper-base",
        "revision": "main",
        "cache_version": "openai-whisper-base-20260318-v1",
        "files": (
            "config.json",
            "generation_config.json",
            "merges.txt",
            "model.safetensors",
            "normalizer.json",
            "preprocessor_config.json",
            "special_tokens_map.json",
            "tokenizer.json",
            "tokenizer_config.json",
            "vocab.json",
        ),
    },
    "whisper-small": {
        "repo_id": "openai/whisper-small",
        "revision": "main",
        "cache_version": "openai-whisper-small-20260318-v1",
        "files": (
            "config.json",
            "generation_config.json",
            "merges.txt",
            "model.safetensors",
            "normalizer.json",
            "preprocessor_config.json",
            "special_tokens_map.json",
            "tokenizer.json",
            "tokenizer_config.json",
            "vocab.json",
        ),
    },
}
_model_locks: dict[str, threading.Lock] = {}
_prefetch_state_lock = threading.Lock()
_prefetch_thread: threading.Thread | None = None
_prefetching_models: set[str] = set()
_prefetch_errors: dict[str, str] = {}


def _media_type(asset_name: str) -> str:
    suffix = Path(asset_name).suffix.lower()
    if suffix == ".json":
        return "application/json; charset=utf-8"
    if suffix == ".txt":
        return "text/plain; charset=utf-8"
    if suffix == ".safetensors":
        return "application/octet-stream"
    return "application/octet-stream"


def _normalized_enabled_model_keys() -> tuple[str, ...]:
    return tuple(model_key for model_key in WHISPER_MIRROR_MODELS if model_key in WHISPER_MODEL_SPECS)


def _model_spec(model_key: str) -> dict[str, Any]:
    normalized = str(model_key or "").strip().lower()
    spec = WHISPER_MODEL_SPECS.get(normalized)
    if not spec:
        raise KeyError(normalized)
    return spec


def _model_dir(model_key: str) -> Path:
    return WHISPER_MIRROR_ROOT / str(model_key).strip().lower()


def _cache_version_path(model_key: str) -> Path:
    return _model_dir(model_key) / WHISPER_CACHE_VERSION_FILE


def _download_root() -> Path:
    return WHISPER_MIRROR_ROOT / ".downloads"


def _allowed_files(model_key: str) -> tuple[str, ...]:
    return tuple(str(item) for item in _model_spec(model_key)["files"])


def _missing_model_files(model_key: str) -> list[str]:
    model_dir = _model_dir(model_key)
    return [name for name in _allowed_files(model_key) if not (model_dir / name).exists()]


def _read_cache_version(model_key: str) -> str:
    version_path = _cache_version_path(model_key)
    if not version_path.exists():
        return ""
    try:
        return version_path.read_text(encoding="utf-8").strip()
    except Exception:
        return ""


def _write_cache_version(model_key: str) -> None:
    _cache_version_path(model_key).write_text(str(_model_spec(model_key)["cache_version"]), encoding="utf-8")


def _has_model_cache(model_key: str) -> bool:
    return not _missing_model_files(model_key)


def _is_model_cache_current(model_key: str) -> bool:
    return _has_model_cache(model_key) and _read_cache_version(model_key) == str(_model_spec(model_key)["cache_version"])


def _prefetch_needed_for_model(model_key: str) -> bool:
    return not _has_model_cache(model_key) or not _is_model_cache_current(model_key)


def _get_model_lock(model_key: str) -> threading.Lock:
    normalized = str(model_key or "").strip().lower()
    with _prefetch_state_lock:
        lock = _model_locks.get(normalized)
        if lock is None:
            lock = threading.Lock()
            _model_locks[normalized] = lock
        return lock


def _set_prefetching(model_key: str, enabled: bool) -> None:
    normalized = str(model_key or "").strip().lower()
    with _prefetch_state_lock:
        if enabled:
            _prefetching_models.add(normalized)
        else:
            _prefetching_models.discard(normalized)


def _set_prefetch_error(model_key: str, detail: str) -> None:
    normalized = str(model_key or "").strip().lower()
    with _prefetch_state_lock:
        _prefetch_errors[normalized] = str(detail or "").strip()


def _is_prefetching(model_key: str) -> bool:
    with _prefetch_state_lock:
        return str(model_key or "").strip().lower() in _prefetching_models


def _prefetch_error(model_key: str) -> str:
    with _prefetch_state_lock:
        return str(_prefetch_errors.get(str(model_key or "").strip().lower()) or "").strip()


def _build_asset_source_url(model_key: str, asset_name: str) -> str:
    spec = _model_spec(model_key)
    repo_id = str(spec["repo_id"])
    revision = str(spec.get("revision") or "main")
    return f"{HUGGINGFACE_BASE_URL}/{repo_id}/resolve/{quote(revision, safe='')}/{quote(asset_name, safe='/')}?download=true"


def _download_asset_file(model_key: str, asset_name: str, destination_path: Path) -> None:
    source_url = _build_asset_source_url(model_key, asset_name)
    response = None
    try:
        logger.info("[DEBUG] local_whisper.assets.file_download_start model=%s asset=%s", model_key, asset_name)
        response = requests.get(source_url, stream=True, timeout=(20, 600))
        response.raise_for_status()
        with destination_path.open("wb") as output:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    output.write(chunk)
        logger.info("[DEBUG] local_whisper.assets.file_download_done model=%s asset=%s", model_key, asset_name)
    except Exception as exc:
        logger.exception("[DEBUG] local_whisper.assets.file_download_failed model=%s asset=%s detail=%s", model_key, asset_name, str(exc)[:400])
        raise RuntimeError(f"{asset_name}: {str(exc)[:1200]}") from exc
    finally:
        if response is not None:
            close = getattr(response, "close", None)
            if callable(close):
                close()


def _download_model_cache(model_key: str, *, force_refresh: bool = False) -> None:
    normalized = str(model_key or "").strip().lower()
    lock = _get_model_lock(normalized)
    with lock:
        missing = _missing_model_files(normalized)
        current = _is_model_cache_current(normalized)
        if not force_refresh and not missing and current:
            return

        model_dir = _model_dir(normalized)
        temp_dir = _download_root() / f"{normalized}_{uuid.uuid4().hex}"
        model_dir.mkdir(parents=True, exist_ok=True)
        temp_dir.mkdir(parents=True, exist_ok=True)
        logger.info(
            "[DEBUG] local_whisper.assets.download_start model=%s missing=%s force_refresh=%s current=%s",
            normalized,
            ",".join(missing),
            force_refresh,
            current,
        )
        try:
            for asset_name in _allowed_files(normalized):
                temp_path = temp_dir / asset_name
                temp_path.parent.mkdir(parents=True, exist_ok=True)
                should_skip = not force_refresh and current and (model_dir / asset_name).exists()
                if should_skip:
                    continue
                _download_asset_file(normalized, asset_name, temp_path)
                shutil.move(str(temp_path), str(model_dir / asset_name))
            _write_cache_version(normalized)
            _set_prefetch_error(normalized, "")
            logger.info("[DEBUG] local_whisper.assets.download_done model=%s files=%s", normalized, len(_allowed_files(normalized)))
        except Exception:
            raise
        finally:
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)


def _ensure_model_cache_populated(model_key: str) -> None:
    normalized = str(model_key or "").strip().lower()
    if _has_model_cache(normalized) and _is_model_cache_current(normalized):
        return
    _download_model_cache(normalized, force_refresh=not _is_model_cache_current(normalized))


def _prefetch_enabled_models() -> None:
    global _prefetch_thread
    try:
        for model_key in _normalized_enabled_model_keys():
            if not _prefetch_needed_for_model(model_key):
                logger.info("[DEBUG] local_whisper.assets.prefetch_skip model=%s reason=cache_ready", model_key)
                continue
            _set_prefetching(model_key, True)
            try:
                logger.info("[DEBUG] local_whisper.assets.prefetch_start model=%s", model_key)
                _download_model_cache(model_key, force_refresh=True)
                logger.info("[DEBUG] local_whisper.assets.prefetch_done model=%s current=%s", model_key, _is_model_cache_current(model_key))
            except Exception as exc:
                _set_prefetch_error(model_key, str(exc)[:1200])
                logger.exception("[DEBUG] local_whisper.assets.prefetch_failed model=%s detail=%s", model_key, str(exc)[:400])
            finally:
                _set_prefetching(model_key, False)
    finally:
        with _prefetch_state_lock:
            _prefetch_thread = None


def schedule_local_whisper_asset_prefetch() -> bool:
    global _prefetch_thread
    if not WHISPER_PREFETCH_ON_START:
        return False
    if not any(_prefetch_needed_for_model(model_key) for model_key in _normalized_enabled_model_keys()):
        return False
    with _prefetch_state_lock:
        if _prefetch_thread and _prefetch_thread.is_alive():
            return False
        _prefetch_thread = threading.Thread(target=_prefetch_enabled_models, name="local-whisper-prefetch", daemon=True)
        _prefetch_thread.start()
        return True


def _status_payload(model_key: str) -> dict[str, Any]:
    normalized = str(model_key or "").strip().lower()
    spec = _model_spec(normalized)
    missing_files = _missing_model_files(normalized)
    current = _is_model_cache_current(normalized)
    prefetching = _is_prefetching(normalized)
    if prefetching:
        state = "prefetching"
    elif current:
        state = "ready"
    elif missing_files:
        state = "missing"
    else:
        state = "stale"
    return {
        "model_key": normalized,
        "repo_id": str(spec["repo_id"]),
        "revision": str(spec.get("revision") or "main"),
        "cache_dir": str(_model_dir(normalized)),
        "version": str(spec["cache_version"]),
        "download_url_prefix": f"/api/local-whisper-assets/{normalized}",
        "allowed_files": list(_allowed_files(normalized)),
        "missing_files": missing_files,
        "cached": not missing_files,
        "current": current,
        "prefetching": prefetching,
        "status": state,
        "last_error": _prefetch_error(normalized),
    }


@router.get("/status")
def get_local_whisper_asset_status() -> dict[str, Any]:
    enabled_models = _normalized_enabled_model_keys()
    return {
        "ok": True,
        "prefetch_enabled": WHISPER_PREFETCH_ON_START,
        "cache_root": str(WHISPER_MIRROR_ROOT),
        "enabled_models": list(enabled_models),
        "models": [_status_payload(model_key) for model_key in enabled_models],
    }


@router.get("/{model_key}/{asset_path:path}")
def get_local_whisper_asset(model_key: str, asset_path: str):
    normalized_model = str(model_key or "").strip().lower()
    normalized_asset = str(asset_path or "").strip().lstrip("/")
    if normalized_model not in _normalized_enabled_model_keys():
        raise HTTPException(status_code=404, detail="Model not found")
    if normalized_asset not in set(_allowed_files(normalized_model)):
        raise HTTPException(status_code=404, detail="Asset not found")
    try:
        _ensure_model_cache_populated(normalized_model)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LOCAL_WHISPER_ASSET_FETCH_FAILED: {str(exc)[:1200]}") from exc

    asset_path_obj = _model_dir(normalized_model) / normalized_asset
    if not asset_path_obj.exists():
        raise HTTPException(status_code=404, detail="Asset not found")
    return FileResponse(
        path=asset_path_obj,
        media_type=_media_type(normalized_asset),
        filename=Path(normalized_asset).name,
        headers=WHISPER_CACHE_HEADERS,
    )
