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


# 重新定义以下函数以支持 lesson_service.py 所需的参数签名
# 这些函数签名与 wallet.py 中的不同


def consume_points(
    db,
    *,
    user_id: int,
    points: int,
    model_name: str = "",
    lesson_id: int | None = None,
    event_type: str = EVENT_CONSUME,
    note: str = "",
    duration_ms: int = 0,
) -> "WalletAccount":
    """直接消耗点数（支持 lesson_id 和 event_type 参数）。"""
    from app.models import WalletLedger

    if points <= 0:
        raise BillingError("INVALID_POINTS", f"消耗点数必须大于 0: {points}")

    account = get_or_create_wallet_account(db, user_id, for_update=True)
    new_balance = account.balance_points - points
    if new_balance < 0:
        raise BillingError("INSUFFICIENT_BALANCE", f"余额不足：需要 {points} 点，当前 {account.balance_points} 点")

    note_str = note
    if duration_ms > 0:
        note_str = f"{note_str} ({duration_ms}ms)".strip()

    ledger = WalletLedger(
        user_id=user_id,
        operator_user_id=None,
        event_type=event_type,
        delta_amount_cents=-points,
        balance_after_amount_cents=new_balance,
        model_name=model_name,
        duration_ms=duration_ms or None,
        lesson_id=lesson_id,
        note=note_str,
    )
    db.add(ledger)
    account.balance_points = new_balance
    db.add(account)
    db.flush()
    return account


def refund_points(
    db,
    *,
    user_id: int,
    points: int,
    model_name: str = "",
    duration_ms: int | None = None,
    note: str = "",
) -> "WalletAccount":
    """退还点数（支持 model_name 和 duration_ms 参数）。"""
    from app.models import WalletLedger

    if points <= 0:
        raise BillingError("INVALID_POINTS", f"退还点数必须大于 0: {points}")

    account = get_or_create_wallet_account(db, user_id, for_update=True)
    new_balance = account.balance_points + points

    note_str = note
    if duration_ms and model_name:
        note_str = f"{note_str} ({model_name}, {duration_ms}ms)".strip()
    elif duration_ms:
        note_str = f"{note_str} ({duration_ms}ms)".strip()

    ledger = WalletLedger(
        user_id=user_id,
        operator_user_id=None,
        event_type=EVENT_REFUND,
        delta_amount_cents=points,
        balance_after_amount_cents=new_balance,
        model_name=model_name or None,
        duration_ms=duration_ms,
        note=note_str,
    )
    db.add(ledger)
    account.balance_points = new_balance
    db.add(account)
    db.flush()
    return account


def refund_points_by_event(
    db,
    *,
    user_id: int,
    points: int,
    model_name: str = "",
    lesson_id: int | None = None,
    event_type: str = EVENT_REFUND,
    duration_ms: int | None = None,
    note: str = "",
) -> "WalletAccount":
    """退还点数（支持 lesson_id 和 event_type 参数）。"""
    from app.models import WalletLedger

    if points <= 0:
        raise BillingError("INVALID_POINTS", f"退还点数必须大于 0: {points}")

    account = get_or_create_wallet_account(db, user_id, for_update=True)
    new_balance = account.balance_points + points

    ledger = WalletLedger(
        user_id=user_id,
        operator_user_id=None,
        event_type=event_type,
        delta_amount_cents=points,
        balance_after_amount_cents=new_balance,
        model_name=model_name or None,
        duration_ms=duration_ms,
        lesson_id=lesson_id,
        note=note,
    )
    db.add(ledger)
    account.balance_points = new_balance
    db.add(account)
    db.flush()
    return account


def reserve_points(
    db,
    *,
    user_id: int,
    points: int,
    model_name: str = "",
    lesson_id: int | None = None,
    duration_ms: int | None = None,
    note: str = "",
) -> "WalletLedger":
    """预扣点数（支持 lesson_id 参数）。"""
    from app.models import WalletLedger

    if points <= 0:
        raise BillingError("INVALID_POINTS", f"预扣点数必须大于 0: {points}")

    account = get_or_create_wallet_account(db, user_id, for_update=True)
    new_balance = account.balance_points - points

    ledger = WalletLedger(
        user_id=user_id,
        operator_user_id=None,
        event_type=EVENT_RESERVE,
        delta_amount_cents=-points,
        balance_after_amount_cents=new_balance,
        model_name=model_name or None,
        duration_ms=duration_ms,
        lesson_id=lesson_id,
        note=note,
    )
    db.add(ledger)
    account.balance_points = new_balance
    db.add(account)
    db.flush()
    return ledger


def settle_reserved_points(
    db,
    *,
    user_id: int,
    model_name: str,
    reserved_points: int,
    actual_points: int,
    duration_ms: int | None,
    note: str = "",
):
    """结算预扣点数（支持 model_name 和 duration_ms 参数）。"""
    from app.models import WalletLedger

    if reserved_points < 0:
        raise BillingError("INVALID_POINTS", "预扣点数不能为负数", str(reserved_points))
    if actual_points < 0:
        raise BillingError("INVALID_POINTS", "实耗点数不能为负数", str(actual_points))

    diff = int(actual_points) - int(reserved_points)
    if diff == 0:
        return None

    if diff < 0:
        return refund_points(
            db,
            user_id=user_id,
            points=abs(diff),
            model_name=model_name,
            duration_ms=duration_ms,
            note=note or "结算退款",
        )

    account = get_or_create_wallet_account(db, user_id, for_update=True)
    account.balance_points -= diff
    db.add(account)

    ledger = WalletLedger(
        user_id=user_id,
        operator_user_id=None,
        event_type=EVENT_CONSUME,
        delta_amount_cents=-diff,
        balance_after_amount_cents=account.balance_points,
        model_name=model_name,
        duration_ms=duration_ms,
        note=note or "结算补扣",
    )
    db.add(ledger)
    db.flush()
    return ledger


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
    "settle_reserved_points",
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
