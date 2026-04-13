from __future__ import annotations

from decimal import Decimal

from app.core.config import LESSON_DEFAULT_ASR_MODEL
from app.services.asr_model_registry import QWEN_ASR_MODEL as FAST_CLOUD_MODEL


EVENT_RESERVE = "reserve"
EVENT_CONSUME = "consume"
EVENT_REFUND = "refund"
EVENT_CONSUME_TRANSLATE = "consume_translate"
EVENT_REFUND_TRANSLATE = "refund_translate"
EVENT_CONSUME_LLM = "consume_llm"
EVENT_MANUAL_ADJUST = "manual_adjust"
EVENT_REDEEM_CODE = "redeem_code"

REDEEM_BATCH_STATUS_ACTIVE = "active"
REDEEM_BATCH_STATUS_PAUSED = "paused"
REDEEM_BATCH_STATUS_EXPIRED = "expired"

REDEEM_CODE_STATUS_ACTIVE = "active"
REDEEM_CODE_STATUS_DISABLED = "disabled"
REDEEM_CODE_STATUS_ABANDONED = "abandoned"
REDEEM_CODE_STATUS_REDEEMED = "redeemed"

REDEEM_FAIL_CODE_NOT_FOUND = "code_not_found"
REDEEM_FAIL_ALREADY_USED = "already_used"
REDEEM_FAIL_EXPIRED = "expired"
REDEEM_FAIL_DISABLED = "disabled"
REDEEM_FAIL_DAILY_LIMIT = "daily_limit_exceeded"
REDEEM_FAIL_NOT_ACTIVE = "not_active"

REDEEM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

DEFAULT_MT_COST_PER_1K_TOKENS_CENTS = 15
MT_FLASH_MODEL = "qwen-mt-flash"
MT_MODEL_PREFIX = "qwen-mt-"

ADMIN_BILLING_MODEL_ORDER: tuple[str, ...] = (
    FAST_CLOUD_MODEL,
    MT_FLASH_MODEL,
    "deepseek-v3.2",
)
PUBLIC_BILLING_MODEL_ORDER: tuple[str, ...] = (
    FAST_CLOUD_MODEL,
)
LOCAL_BROWSER_ASR_MODELS: tuple[str, ...] = ()

DEFAULT_MODEL_RATES: tuple[dict[str, object], ...] = (
    {
        "model_name": FAST_CLOUD_MODEL,
        "points_per_minute": 130,
        "price_per_minute_yuan": Decimal("1.3000"),
        "points_per_1k_tokens": 0,
        "cost_per_minute_cents": 0,
        "cost_per_minute_yuan": Decimal("0.0132"),
        "cost_per_1k_tokens_input_cents": 0,
        "cost_per_1k_tokens_output_cents": 0,
        "billing_unit": "minute",
        "parallel_enabled": True,
        "parallel_threshold_seconds": 600,
        "segment_seconds": 300,
        "max_concurrency": 4,
    },
    {
        "model_name": MT_FLASH_MODEL,
        "points_per_minute": 0,
        "price_per_minute_yuan": Decimal("0.0000"),
        "points_per_1k_tokens": DEFAULT_MT_COST_PER_1K_TOKENS_CENTS,
        "cost_per_minute_cents": 0,
        "cost_per_minute_yuan": Decimal("0.0000"),
        "cost_per_1k_tokens_input_cents": 1,
        "cost_per_1k_tokens_output_cents": 20,
        "billing_unit": "1k_tokens",
        "parallel_enabled": False,
        "parallel_threshold_seconds": 600,
        "segment_seconds": 300,
        "max_concurrency": 1,
    },
    {
        "model_name": "deepseek-v3.2",
        "points_per_minute": 0,
        "price_per_minute_yuan": Decimal("0.0000"),
        "points_per_1k_tokens": 16,
        "cost_per_minute_cents": 0,
        "cost_per_minute_yuan": Decimal("0.0000"),
        "cost_per_1k_tokens_input_cents": 2,
        "cost_per_1k_tokens_output_cents": 3,
        "billing_unit": "1k_tokens",
        "parallel_enabled": False,
        "parallel_threshold_seconds": 600,
        "segment_seconds": 300,
        "max_concurrency": 1,
        "enable_thinking": True,
    },
)

DEFAULT_SUBTITLE_SETTINGS = {
    "default_asr_model": LESSON_DEFAULT_ASR_MODEL,
    "subtitle_split_enabled": True,
    "subtitle_split_target_words": 18,
    "subtitle_split_max_words": 28,
    "translation_batch_max_chars": 2600,
}

SUBTITLE_SETTINGS_REQUIRED_COLUMN_SQL: tuple[tuple[str, str, str], ...] = (
    ("default_asr_model", f"VARCHAR(100) NOT NULL DEFAULT '{LESSON_DEFAULT_ASR_MODEL}'", f"VARCHAR(100) NOT NULL DEFAULT '{LESSON_DEFAULT_ASR_MODEL}'"),
    ("subtitle_split_enabled", "BOOLEAN NOT NULL DEFAULT 1", "BOOLEAN NOT NULL DEFAULT TRUE"),
    ("subtitle_split_target_words", "INTEGER NOT NULL DEFAULT 18", "INTEGER NOT NULL DEFAULT 18"),
    ("subtitle_split_max_words", "INTEGER NOT NULL DEFAULT 28", "INTEGER NOT NULL DEFAULT 28"),
    ("translation_batch_max_chars", "INTEGER NOT NULL DEFAULT 2600", "INTEGER NOT NULL DEFAULT 2600"),
    ("updated_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"),
    ("updated_by_user_id", "INTEGER", "INTEGER"),
)

TRANSLATION_REQUEST_LOG_REQUIRED_COLUMN_SQL: tuple[tuple[str, str, str], ...] = (
    ("input_text_preview", "VARCHAR(300) NOT NULL DEFAULT ''", "VARCHAR(300) NOT NULL DEFAULT ''"),
    ("provider_request_id", "VARCHAR(128)", "VARCHAR(128)"),
    ("status_code", "INTEGER", "INTEGER"),
    ("finish_reason", "VARCHAR(64)", "VARCHAR(64)"),
    ("prompt_tokens", "INTEGER NOT NULL DEFAULT 0", "INTEGER NOT NULL DEFAULT 0"),
    ("completion_tokens", "INTEGER NOT NULL DEFAULT 0", "INTEGER NOT NULL DEFAULT 0"),
    ("total_tokens", "INTEGER NOT NULL DEFAULT 0", "INTEGER NOT NULL DEFAULT 0"),
    ("success", "BOOLEAN NOT NULL DEFAULT 0", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("error_code", "VARCHAR(120)", "VARCHAR(120)"),
    ("error_message", "TEXT NOT NULL DEFAULT ''", "TEXT NOT NULL DEFAULT ''"),
    ("raw_request_text", "TEXT NOT NULL DEFAULT ''", "TEXT NOT NULL DEFAULT ''"),
    ("raw_response_text", "TEXT NOT NULL DEFAULT ''", "TEXT NOT NULL DEFAULT ''"),
    ("raw_error_text", "TEXT NOT NULL DEFAULT ''", "TEXT NOT NULL DEFAULT ''"),
    ("started_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"),
    ("finished_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"),
    ("created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"),
)
