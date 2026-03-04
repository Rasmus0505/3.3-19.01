from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_admin_user
from app.api.serializers import to_rate_item
from app.core.errors import error_response, map_billing_error
from app.db import get_db
from app.models import BillingModelRate, User
from app.repositories.admin import list_admin_users
from app.repositories.wallet_ledger import list_wallet_ledger_rows
from app.schemas import (
    AdminBillingRateUpdateRequest,
    AdminBillingRatesResponse,
    AdminUserItem,
    AdminUsersResponse,
    AdminWalletLogsResponse,
    ErrorResponse,
    WalletAdjustRequest,
    WalletAdjustResponse,
    WalletLedgerItem,
)
from app.services.billing_service import BillingError, manual_adjust


router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=AdminUsersResponse, responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}})
def admin_list_users(
    keyword: str = "",
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    page = max(page, 1)
    page_size = max(1, min(page_size, 100))
    total, rows = list_admin_users(
        db,
        keyword=keyword,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    items = [
        AdminUserItem(
            id=user_id,
            email=email,
            created_at=created_at,
            balance_points=balance_points,
        )
        for user_id, email, created_at, balance_points in rows
    ]
    return AdminUsersResponse(ok=True, page=page, page_size=page_size, total=total, items=items)


@router.post(
    "/users/{user_id}/wallet-adjust",
    response_model=WalletAdjustResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def admin_wallet_adjust(
    user_id: int,
    payload: WalletAdjustRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    target_user = db.get(User, user_id)
    if not target_user:
        return error_response(404, "USER_NOT_FOUND", "用户不存在")
    try:
        ledger = manual_adjust(
            db,
            user_id=user_id,
            operator_user_id=current_admin.id,
            delta_points=payload.delta_points,
            note=payload.reason,
        )
        db.commit()
        return WalletAdjustResponse(ok=True, user_id=user_id, balance_points=ledger.balance_after)
    except BillingError as exc:
        db.rollback()
        return map_billing_error(exc)
    except Exception as exc:
        db.rollback()
        return error_response(500, "INTERNAL_ERROR", "调账失败", str(exc)[:1200])


@router.get(
    "/wallet-logs",
    response_model=AdminWalletLogsResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_wallet_logs(
    user_email: str = "",
    event_type: str = "",
    page: int = 1,
    page_size: int = 20,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    page = max(page, 1)
    page_size = max(1, min(page_size, 100))

    total, rows = list_wallet_ledger_rows(
        db,
        user_email=user_email,
        event_type=event_type,
        page=page,
        page_size=page_size,
        date_from=date_from,
        date_to=date_to,
    )

    items = [
        WalletLedgerItem(
            id=ledger.id,
            user_id=ledger.user_id,
            user_email=email,
            operator_user_id=ledger.operator_user_id,
            event_type=ledger.event_type,
            delta_points=int(ledger.delta_points),
            balance_after=int(ledger.balance_after),
            model_name=ledger.model_name,
            duration_ms=ledger.duration_ms,
            lesson_id=ledger.lesson_id,
            note=ledger.note,
            created_at=ledger.created_at,
        )
        for ledger, email in rows
    ]
    return AdminWalletLogsResponse(ok=True, page=page, page_size=page_size, total=total, items=items)


@router.get(
    "/billing-rates",
    response_model=AdminBillingRatesResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_billing_rates(db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    rates = list(db.query(BillingModelRate).order_by(BillingModelRate.model_name.asc()).all())
    return AdminBillingRatesResponse(ok=True, rates=[to_rate_item(item) for item in rates])


@router.put(
    "/billing-rates/{model_name}",
    response_model=AdminBillingRatesResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def admin_update_billing_rate(
    model_name: str,
    payload: AdminBillingRateUpdateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    rate = db.get(BillingModelRate, model_name)
    if not rate:
        return error_response(404, "BILLING_RATE_NOT_FOUND", "计费模型不存在", model_name)
    rate.points_per_minute = payload.points_per_minute
    rate.is_active = payload.is_active
    rate.updated_by_user_id = current_admin.id
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return AdminBillingRatesResponse(ok=True, rates=[to_rate_item(rate)])
