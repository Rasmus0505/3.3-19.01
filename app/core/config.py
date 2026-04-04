from __future__ import annotations

import os
import tempfile
from pathlib import Path


SERVICE_NAME = "zeabur3.3-min-asr"
REQUEST_TIMEOUT_SECONDS = 480
UPLOAD_MAX_BYTES = 200 * 1024 * 1024
PRODUCTION_ENV_NAMES = {"prod", "production"}
WEAK_CONFIRM_TEXTS = {"EXPORT", "CONFIRM", "YES", "OK", "123456", "123123"}
APP_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = APP_DIR.parent
STATIC_DIR = APP_DIR / "static"

BASE_TMP_DIR = Path(os.getenv("TMP_WORK_DIR", "/tmp/zeabur3.3"))
BASE_DATA_DIR = BASE_TMP_DIR / "data"
MEDIA_STORAGE_ROOT_DIR = BASE_DATA_DIR


def _default_persistent_data_dir() -> Path:
    # Zeabur should mount a persistent volume at /data. Keep Windows local dev on a writable temp path.
    if os.name == "nt":
        return Path(tempfile.gettempdir()) / "zeabur3.3-persistent"
    return Path("/data")


def _default_asr_bundle_root() -> Path:
    return PROJECT_DIR / "asr-test" / "models"

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "").strip()
LESSON_DEFAULT_ASR_MODEL = os.getenv("LESSON_DEFAULT_ASR_MODEL", "qwen3-asr-flash-filetrans").strip() or "qwen3-asr-flash-filetrans"
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


def _get_env_text(*names: str, default: str = "") -> str:
    for name in names:
        raw = os.getenv(name)
        if raw is None:
            continue
        text = str(raw).strip()
        if text:
            return text
    return str(default or "").strip()


def _is_sqlite_url_text(database_url: str) -> bool:
    return str(database_url or "").strip().lower().startswith("sqlite")


def get_app_environment() -> str:
    environment = _get_env_text("APP_ENV", "ENVIRONMENT", "RUN_ENV", "NODE_ENV", default="").lower()
    if environment:
        return environment
    if os.getenv("PYTEST_CURRENT_TEST", "").strip():
        return "test"
    return "development"


def get_app_environment_name() -> str:
    return get_app_environment()


def is_production_environment() -> bool:
    environment = get_app_environment()
    return environment in PRODUCTION_ENV_NAMES


def is_strong_secret_phrase(value: str, *, min_length: int = 12) -> bool:
    text = str(value or "").strip()
    if len(text) < min_length:
        return False
    uppercase = any(ch.isupper() for ch in text)
    lowercase = any(ch.islower() for ch in text)
    digit = any(ch.isdigit() for ch in text)
    symbol = any(not ch.isalnum() for ch in text)
    return sum([uppercase, lowercase, digit, symbol]) >= 3


def get_redeem_code_export_confirm_text() -> str:
    return _get_env_text("REDEEM_CODE_EXPORT_CONFIRM_TEXT", default="EXPORT") or "EXPORT"


def is_redeem_code_export_confirm_text_strong(value: str | None = None) -> bool:
    text = str(value if value is not None else get_redeem_code_export_confirm_text()).strip()
    if text.upper() in WEAK_CONFIRM_TEXTS:
        return False
    return is_strong_secret_phrase(text, min_length=10)


def get_admin_bootstrap_password() -> str:
    return _get_env_text("ADMIN_BOOTSTRAP_PASSWORD", default="")


def is_admin_bootstrap_password_strong(value: str | None = None) -> bool:
    text = str(value if value is not None else get_admin_bootstrap_password()).strip()
    if text in {"", "123123"}:
        return False
    return is_strong_secret_phrase(text, min_length=12)


def resolve_database_url(*, development_default: str = "sqlite:///./app.db") -> str:
    configured = _get_env_text("DATABASE_URL", default="")
    if configured:
        if is_production_environment() and _is_sqlite_url_text(configured):
            raise RuntimeError("DATABASE_URL must point to PostgreSQL/MySQL in production; SQLite is not allowed")
        return configured
    if is_production_environment():
        raise RuntimeError("DATABASE_URL is required in production and cannot fall back to SQLite")
    return development_default.strip()


ASR_SEGMENT_TARGET_SECONDS = _get_env_int("ASR_SEGMENT_TARGET_SECONDS", 300)
ASR_SEGMENT_SEARCH_WINDOW_SECONDS = _get_env_int("ASR_SEGMENT_SEARCH_WINDOW_SECONDS", 45)
ASR_TASK_POLL_SECONDS = _get_env_int("ASR_TASK_POLL_SECONDS", 2)

MT_BATCH_MAX_CHARS = _get_env_int("MT_BATCH_MAX_CHARS", 2600)
MT_MIN_REQUEST_INTERVAL_MS = _get_env_non_negative_int("MT_MIN_REQUEST_INTERVAL_MS", 600)
MT_RETRY_MAX_ATTEMPTS = _get_env_int("MT_RETRY_MAX_ATTEMPTS", 4)
LESSON_TASK_MAX_ACTIVE = _get_env_int("LESSON_TASK_MAX_ACTIVE", 4)
LESSON_TASK_MAX_QUEUED = _get_env_non_negative_int("LESSON_TASK_MAX_QUEUED", 8)

PERSISTENT_DATA_DIR = Path(
    os.getenv("PERSISTENT_DATA_DIR", str(_default_persistent_data_dir())).strip() or str(_default_persistent_data_dir())
)
LESSON_WORKSPACE_ROOT_DIR = PERSISTENT_DATA_DIR / "lesson-workspaces"
ASR_BUNDLE_ROOT_DIR = Path(
    os.getenv("ASR_BUNDLE_ROOT_DIR", str(_default_asr_bundle_root())).strip() or str(_default_asr_bundle_root())
)

# 优先 TENCENT_*（与 .zeabur/zeabur.json、Docker 环境一致）；兼容 Zeabur 模板里填写的 APP_TENCENT_* 变量名
def _env_first(*keys: str) -> str:
    for k in keys:
        v = os.getenv(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return ""


TENCENT_SOE_APP_ID = _env_first("TENCENT_SOE_APP_ID", "APP_TENCENT_SOE_APP_ID")
TENCENT_SECRET_ID = _env_first("TENCENT_SECRET_ID", "APP_TENCENT_SECRET_ID")
TENCENT_SECRET_KEY = _env_first("TENCENT_SECRET_KEY", "APP_TENCENT_SECRET_KEY")

REDEEM_CODE_DEFAULT_VALID_DAYS = _get_env_int("REDEEM_CODE_DEFAULT_VALID_DAYS", 30)
REDEEM_CODE_DEFAULT_DAILY_LIMIT = _get_env_int("REDEEM_CODE_DEFAULT_DAILY_LIMIT", 5)
REDEEM_CODE_EXPORT_CONFIRM_TEXT = get_redeem_code_export_confirm_text()


def is_weak_confirm_text(value: str) -> bool:
    normalized = str(value or "").strip()
    if not normalized:
        return True
    if normalized.upper() in WEAK_CONFIRM_TEXTS:
        return True
    return len(normalized) < 12
