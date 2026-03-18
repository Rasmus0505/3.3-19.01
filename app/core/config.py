from __future__ import annotations

import os
import tempfile
from pathlib import Path


SERVICE_NAME = "zeabur3.3-min-asr"
REQUEST_TIMEOUT_SECONDS = 480
UPLOAD_MAX_BYTES = 200 * 1024 * 1024

BASE_TMP_DIR = Path(os.getenv("TMP_WORK_DIR", "/tmp/zeabur3.3"))
BASE_DATA_DIR = BASE_TMP_DIR / "data"


def _default_persistent_data_dir() -> Path:
    # Zeabur should mount a persistent volume at /data. Keep Windows local dev on a writable temp path.
    if os.name == "nt":
        return Path(tempfile.gettempdir()) / "zeabur3.3-persistent"
    return Path("/data")

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "").strip()
LESSON_DEFAULT_ASR_MODEL = os.getenv("LESSON_DEFAULT_ASR_MODEL", "qwen3-asr-flash-filetrans").strip()
APP_TIMEZONE = os.getenv("APP_TIMEZONE", "Asia/Shanghai").strip() or "Asia/Shanghai"


def _get_env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "true" if default else "false").strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return default


def _get_env_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except Exception:
        return default
    return value if value > 0 else default


def _get_env_non_negative_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except Exception:
        return default
    return value if value >= 0 else default


def _get_env_csv(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    values = tuple(dict.fromkeys(item.strip().lower() for item in raw.split(",") if item.strip()))
    return values or default


ASR_SEGMENT_TARGET_SECONDS = _get_env_int("ASR_SEGMENT_TARGET_SECONDS", 300)
ASR_SEGMENT_SEARCH_WINDOW_SECONDS = _get_env_int("ASR_SEGMENT_SEARCH_WINDOW_SECONDS", 45)
ASR_TASK_POLL_SECONDS = _get_env_int("ASR_TASK_POLL_SECONDS", 2)

MT_BATCH_MAX_CHARS = _get_env_int("MT_BATCH_MAX_CHARS", 2600)
MT_MIN_REQUEST_INTERVAL_MS = _get_env_non_negative_int("MT_MIN_REQUEST_INTERVAL_MS", 600)
MT_RETRY_MAX_ATTEMPTS = _get_env_int("MT_RETRY_MAX_ATTEMPTS", 4)

PERSISTENT_DATA_DIR = Path(
    os.getenv("PERSISTENT_DATA_DIR", str(_default_persistent_data_dir())).strip() or str(_default_persistent_data_dir())
)
WHISPER_MIRROR_MODELS = _get_env_csv("WHISPER_MIRROR_MODELS", ("whisper-base", "whisper-small"))
WHISPER_MIRROR_ROOT = Path(
    os.getenv("WHISPER_MIRROR_ROOT", str(PERSISTENT_DATA_DIR / "local_whisper_assets")).strip()
    or str(PERSISTENT_DATA_DIR / "local_whisper_assets")
)
WHISPER_PREFETCH_ON_START = _get_env_bool("WHISPER_PREFETCH_ON_START", True)

REDEEM_CODE_DEFAULT_VALID_DAYS = _get_env_int("REDEEM_CODE_DEFAULT_VALID_DAYS", 30)
REDEEM_CODE_DEFAULT_DAILY_LIMIT = _get_env_int("REDEEM_CODE_DEFAULT_DAILY_LIMIT", 5)
REDEEM_CODE_EXPORT_CONFIRM_TEXT = os.getenv("REDEEM_CODE_EXPORT_CONFIRM_TEXT", "EXPORT").strip() or "EXPORT"

APP_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = APP_DIR / "static"
