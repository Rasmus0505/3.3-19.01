from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.billing import BillingRateItem


class AdminUserItem(BaseModel):
    id: int
    email: str
    created_at: datetime
    balance_points: int


class AdminUsersResponse(BaseModel):
    ok: bool = True
    page: int
    page_size: int
    total: int
    items: list[AdminUserItem]


class AdminUserDeleteResponse(BaseModel):
    ok: bool = True
    user_id: int
    email: str
    deleted_lessons: int
    deleted_ledger_rows: int
    cleared_operator_refs: int
    file_cleanup_failed_dirs: list[str]


class WalletAdjustRequest(BaseModel):
    delta_points: int
    reason: str = Field(min_length=1, max_length=500)


class WalletAdjustResponse(BaseModel):
    ok: bool = True
    user_id: int
    balance_points: int


class WalletLedgerItem(BaseModel):
    id: int
    user_id: int
    user_email: str
    operator_user_id: int | None
    event_type: str
    delta_points: int
    balance_after: int
    model_name: str | None
    duration_ms: int | None
    lesson_id: int | None
    note: str
    created_at: datetime


class AdminWalletLogsResponse(BaseModel):
    ok: bool = True
    page: int
    page_size: int
    total: int
    items: list[WalletLedgerItem]


class AdminBillingRateUpdateRequest(BaseModel):
    points_per_minute: int = Field(gt=0)
    is_active: bool


class AdminBillingRatesResponse(BaseModel):
    ok: bool = True
    rates: list[BillingRateItem]
