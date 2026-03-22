from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path


def _resolve_backend_root() -> Path:
    configured = os.getenv("DESKTOP_BACKEND_ROOT", "").strip()
    if configured:
        return Path(configured).resolve()
    return Path(__file__).resolve().parents[1]


BACKEND_ROOT = _resolve_backend_root()
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def _build_default_paths() -> tuple[Path, Path, Path, Path]:
    user_data_root = Path(os.getenv("DESKTOP_USER_DATA_DIR", "")).expanduser()
    if not str(user_data_root).strip():
        user_data_root = Path.home() / "AppData" / "Roaming" / "EnglishTrainerDesktop"

    cache_root = Path(os.getenv("DESKTOP_CACHE_DIR", "")).expanduser()
    if not str(cache_root).strip():
        cache_root = user_data_root / "cache"

    temp_root = Path(os.getenv("DESKTOP_TEMP_DIR", "")).expanduser()
    if not str(temp_root).strip():
        temp_root = user_data_root / "tmp"

    log_root = Path(os.getenv("DESKTOP_LOG_DIR", "")).expanduser()
    if not str(log_root).strip():
        log_root = user_data_root / "logs"
    return user_data_root, cache_root, temp_root, log_root


def _configure_runtime_environment(port: int) -> Path:
    user_data_root, cache_root, temp_root, log_root = _build_default_paths()
    persistent_data_dir = user_data_root / "data"
    asr_bundle_root = persistent_data_dir / "asr-models"
    faster_whisper_dir = asr_bundle_root / "faster-distil-small.en"
    database_file = user_data_root / "app.db"

    for directory in (user_data_root, cache_root, temp_root, log_root, persistent_data_dir, asr_bundle_root):
        directory.mkdir(parents=True, exist_ok=True)

    os.environ.setdefault("APP_ENV", "development")
    os.environ.setdefault("PORT", str(port))
    os.environ.setdefault("DATABASE_URL", f"sqlite:///{database_file.as_posix()}")
    os.environ.setdefault("JWT_SECRET", "desktop-client-secret")
    os.environ.setdefault("ADMIN_EMAILS", "")
    os.environ.setdefault("DASHSCOPE_API_KEY", "")
    os.environ.setdefault("TMP_WORK_DIR", str(temp_root))
    os.environ.setdefault("PERSISTENT_DATA_DIR", str(persistent_data_dir))
    os.environ.setdefault("ASR_BUNDLE_ROOT_DIR", str(asr_bundle_root))
    os.environ.setdefault("FASTER_WHISPER_MODEL_DIR", str(faster_whisper_dir))
    os.environ.setdefault("AUTO_MIGRATE_ON_START", "1")
    os.environ.setdefault("AUTO_MIGRATE_CONTINUE_ON_FAILURE", "0")
    os.environ.setdefault("PYTHONUNBUFFERED", "1")
    os.environ.setdefault("DESKTOP_LOG_DIR", str(log_root))
    return log_root


def _run_startup_migration() -> None:
    from app.db.migration_bootstrap import run_startup_migration

    # Desktop startup only needs the summary lines; suppress verbose per-revision logs.
    logging.getLogger("alembic").setLevel(logging.WARNING)
    logging.getLogger("alembic.runtime.migration").setLevel(logging.WARNING)
    result = run_startup_migration()
    if not result.allow_startup:
        raise RuntimeError(f"Desktop startup migration failed: {result.summary}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the FastAPI backend for the Electron desktop shell.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18080)
    args = parser.parse_args()

    os.chdir(BACKEND_ROOT)
    log_root = _configure_runtime_environment(args.port)
    _run_startup_migration()

    import uvicorn

    print(f"[desktop] backend_root={BACKEND_ROOT}")
    print(f"[desktop] log_dir={log_root}")
    uvicorn.run("app.main:app", host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
