from __future__ import annotations

import argparse
from datetime import datetime, timezone
import importlib
import os
import sys
from pathlib import Path

from fastapi import FastAPI


def _resolve_backend_root() -> Path:
    configured = os.getenv("DESKTOP_BACKEND_ROOT", "").strip()
    if configured:
        return Path(configured).resolve()
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


BACKEND_ROOT = _resolve_backend_root()
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def _build_default_paths() -> tuple[Path, Path, Path, Path, Path]:
    user_data_root = Path(os.getenv("DESKTOP_USER_DATA_DIR", "")).expanduser()
    if not str(user_data_root).strip():
        user_data_root = Path.home() / "AppData" / "Roaming" / "Bottle"

    model_root = Path(os.getenv("DESKTOP_MODEL_DIR", "")).expanduser()
    bundled_model_root = Path(os.getenv("DESKTOP_PREINSTALLED_MODEL_DIR", "")).expanduser()
    if not str(model_root).strip():
        if str(bundled_model_root).strip() and bundled_model_root.exists():
            model_root = bundled_model_root
        else:
            model_root = user_data_root / "models" / "faster-distil-small.en"

    cache_root = Path(os.getenv("DESKTOP_CACHE_DIR", "")).expanduser()
    if not str(cache_root).strip():
        cache_root = user_data_root / "cache"

    temp_root = Path(os.getenv("DESKTOP_TEMP_DIR", "")).expanduser()
    if not str(temp_root).strip():
        temp_root = user_data_root / "tmp"

    log_root = Path(os.getenv("DESKTOP_LOG_DIR", "")).expanduser()
    if not str(log_root).strip():
        log_root = user_data_root / "logs"
    return user_data_root, model_root, cache_root, temp_root, log_root


def _configure_runtime_environment(port: int) -> dict[str, str]:
    user_data_root, model_root, cache_root, temp_root, log_root = _build_default_paths()
    model_bundle_root = model_root.parent
    persistent_data_dir = user_data_root / "data"

    for directory in (user_data_root, model_bundle_root, cache_root, temp_root, log_root, persistent_data_dir):
        directory.mkdir(parents=True, exist_ok=True)

    os.environ["APP_ENV"] = os.getenv("APP_ENV", "desktop")
    os.environ["PORT"] = str(port)
    os.environ["TMP_WORK_DIR"] = str(temp_root)
    os.environ["PERSISTENT_DATA_DIR"] = str(persistent_data_dir)
    os.environ["ASR_BUNDLE_ROOT_DIR"] = str(model_bundle_root)
    os.environ["FASTER_WHISPER_MODEL_DIR"] = str(model_root)
    os.environ["PYTHONUNBUFFERED"] = "1"
    os.environ["DESKTOP_LOG_DIR"] = str(log_root)

    return {
        "user_data_dir": str(user_data_root),
        "model_dir": str(model_root),
        "cache_dir": str(cache_root),
        "temp_dir": str(temp_root),
        "log_dir": str(log_root),
    }


def _load_local_asr_assets_module():
    return importlib.import_module("app.api.routers.local_asr_assets")


def _load_desktop_asr_module():
    return importlib.import_module("app.api.routers.desktop_asr")


def _load_faster_whisper_status() -> dict[str, object]:
    try:
        faster_whisper_asr = importlib.import_module("app.services.faster_whisper_asr")
        payload = faster_whisper_asr.get_faster_whisper_model_status()
    except Exception as exc:
        return {
            "model_ready": False,
            "model_status": "status_error",
            "model_status_message": str(exc),
        }
    return {
        "model_ready": bool(payload.get("cached") and not payload.get("download_required")),
        "model_status": str(payload.get("status") or ""),
        "model_status_message": str(payload.get("message") or ""),
    }


def _build_helper_health_payload(runtime_paths: dict[str, str]) -> dict[str, object]:
    model_payload = _load_faster_whisper_status()
    helper_mode = "bundled-runtime" if getattr(sys, "frozen", False) else "system-python"
    return {
        "ok": True,
        "ready": True,
        "service": "desktop-local-helper",
        "helper_mode": helper_mode,
        "python_version": ".".join(
            [
                str(sys.version_info.major),
                str(sys.version_info.minor),
                str(sys.version_info.micro),
            ]
        ),
        "asr_model_ready": bool(model_payload["model_ready"]),
        "model_ready": bool(model_payload["model_ready"]),
        "model_status": str(model_payload["model_status"]),
        "model_status_message": str(model_payload["model_status_message"]),
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "runtime": runtime_paths,
    }


def create_desktop_helper_app(runtime_paths: dict[str, str]) -> FastAPI:
    local_asr_assets = _load_local_asr_assets_module()
    desktop_asr = _load_desktop_asr_module()

    app = FastAPI(title="Bottle Desktop Local Helper")
    app.include_router(local_asr_assets.router)
    app.include_router(desktop_asr.router)

    @app.get("/")
    def root() -> dict[str, object]:
        return {
            "ok": True,
            "service": "desktop-local-helper",
            "role": "local-resource-only",
            "runtime": runtime_paths,
        }

    @app.get("/health")
    def health() -> dict[str, object]:
        return _build_helper_health_payload(runtime_paths)

    @app.get("/health/ready")
    def ready() -> dict[str, object]:
        health_payload = _build_helper_health_payload(runtime_paths)
        return {
            **health_payload,
            "status": {
                "helper_ready": True,
                "local_only": True,
                "helper_mode": health_payload["helper_mode"],
                "python_version": health_payload["python_version"],
                "model_ready": health_payload["model_ready"],
                "model_status": health_payload["model_status"],
                "model_status_message": health_payload["model_status_message"],
                "checked_at": health_payload["checked_at"],
                "runtime": runtime_paths,
            },
        }

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the local helper for the Electron desktop client.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18080)
    args = parser.parse_args()

    os.chdir(BACKEND_ROOT)
    runtime_paths = _configure_runtime_environment(args.port)
    app = create_desktop_helper_app(runtime_paths)

    import uvicorn

    print(f"[desktop] helper_root={BACKEND_ROOT}")
    print(f"[desktop] model_dir={runtime_paths['model_dir']}")
    print(f"[desktop] cache_dir={runtime_paths['cache_dir']}")
    print(f"[desktop] log_dir={runtime_paths['log_dir']}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
