from __future__ import annotations

import os
from pathlib import Path


SERVICE_NAME = "zeabur3.3-min-asr"
REQUEST_TIMEOUT_SECONDS = 480
UPLOAD_MAX_BYTES = 200 * 1024 * 1024

BASE_TMP_DIR = Path(os.getenv("TMP_WORK_DIR", "/tmp/zeabur3.3"))
BASE_DATA_DIR = BASE_TMP_DIR / "data"

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "").strip()
LESSON_DEFAULT_ASR_MODEL = os.getenv("LESSON_DEFAULT_ASR_MODEL", "paraformer-v2").strip()
APP_TIMEZONE = os.getenv("APP_TIMEZONE", "Asia/Shanghai").strip() or "Asia/Shanghai"


def _get_env_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except Exception:
        return default
    return value if value > 0 else default


def _get_env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


REDEEM_CODE_DEFAULT_VALID_DAYS = _get_env_int("REDEEM_CODE_DEFAULT_VALID_DAYS", 30)
REDEEM_CODE_DEFAULT_DAILY_LIMIT = _get_env_int("REDEEM_CODE_DEFAULT_DAILY_LIMIT", 5)
REDEEM_CODE_EXPORT_CONFIRM_TEXT = os.getenv("REDEEM_CODE_EXPORT_CONFIRM_TEXT", "EXPORT").strip() or "EXPORT"
ASR_SPLIT_ENABLED = _get_env_bool("ASR_SPLIT_ENABLED", True)
ASR_SPLIT_MAX_WORDS = _get_env_int("ASR_SPLIT_MAX_WORDS", 20)

APP_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = APP_DIR / "static"
