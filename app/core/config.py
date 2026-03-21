from __future__ import annotations

import os
import tempfile
from pathlib import Path


SERVICE_NAME = "zeabur3.3-min-asr"
REQUEST_TIMEOUT_SECONDS = 480
UPLOAD_MAX_BYTES = 200 * 1024 * 1024
APP_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = APP_DIR.parent
STATIC_DIR = APP_DIR / "static"

BASE_TMP_DIR = Path(os.getenv("TMP_WORK_DIR", "/tmp/zeabur3.3"))
BASE_DATA_DIR = BASE_TMP_DIR / "data"


def _default_persistent_data_dir() -> Path:
    # Zeabur should mount a persistent volume at /data. Keep Windows local dev on a writable temp path.
    if os.name == "nt":
        return Path(tempfile.gettempdir()) / "zeabur3.3-persistent"
    return Path("/data")


def _default_faster_whisper_model_dir() -> Path:
    return _default_asr_bundle_root() / "faster-distil-small.en"


def _default_sensevoice_model_dir() -> Path:
    return _default_asr_bundle_root() / "SenseVoiceSmall"


def _default_asr_bundle_root() -> Path:
    return PROJECT_DIR / "asr-test" / "models"

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "").strip()
LESSON_DEFAULT_ASR_MODEL = os.getenv("LESSON_DEFAULT_ASR_MODEL", "sensevoice-small").strip()
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


ASR_SEGMENT_TARGET_SECONDS = _get_env_int("ASR_SEGMENT_TARGET_SECONDS", 300)
ASR_SEGMENT_SEARCH_WINDOW_SECONDS = _get_env_int("ASR_SEGMENT_SEARCH_WINDOW_SECONDS", 45)
ASR_TASK_POLL_SECONDS = _get_env_int("ASR_TASK_POLL_SECONDS", 2)

MT_BATCH_MAX_CHARS = _get_env_int("MT_BATCH_MAX_CHARS", 2600)
MT_MIN_REQUEST_INTERVAL_MS = _get_env_non_negative_int("MT_MIN_REQUEST_INTERVAL_MS", 600)
MT_RETRY_MAX_ATTEMPTS = _get_env_int("MT_RETRY_MAX_ATTEMPTS", 4)

PERSISTENT_DATA_DIR = Path(
    os.getenv("PERSISTENT_DATA_DIR", str(_default_persistent_data_dir())).strip() or str(_default_persistent_data_dir())
)
ASR_BUNDLE_ROOT_DIR = Path(
    os.getenv("ASR_BUNDLE_ROOT_DIR", str(_default_asr_bundle_root())).strip() or str(_default_asr_bundle_root())
)
SENSEVOICE_MODEL_DIR = Path(
    os.getenv("SENSEVOICE_MODEL_DIR", str(_default_sensevoice_model_dir())).strip() or str(_default_sensevoice_model_dir())
)
FASTER_WHISPER_MODELSCOPE_MODEL_ID = (
    os.getenv("FASTER_WHISPER_MODELSCOPE_MODEL_ID", "Systran/faster-distil-whisper-small.en").strip()
    or "Systran/faster-distil-whisper-small.en"
)
FASTER_WHISPER_MODEL_DIR = Path(
    os.getenv("FASTER_WHISPER_MODEL_DIR", str(_default_faster_whisper_model_dir())).strip() or str(_default_faster_whisper_model_dir())
)
FASTER_WHISPER_PREFETCH_ON_START = _get_env_bool("FASTER_WHISPER_PREFETCH_ON_START", False)
FASTER_WHISPER_COMPUTE_TYPE = os.getenv("FASTER_WHISPER_COMPUTE_TYPE", "int8").strip() or "int8"
FASTER_WHISPER_CPU_THREADS = _get_env_int("FASTER_WHISPER_CPU_THREADS", 4)

REDEEM_CODE_DEFAULT_VALID_DAYS = _get_env_int("REDEEM_CODE_DEFAULT_VALID_DAYS", 30)
REDEEM_CODE_DEFAULT_DAILY_LIMIT = _get_env_int("REDEEM_CODE_DEFAULT_DAILY_LIMIT", 5)
REDEEM_CODE_EXPORT_CONFIRM_TEXT = os.getenv("REDEEM_CODE_EXPORT_CONFIRM_TEXT", "EXPORT").strip() or "EXPORT"
