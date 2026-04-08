"""计费服务子模块。

提供钱包、兑换码、费率管理等功能的模块化服务。

此目录是为了未来重构准备的，当前代码仍主要使用 app.services.billing 和 app.services.billing_service。

使用方式：
    from app.services.billing.wallet import get_or_create_wallet_account, reserve_points
    from app.services.billing.redeem import redeem_code, create_redeem_batch_and_codes
    from app.services.billing.constants import EVENT_CONSUME_TRANSLATE

注意：由于向后兼容考虑，建议继续使用：
    from app.services.billing import reserve_points
    from app.services.billing_service import reserve_points
"""

# 子模块导出
from app.services.billing.wallet import (
    BillingError,
    get_or_create_wallet_account,
    reserve_points,
    record_consume,
    consume_points,
    refund_points,
    refund_points_by_event,
    manual_adjust,
    calculate_amount_by_duration_ms,
    calculate_cost_by_tokens,
    calculate_points,
    calculate_token_points,
    calculate_llm_cost_by_tokens,
    calculate_llm_charge_by_tokens,
)
from app.services.billing.redeem import (
    create_redeem_batch_and_codes,
    copy_redeem_batch_and_codes,
    set_redeem_batch_status,
    update_redeem_code_status,
    bulk_disable_redeem_codes,
    abandon_redeem_code_with_refund,
    delete_redeem_batch_and_codes,
    abandon_redeem_batch,
    redeem_code,
    normalize_redeem_code_input,
    hash_redeem_code,
    mask_redeem_code,
)
from app.services.billing.rates import (
    ensure_default_billing_rates,
    list_admin_rates,
    list_public_rates,
    get_model_rate,
    build_rate_payload,
    enforce_mt_flash_only_rates,
    normalize_rate_yuan,
    yuan_to_compat_cents,
)
from app.services.billing.settings import (
    SubtitleSettingsSnapshot,
    ensure_default_subtitle_settings,
    get_subtitle_settings,
    get_subtitle_settings_snapshot,
    get_default_asr_model,
)
from app.services.billing.constants import (
    EVENT_RESERVE,
    EVENT_CONSUME,
    EVENT_REFUND,
    EVENT_CONSUME_TRANSLATE,
    EVENT_REFUND_TRANSLATE,
    EVENT_CONSUME_LLM,
    EVENT_MANUAL_ADJUST,
    EVENT_REDEEM_CODE,
    REDEEM_BATCH_STATUS_ACTIVE,
    REDEEM_BATCH_STATUS_PAUSED,
    REDEEM_BATCH_STATUS_EXPIRED,
    REDEEM_CODE_STATUS_ACTIVE,
    REDEEM_CODE_STATUS_DISABLED,
    REDEEM_CODE_STATUS_ABANDONED,
    REDEEM_CODE_STATUS_REDEEMED,
    DEFAULT_MODEL_RATES,
    MT_FLASH_MODEL,
    ADMIN_BILLING_MODEL_ORDER,
    PUBLIC_BILLING_MODEL_ORDER,
    LOCAL_BROWSER_ASR_MODELS,
)
from app.services.billing.translation_logs import append_translation_request_logs
from app.services.billing.admin_ops import append_admin_operation_log

__all__ = [
    # 异常
    "BillingError",
    # 钱包
    "get_or_create_wallet_account",
    "reserve_points",
    "record_consume",
    "consume_points",
    "refund_points",
    "refund_points_by_event",
    "manual_adjust",
    "calculate_amount_by_duration_ms",
    "calculate_cost_by_tokens",
    "calculate_points",
    "calculate_token_points",
    "calculate_llm_cost_by_tokens",
    "calculate_llm_charge_by_tokens",
    # 兑换码
    "create_redeem_batch_and_codes",
    "copy_redeem_batch_and_codes",
    "set_redeem_batch_status",
    "update_redeem_code_status",
    "bulk_disable_redeem_codes",
    "abandon_redeem_code_with_refund",
    "delete_redeem_batch_and_codes",
    "abandon_redeem_batch",
    "redeem_code",
    "normalize_redeem_code_input",
    "hash_redeem_code",
    "mask_redeem_code",
    # 费率
    "ensure_default_billing_rates",
    "list_admin_rates",
    "list_public_rates",
    "get_model_rate",
    "normalize_rate_yuan",
    "yuan_to_compat_cents",
    # 设置
    "SubtitleSettingsSnapshot",
    "ensure_default_subtitle_settings",
    "get_subtitle_settings",
    "get_subtitle_settings_snapshot",
    "get_default_asr_model",
    # 常量
    "EVENT_RESERVE",
    "EVENT_CONSUME",
    "EVENT_REFUND",
    "EVENT_CONSUME_TRANSLATE",
    "EVENT_REFUND_TRANSLATE",
    "EVENT_CONSUME_LLM",
    "EVENT_MANUAL_ADJUST",
    "EVENT_REDEEM_CODE",
    "REDEEM_BATCH_STATUS_ACTIVE",
    "REDEEM_BATCH_STATUS_PAUSED",
    "REDEEM_BATCH_STATUS_EXPIRED",
    "REDEEM_CODE_STATUS_ACTIVE",
    "REDEEM_CODE_STATUS_DISABLED",
    "REDEEM_CODE_STATUS_ABANDONED",
    "REDEEM_CODE_STATUS_REDEEMED",
    "DEFAULT_MODEL_RATES",
    "MT_FLASH_MODEL",
    "ADMIN_BILLING_MODEL_ORDER",
    "PUBLIC_BILLING_MODEL_ORDER",
    "LOCAL_BROWSER_ASR_MODELS",
    # 翻译日志
    "append_translation_request_logs",
    # 管理员操作日志
    "append_admin_operation_log",
]
