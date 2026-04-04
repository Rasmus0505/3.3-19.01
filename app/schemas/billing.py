from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class WalletMeResponse(BaseModel):
    ok: bool = True
    balance_amount_cents: int
    updated_at: datetime


class WalletRedeemCodeRequest(BaseModel):
    code: str = Field(min_length=4, max_length=64)


class WalletRedeemCodeResponse(BaseModel):
    ok: bool = True
    balance_amount_cents: int
    redeemed_amount_cents: int
    redeem_code_mask: str


class PublicSubtitleSettings(BaseModel):
    semantic_split_default_enabled: bool
    default_asr_model: str


class BillingRateItem(BaseModel):
    model_name: str
    display_name: str = ""
    price_per_minute_yuan: Decimal
    cost_per_minute_yuan: Decimal
    gross_profit_per_minute_yuan: Decimal
    price_per_minute_cents: int
    points_per_minute: int
    points_per_1k_tokens: int
    cost_per_minute_cents: int
    gross_profit_per_minute_cents: int
    billing_unit: str
    is_active: bool
    runtime_kind: str = "cloud"
    updated_at: datetime
    # System-fixed cost (cents per 1k tokens); read-only in UI
    cost_per_1k_tokens_input_cents: int = 0
    cost_per_1k_tokens_output_cents: int = 0


class BillingRatesResponse(BaseModel):
    ok: bool = True
    rates: list[BillingRateItem]
    subtitle_settings: PublicSubtitleSettings
