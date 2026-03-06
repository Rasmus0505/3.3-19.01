from __future__ import annotations

import csv
import io
from datetime import datetime
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps.auth import get_admin_emails, get_admin_user
from app.api.serializers import to_rate_item
from app.core.config import REDEEM_CODE_DEFAULT_DAILY_LIMIT, REDEEM_CODE_EXPORT_CONFIRM_TEXT
from app.core.errors import error_response, map_billing_error
from app.core.timezone import now_shanghai_naive, to_shanghai_aware, to_shanghai_naive
from app.db import get_db
from app.models import BillingModelRate, RedeemCode, RedeemCodeBatch, User
from app.repositories.admin import (
    list_admin_users,
    list_all_redeem_audit_rows,
    list_redeem_audit_rows,
    list_redeem_batches,
    list_redeem_codes,
    list_unredeemed_codes_for_export,
)
from app.repositories.wallet_ledger import list_wallet_ledger_rows
from app.schemas import (
    AdminBillingRateUpdateRequest,
    AdminBillingRatesResponse,
    AdminRedeemAuditExportRequest,
    AdminRedeemAuditItem,
    AdminRedeemAuditListResponse,
    AdminRedeemBatchActionResponse,
    AdminRedeemBatchCopyRequest,
    AdminRedeemBatchCreateRequest,
    AdminRedeemBatchCreateResponse,
    AdminRedeemBatchItem,
    AdminRedeemBatchListResponse,
    AdminRedeemCodeBulkDisableRequest,
    AdminRedeemCodeBulkDisableResponse,
    AdminRedeemCodeExportRequest,
    AdminRedeemCodeItem,
    AdminRedeemCodeListResponse,
    AdminRedeemCodeStatusActionResponse,
    AdminUserDeleteResponse,
    AdminUserItem,
    AdminUsersResponse,
    AdminWalletLogsResponse,
    ErrorResponse,
    WalletAdjustRequest,
    WalletAdjustResponse,
    WalletLedgerItem,
)
from app.services.admin_service import AdminUserDeleteError, delete_user_hard
from app.services.billing_service import (
    BillingError,
    REDEEM_BATCH_STATUS_ACTIVE,
    REDEEM_BATCH_STATUS_EXPIRED,
    REDEEM_BATCH_STATUS_PAUSED,
    REDEEM_CODE_STATUS_ABANDONED,
    REDEEM_CODE_STATUS_ACTIVE,
    REDEEM_CODE_STATUS_DISABLED,
    append_admin_operation_log,
    bulk_disable_redeem_codes,
    copy_redeem_batch_and_codes,
    create_redeem_batch_and_codes,
    manual_adjust,
    set_redeem_batch_status,
    update_redeem_code_status,
)


router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)


def _now() -> datetime:
    return now_shanghai_naive()


def _effective_batch_status(*, status: str, expire_at: datetime, now: datetime) -> str:
    expire_at_naive = to_shanghai_naive(expire_at) or expire_at
    if status == REDEEM_BATCH_STATUS_EXPIRED or now >= expire_at_naive:
        return REDEEM_BATCH_STATUS_EXPIRED
    return status


def _effective_code_status(*, code_status: str, batch_status: str, expire_at: datetime, now: datetime) -> str:
    expire_at_naive = to_shanghai_naive(expire_at) or expire_at
    if code_status == "redeemed":
        return "redeemed"
    if code_status == "abandoned":
        return "abandoned"
    if code_status == "disabled" or batch_status == REDEEM_BATCH_STATUS_PAUSED:
        return "disabled"
    if batch_status == REDEEM_BATCH_STATUS_EXPIRED or now >= expire_at_naive:
        return "expired"
    return "unredeemed"


def _to_batch_item(batch: RedeemCodeBatch, redeemed_count: int, *, now: datetime) -> AdminRedeemBatchItem:
    generated_count = int(batch.generated_count)
    redeemed_count = int(max(0, redeemed_count))
    remaining_count = max(0, generated_count - redeemed_count)
    redeem_rate = round((redeemed_count / generated_count) if generated_count > 0 else 0.0, 4)
    total_issued_points = generated_count * int(batch.face_value_points)
    total_redeemed_points = redeemed_count * int(batch.face_value_points)
    effective_daily_limit = int(batch.daily_limit_per_user or REDEEM_CODE_DEFAULT_DAILY_LIMIT)

    return AdminRedeemBatchItem(
        id=batch.id,
        batch_name=batch.batch_name,
        face_value_points=int(batch.face_value_points),
        generated_count=generated_count,
        redeemed_count=redeemed_count,
        remaining_count=remaining_count,
        redeem_rate=redeem_rate,
        total_issued_points=total_issued_points,
        total_redeemed_points=total_redeemed_points,
        status=_effective_batch_status(status=batch.status, expire_at=batch.expire_at, now=now),
        active_from=to_shanghai_aware(batch.active_from),
        expire_at=to_shanghai_aware(batch.expire_at),
        daily_limit_per_user=batch.daily_limit_per_user,
        effective_daily_limit=effective_daily_limit,
        remark=batch.remark,
        created_by_user_id=batch.created_by_user_id,
        created_at=to_shanghai_aware(batch.created_at),
        updated_at=to_shanghai_aware(batch.updated_at),
    )


def _count_redeemed_codes(db: Session, batch_id: int) -> int:
    return int(db.scalar(select(func.count(RedeemCode.id)).where(RedeemCode.batch_id == batch_id, RedeemCode.status == "redeemed")) or 0)


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
            created_at=to_shanghai_aware(created_at),
            balance_points=balance_points,
        )
        for user_id, email, created_at, balance_points in rows
    ]
    return AdminUsersResponse(ok=True, page=page, page_size=page_size, total=total, items=items)


@router.delete(
    "/users/{user_id}",
    response_model=AdminUserDeleteResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def admin_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    try:
        result = delete_user_hard(
            db,
            target_user_id=user_id,
            current_admin=current_admin,
            admin_emails=get_admin_emails(),
        )
        return AdminUserDeleteResponse(
            ok=True,
            user_id=result.user_id,
            email=result.email,
            deleted_lessons=result.deleted_lessons,
            deleted_ledger_rows=result.deleted_ledger_rows,
            cleared_operator_refs=result.cleared_operator_refs,
            file_cleanup_failed_dirs=result.file_cleanup_failed_dirs,
        )
    except AdminUserDeleteError as exc:
        return error_response(exc.status_code, exc.code, exc.message, exc.detail)


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
    normalized_date_from = to_shanghai_naive(date_from)
    normalized_date_to = to_shanghai_naive(date_to)
    logger.debug(
        "[DEBUG] /api/admin/wallet-logs normalized filters date_from=%s date_to=%s",
        normalized_date_from.isoformat() if normalized_date_from else "",
        normalized_date_to.isoformat() if normalized_date_to else "",
    )

    total, rows = list_wallet_ledger_rows(
        db,
        user_email=user_email,
        event_type=event_type,
        page=page,
        page_size=page_size,
        date_from=normalized_date_from,
        date_to=normalized_date_to,
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
            redeem_batch_id=ledger.redeem_batch_id,
            redeem_code_id=ledger.redeem_code_id,
            redeem_code_mask=ledger.redeem_code_mask,
            note=ledger.note,
            created_at=to_shanghai_aware(ledger.created_at),
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
    rate.parallel_enabled = payload.parallel_enabled
    rate.parallel_threshold_seconds = payload.parallel_threshold_seconds
    rate.segment_seconds = payload.segment_seconds
    rate.max_concurrency = payload.max_concurrency
    rate.updated_by_user_id = current_admin.id
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return AdminBillingRatesResponse(ok=True, rates=[to_rate_item(rate)])


@router.post(
    "/redeem-batches",
    response_model=AdminRedeemBatchCreateResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_create_redeem_batch(
    payload: AdminRedeemBatchCreateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    try:
        batch, rows = create_redeem_batch_and_codes(
            db,
            batch_name=payload.batch_name,
            face_value_points=payload.face_value_points,
            generate_quantity=payload.generate_quantity,
            active_from=to_shanghai_naive(payload.active_from),
            expire_at=to_shanghai_naive(payload.expire_at),
            daily_limit_per_user=payload.daily_limit_per_user,
            remark=payload.remark,
            created_by_user_id=current_admin.id,
        )
        db.commit()
        db.refresh(batch)
        return AdminRedeemBatchCreateResponse(
            ok=True,
            batch=_to_batch_item(batch, 0, now=_now()),
            generated_codes=[row.code_plain for row in rows],
        )
    except BillingError as exc:
        db.rollback()
        return map_billing_error(exc)
    except Exception as exc:
        db.rollback()
        return error_response(500, "INTERNAL_ERROR", "创建兑换批次失败", str(exc)[:1200])


@router.get(
    "/redeem-batches",
    response_model=AdminRedeemBatchListResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_list_redeem_batches(
    keyword: str = "",
    status: str = "all",
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    page = max(page, 1)
    page_size = max(1, min(page_size, 100))

    now = _now()
    total, rows = list_redeem_batches(
        db,
        keyword=keyword,
        status=status,
        page=page,
        page_size=page_size,
        now=now,
    )

    items = [_to_batch_item(batch, redeemed_count, now=now) for batch, redeemed_count, _ in rows]
    return AdminRedeemBatchListResponse(ok=True, page=page, page_size=page_size, total=total, items=items)


@router.post(
    "/redeem-batches/{batch_id}/activate",
    response_model=AdminRedeemBatchActionResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_activate_redeem_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    try:
        batch = set_redeem_batch_status(
            db,
            batch_id=batch_id,
            next_status=REDEEM_BATCH_STATUS_ACTIVE,
            operator_user_id=current_admin.id,
            note="activate",
        )
        db.commit()
        return AdminRedeemBatchActionResponse(ok=True, batch=_to_batch_item(batch, _count_redeemed_codes(db, batch.id), now=_now()))
    except BillingError as exc:
        db.rollback()
        return map_billing_error(exc)


@router.post(
    "/redeem-batches/{batch_id}/pause",
    response_model=AdminRedeemBatchActionResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_pause_redeem_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    try:
        batch = set_redeem_batch_status(
            db,
            batch_id=batch_id,
            next_status=REDEEM_BATCH_STATUS_PAUSED,
            operator_user_id=current_admin.id,
            note="pause",
        )
        db.commit()
        return AdminRedeemBatchActionResponse(ok=True, batch=_to_batch_item(batch, _count_redeemed_codes(db, batch.id), now=_now()))
    except BillingError as exc:
        db.rollback()
        return map_billing_error(exc)


@router.post(
    "/redeem-batches/{batch_id}/expire",
    response_model=AdminRedeemBatchActionResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_expire_redeem_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    try:
        batch = set_redeem_batch_status(
            db,
            batch_id=batch_id,
            next_status=REDEEM_BATCH_STATUS_EXPIRED,
            operator_user_id=current_admin.id,
            note="expire",
        )
        db.commit()
        return AdminRedeemBatchActionResponse(ok=True, batch=_to_batch_item(batch, _count_redeemed_codes(db, batch.id), now=_now()))
    except BillingError as exc:
        db.rollback()
        return map_billing_error(exc)


@router.post(
    "/redeem-batches/{batch_id}/copy",
    response_model=AdminRedeemBatchCreateResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_copy_redeem_batch(
    batch_id: int,
    payload: AdminRedeemBatchCopyRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    try:
        batch, rows = copy_redeem_batch_and_codes(
            db,
            source_batch_id=batch_id,
            generate_quantity=payload.generate_quantity,
            created_by_user_id=current_admin.id,
        )
        db.commit()
        db.refresh(batch)
        return AdminRedeemBatchCreateResponse(
            ok=True,
            batch=_to_batch_item(batch, 0, now=_now()),
            generated_codes=[row.code_plain for row in rows],
        )
    except BillingError as exc:
        db.rollback()
        return map_billing_error(exc)


@router.get(
    "/redeem-codes",
    response_model=AdminRedeemCodeListResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_list_redeem_codes(
    batch_id: int | None = None,
    status: str = "all",
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    redeemed_from: datetime | None = None,
    redeemed_to: datetime | None = None,
    redeem_user_email: str = "",
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    page = max(page, 1)
    page_size = max(1, min(page_size, 100))
    now = _now()
    normalized_created_from = to_shanghai_naive(created_from)
    normalized_created_to = to_shanghai_naive(created_to)
    normalized_redeemed_from = to_shanghai_naive(redeemed_from)
    normalized_redeemed_to = to_shanghai_naive(redeemed_to)

    total, rows = list_redeem_codes(
        db,
        batch_id=batch_id,
        status=status,
        redeem_user_email=redeem_user_email,
        created_from=normalized_created_from,
        created_to=normalized_created_to,
        redeemed_from=normalized_redeemed_from,
        redeemed_to=normalized_redeemed_to,
        page=page,
        page_size=page_size,
        now=now,
    )

    items = [
        AdminRedeemCodeItem(
            id=code.id,
            batch_id=batch.id,
            batch_name=batch.batch_name,
            code_mask=code.masked_code,
            status=code.status,
            effective_status=_effective_code_status(
                code_status=code.status,
                batch_status=batch.status,
                expire_at=batch.expire_at,
                now=now,
            ),
            face_value_points=batch.face_value_points,
            redeemed_user_email=redeemed_user_email_item,
            redeemed_at=to_shanghai_aware(code.redeemed_at),
            created_by_user_id=code.created_by_user_id,
            created_at=to_shanghai_aware(code.created_at),
        )
        for code, batch, redeemed_user_email_item in rows
    ]
    return AdminRedeemCodeListResponse(ok=True, page=page, page_size=page_size, total=total, items=items)


@router.post(
    "/redeem-codes/{code_id}/enable",
    response_model=AdminRedeemCodeStatusActionResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_enable_redeem_code(
    code_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    try:
        code = update_redeem_code_status(
            db,
            code_id=code_id,
            next_status=REDEEM_CODE_STATUS_ACTIVE,
            operator_user_id=current_admin.id,
            note="enable",
        )
        batch = db.get(RedeemCodeBatch, code.batch_id)
        db.commit()
        effective = _effective_code_status(
            code_status=code.status,
            batch_status=batch.status if batch else REDEEM_BATCH_STATUS_ACTIVE,
            expire_at=batch.expire_at if batch else _now(),
            now=_now(),
        )
        return AdminRedeemCodeStatusActionResponse(ok=True, code_id=code.id, status=code.status, effective_status=effective)
    except BillingError as exc:
        db.rollback()
        return map_billing_error(exc)


@router.post(
    "/redeem-codes/{code_id}/disable",
    response_model=AdminRedeemCodeStatusActionResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_disable_redeem_code(
    code_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    try:
        code = update_redeem_code_status(
            db,
            code_id=code_id,
            next_status=REDEEM_CODE_STATUS_DISABLED,
            operator_user_id=current_admin.id,
            note="disable",
        )
        batch = db.get(RedeemCodeBatch, code.batch_id)
        db.commit()
        effective = _effective_code_status(
            code_status=code.status,
            batch_status=batch.status if batch else REDEEM_BATCH_STATUS_ACTIVE,
            expire_at=batch.expire_at if batch else _now(),
            now=_now(),
        )
        return AdminRedeemCodeStatusActionResponse(ok=True, code_id=code.id, status=code.status, effective_status=effective)
    except BillingError as exc:
        db.rollback()
        return map_billing_error(exc)


@router.post(
    "/redeem-codes/{code_id}/abandon",
    response_model=AdminRedeemCodeStatusActionResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_abandon_redeem_code(
    code_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    try:
        code = update_redeem_code_status(
            db,
            code_id=code_id,
            next_status=REDEEM_CODE_STATUS_ABANDONED,
            operator_user_id=current_admin.id,
            note="abandon",
        )
        batch = db.get(RedeemCodeBatch, code.batch_id)
        db.commit()
        effective = _effective_code_status(
            code_status=code.status,
            batch_status=batch.status if batch else REDEEM_BATCH_STATUS_ACTIVE,
            expire_at=batch.expire_at if batch else _now(),
            now=_now(),
        )
        return AdminRedeemCodeStatusActionResponse(ok=True, code_id=code.id, status=code.status, effective_status=effective)
    except BillingError as exc:
        db.rollback()
        return map_billing_error(exc)


@router.post(
    "/redeem-codes/bulk-disable",
    response_model=AdminRedeemCodeBulkDisableResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_bulk_disable_redeem_codes(
    payload: AdminRedeemCodeBulkDisableRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    if not payload.code_ids and payload.batch_id is None:
        return error_response(400, "INVALID_REQUEST", "请提供 code_ids 或 batch_id")
    try:
        changed_count = bulk_disable_redeem_codes(
            db,
            operator_user_id=current_admin.id,
            code_ids=payload.code_ids,
            batch_id=payload.batch_id,
        )
        db.commit()
        return AdminRedeemCodeBulkDisableResponse(ok=True, changed_count=changed_count)
    except BillingError as exc:
        db.rollback()
        return map_billing_error(exc)


@router.post(
    "/redeem-codes/export",
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_export_redeem_codes(
    payload: AdminRedeemCodeExportRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    if payload.confirm_text.strip().upper() != REDEEM_CODE_EXPORT_CONFIRM_TEXT.upper():
        return error_response(400, "EXPORT_CONFIRM_REQUIRED", "导出需要二次确认")

    now = _now()
    rows = list_unredeemed_codes_for_export(db, batch_id=payload.batch_id, now=now)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["batch_id", "batch_name", "face_value_points", "code", "masked_code", "active_from", "expire_at"])
    for code, batch in rows:
        writer.writerow(
            [
                batch.id,
                batch.batch_name,
                int(batch.face_value_points),
                code.code_plain,
                code.masked_code,
                to_shanghai_aware(batch.active_from).isoformat(),
                to_shanghai_aware(batch.expire_at).isoformat(),
            ]
        )

    append_admin_operation_log(
        db,
        operator_user_id=current_admin.id,
        action_type="redeem_code_export",
        target_type="redeem_code",
        target_id=str(payload.batch_id or "all"),
        before_value={"batch_id": payload.batch_id},
        after_value={"exported_count": len(rows)},
        note="export_unredeemed_codes",
    )
    db.commit()

    filename = f"redeem_codes_{now.strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get(
    "/redeem-audit",
    response_model=AdminRedeemAuditListResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_list_redeem_audit(
    user_email: str = "",
    batch_id: int | None = None,
    page: int = 1,
    page_size: int = 20,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    page = max(page, 1)
    page_size = max(1, min(page_size, 100))
    normalized_date_from = to_shanghai_naive(date_from)
    normalized_date_to = to_shanghai_naive(date_to)

    total, rows = list_redeem_audit_rows(
        db,
        user_email=user_email,
        batch_id=batch_id,
        date_from=normalized_date_from,
        date_to=normalized_date_to,
        page=page,
        page_size=page_size,
    )

    items = [
        AdminRedeemAuditItem(
            id=row.id,
            user_id=row.user_id,
            user_email=user_email_item,
            batch_id=row.batch_id,
            batch_name=batch_name_item,
            code_id=row.code_id,
            code_mask=row.code_mask,
            success=row.success,
            failure_reason=row.failure_reason,
            created_at=to_shanghai_aware(row.created_at),
        )
        for row, user_email_item, batch_name_item in rows
    ]
    return AdminRedeemAuditListResponse(ok=True, page=page, page_size=page_size, total=total, items=items)


@router.post(
    "/redeem-audit/export",
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_export_redeem_audit(
    payload: AdminRedeemAuditExportRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    if payload.confirm_text.strip().upper() != REDEEM_CODE_EXPORT_CONFIRM_TEXT.upper():
        return error_response(400, "EXPORT_CONFIRM_REQUIRED", "导出需要二次确认")

    normalized_date_from = to_shanghai_naive(payload.date_from)
    normalized_date_to = to_shanghai_naive(payload.date_to)
    rows = list_all_redeem_audit_rows(
        db,
        user_email=payload.user_email,
        batch_id=payload.batch_id,
        date_from=normalized_date_from,
        date_to=normalized_date_to,
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "user_email", "batch_id", "batch_name", "code_id", "code_mask", "success", "failure_reason", "created_at"])
    for row, user_email_item, batch_name_item in rows:
        writer.writerow(
            [
                row.id,
                user_email_item or "",
                row.batch_id or "",
                batch_name_item or "",
                row.code_id or "",
                row.code_mask,
                "success" if row.success else "failed",
                row.failure_reason,
                to_shanghai_aware(row.created_at).isoformat(),
            ]
        )

    append_admin_operation_log(
        db,
        operator_user_id=current_admin.id,
        action_type="redeem_audit_export",
        target_type="redeem_audit",
        target_id=str(payload.batch_id or "all"),
        before_value={
            "batch_id": payload.batch_id,
            "user_email": payload.user_email,
            "date_from": to_shanghai_aware(normalized_date_from).isoformat() if normalized_date_from else "",
            "date_to": to_shanghai_aware(normalized_date_to).isoformat() if normalized_date_to else "",
        },
        after_value={"exported_count": len(rows)},
        note="export_redeem_audit",
    )
    db.commit()

    now = _now()
    filename = f"redeem_audit_{now.strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
