from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class WalletMeResponse(BaseModel):
    ok: bool = True
    balance_points: int
    updated_at: datetime


class WalletRedeemCodeRequest(BaseModel):
    code: str = Field(min_length=4, max_length=64)


class WalletRedeemCodeResponse(BaseModel):
    ok: bool = True
    balance_points: int
    redeemed_points: int
    redeem_code_mask: str


class BillingRateItem(BaseModel):
    model_name: str
    points_per_minute: int
    is_active: bool
    updated_at: datetime


class BillingRatesResponse(BaseModel):
    ok: bool = True
    rates: list[BillingRateItem]
