from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class WalletMeResponse(BaseModel):
    ok: bool = True
    balance_points: int
    updated_at: datetime


class BillingRateItem(BaseModel):
    model_name: str
    points_per_minute: int
    is_active: bool
    updated_at: datetime


class BillingRatesResponse(BaseModel):
    ok: bool = True
    rates: list[BillingRateItem]
