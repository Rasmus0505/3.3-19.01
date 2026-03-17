from __future__ import annotations

from datetime import datetime

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
    price_per_minute_cents: int
    cost_per_minute_cents: int
    gross_profit_per_minute_cents: int
    billing_unit: str
    is_active: bool
    parallel_enabled: bool
    parallel_threshold_seconds: int
    segment_seconds: int
    max_concurrency: int
    runtime_kind: str = "cloud"
    updated_at: datetime


class BillingRatesResponse(BaseModel):
    ok: bool = True
    rates: list[BillingRateItem]
    subtitle_settings: PublicSubtitleSettings
