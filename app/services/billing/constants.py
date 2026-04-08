"""计费服务常量定义。

保留从原 billing.py 中提取的常量定义。
"""
from datetime import datetime, timedelta
from decimal import Decimal

from app.core.config import LESSON_DEFAULT_ASR_MODEL, REDEEM_CODE_DEFAULT_DAILY_LIMIT, REDEEM_CODE_DEFAULT_VALID_DAYS
from app.services.asr_model_registry import (
    QWEN_ASR_MODEL as FAST_CLOUD_MODEL,
)
from app.models.billing import cents_to_rate_yuan, normalize_rate_yuan as model_normalize_rate_yuan, rate_yuan_to_compat_cents

# 事件类型
EVENT_RESERVE = "reserve"
EVENT_CONSUME = "consume"
EVENT_REFUND = "refund"
EVENT_CONSUME_TRANSLATE = "consume_translate"
EVENT_REFUND_TRANSLATE = "refund_translate"
EVENT_CONSUME_LLM = "consume_llm"
EVENT_MANUAL_ADJUST = "manual_adjust"
EVENT_REDEEM_CODE = "redeem_code"

EVENTS = {
    "reserve": EVENT_RESERVE,
    "consume": EVENT_CONSUME,
    "refund": EVENT_REFUND,
    "consume_translate": EVENT_CONSUME_TRANSLATE,
    "refund_translate": EVENT_REFUND_TRANSLATE,
    "consume_llm": EVENT_CONSUME_LLM,
    "manual_adjust": EVENT_MANUAL_ADJUST,
    "redeem_code": EVENT_REDEEM_CODE,
}

# 兑换码状态
REDEEM_BATCH_STATUS_ACTIVE = "active"
REDEEM_BATCH_STATUS_PAUSED = "paused"
REDEEM_BATCH_STATUS_EXPIRED = "expired"

REDEEM_CODE_STATUS_ACTIVE = "active"
REDEEM_CODE_STATUS_DISABLED = "disabled"
REDEEM_CODE_STATUS_ABANDONED = "abandoned"
REDEEM_CODE_STATUS_REDEEMED = "redeemed"

REDEEM_STATUS = {
    "batch_active": REDEEM_BATCH_STATUS_ACTIVE,
    "batch_paused": REDEEM_BATCH_STATUS_PAUSED,
    "batch_expired": REDEEM_BATCH_STATUS_EXPIRED,
    "code_active": REDEEM_CODE_STATUS_ACTIVE,
    "code_disabled": REDEEM_CODE_STATUS_DISABLED,
    "code_abandoned": REDEEM_CODE_STATUS_ABANDONED,
    "code_redeemed": REDEEM_CODE_STATUS_REDEEMED,
}

# 兑换码失败原因
REDEEM_FAIL_CODE_NOT_FOUND = "code_not_found"
REDEEM_FAIL_ALREADY_USED = "already_used"
REDEEM_FAIL_EXPIRED = "expired"
REDEEM_FAIL_DISABLED = "disabled"
REDEEM_FAIL_DAILY_LIMIT = "daily_limit_exceeded"
REDEEM_FAIL_NOT_ACTIVE = "not_active"

# 兑换码字符集
_REDEEM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

# 默认费率配置
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

# 默认字幕设置
DEFAULT_SUBTITLE_SETTINGS = {
    "semantic_split_default_enabled": False,
    "default_asr_model": LESSON_DEFAULT_ASR_MODEL,
    "subtitle_split_enabled": True,
    "subtitle_split_target_words": 18,
    "subtitle_split_max_words": 40,
}
