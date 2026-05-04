from __future__ import annotations

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps.auth import get_admin_user
from app.core.errors import error_response, map_billing_error
from app.core.timezone import to_shanghai_aware, to_shanghai_naive
from app.db import get_db
from app.models import RedeemCode, RedeemCodeBatch, User
from app.repositories.admin import (
    list_all_redeem_audit_rows,
    list_redeem_audit_rows,
    list_redeem_batches,
    list_redeem_codes,
    list_unredeemed_codes_for_export,
)
from app.schemas import (
    AdminRedeemAuditExportRequest,
    AdminRedeemAuditItem,
    AdminRedeemAuditListResponse,
    AdminRedeemBatchActionResponse,
    AdminRedeemBatchCopyRequest,
    AdminRedeemBatchCreateRequest,
    AdminRedeemBatchCreateResponse,
    AdminRedeemBatchListResponse,
    AdminRedeemCodeBulkDisableRequest,
    AdminRedeemCodeBulkDisableResponse,
    AdminRedeemCodeExportRequest,
    AdminRedeemCodeItem,
    AdminRedeemCodeListResponse,
    AdminRedeemCodeStatusActionResponse,
    ErrorResponse,
)
from app.services.billing import (
    REDEEM_BATCH_STATUS_ACTIVE,
    REDEEM_BATCH_STATUS_EXPIRED,
    REDEEM_BATCH_STATUS_PAUSED,
    REDEEM_CODE_STATUS_ACTIVE,
    REDEEM_CODE_STATUS_DISABLED,
    BillingError,
    abandon_redeem_batch,
    abandon_redeem_code_with_refund,
    append_admin_operation_log,
    bulk_disable_redeem_codes,
    copy_redeem_batch_and_codes,
    create_redeem_batch_and_codes,
    delete_redeem_batch_and_codes,
    set_redeem_batch_status,
    update_redeem_code_status,
)

from .shared import (
    count_redeemed_codes,
    effective_code_status,
    export_confirm_text,
    now,
    require_export_protection_ready,
    to_batch_item,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


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
            batch=to_batch_item(batch, 0, now_value=now()),
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

    now_value = now()
    total, rows = list_redeem_batches(
        db,
        keyword=keyword,
        status=status,
        page=page,
        page_size=page_size,
        now=now_value,
    )

    items = [to_batch_item(batch, redeemed_count, now_value=now_value) for batch, redeemed_count, _ in rows]
    return AdminRedeemBatchListResponse(
        ok=True,
        page=page,
        page_size=page_size,
        total=total,
        items=items,
        summary_cards=[
            {"label": "匹配批次", "value": total, "hint": "当前筛选条件下的批次数", "tone": "info"},
            {"label": "本页进行中", "value": sum(1 for item in items if item.status == "active"), "hint": "仅统计当前页", "tone": "success"},
            {"label": "本页已兑码数", "value": sum(int(item.redeemed_count or 0) for item in items), "hint": "当前页合计", "tone": "default"},
        ],
    )


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
        return AdminRedeemBatchActionResponse(ok=True, batch=to_batch_item(batch, count_redeemed_codes(db, batch.id), now_value=now()))
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
        return AdminRedeemBatchActionResponse(ok=True, batch=to_batch_item(batch, count_redeemed_codes(db, batch.id), now_value=now()))
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
        return AdminRedeemBatchActionResponse(ok=True, batch=to_batch_item(batch, count_redeemed_codes(db, batch.id), now_value=now()))
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
            batch=to_batch_item(batch, 0, now_value=now()),
            generated_codes=[row.code_plain for row in rows],
        )
    except BillingError as exc:
        db.rollback()
        return map_billing_error(exc)


@router.delete(
    "/redeem-batches/{batch_id}",
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_delete_redeem_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    try:
        result = delete_redeem_batch_and_codes(
            db,
            batch_id=batch_id,
            operator_user_id=current_admin.id,
        )
        db.commit()
        return {"ok": True, "batch_id": batch_id, "deleted_code_count": result["deleted_code_count"]}
    except BillingError as exc:
        db.rollback()
        return map_billing_error(exc)


@router.post(
    "/redeem-batches/{batch_id}/abandon",
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_abandon_redeem_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    try:
        result = abandon_redeem_batch(
            db,
            batch_id=batch_id,
            operator_user_id=current_admin.id,
        )
        db.commit()
        return result
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
    now_value = now()
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
        now=now_value,
    )

    items = [
        AdminRedeemCodeItem(
            id=code.id,
            batch_id=batch.id,
            batch_name=batch.batch_name,
            code_mask=code.masked_code,
            code_plain=code.code_plain,
            status=code.status,
            effective_status=effective_code_status(
                code_status=code.status,
                batch_status=batch.status,
                expire_at=batch.expire_at,
                now_value=now_value,
            ),
            face_value_points=batch.face_value_points,
            redeemed_user_email=redeemed_user_email_item,
            redeemed_at=to_shanghai_aware(code.redeemed_at),
            created_by_user_id=code.created_by_user_id,
            created_at=to_shanghai_aware(code.created_at),
        )
        for code, batch, redeemed_user_email_item in rows
    ]
    return AdminRedeemCodeListResponse(
        ok=True,
        page=page,
        page_size=page_size,
        total=total,
        items=items,
        summary_cards=[
            {"label": "匹配兑换码", "value": total, "hint": "当前筛选条件下的兑换码总数", "tone": "info"},
            {"label": "本页未兑换", "value": sum(1 for item in items if item.effective_status == "unredeemed"), "hint": "仅统计当前页", "tone": "success"},
            {"label": "本页已失效", "value": sum(1 for item in items if item.effective_status in {'disabled', 'expired', 'abandoned'}), "hint": "当前页需要关注的失效码", "tone": "warning"},
        ],
    )


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
        effective = effective_code_status(
            code_status=code.status,
            batch_status=batch.status if batch else REDEEM_BATCH_STATUS_ACTIVE,
            expire_at=batch.expire_at if batch else now(),
            now_value=now(),
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
        effective = effective_code_status(
            code_status=code.status,
            batch_status=batch.status if batch else REDEEM_BATCH_STATUS_ACTIVE,
            expire_at=batch.expire_at if batch else now(),
            now_value=now(),
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
        result = abandon_redeem_code_with_refund(
            db,
            code_id=code_id,
            operator_user_id=current_admin.id,
        )
        db.commit()

        return AdminRedeemCodeStatusActionResponse(
            ok=True,
            code_id=code_id,
            status=result["status"],
            effective_status=result["status"],
        )
    except BillingError as exc:
        db.rollback()
        return map_billing_error(exc)
    except Exception as exc:
        db.rollback()
        return error_response(500, "INTERNAL_ERROR", "废弃兑换码失败", str(exc)[:1200])


@router.delete(
    "/redeem-codes/{code_id}",
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_delete_redeem_code(
    code_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    code = db.get(RedeemCode, code_id)
    if not code:
        return error_response(404, "REDEEM_CODE_NOT_FOUND", "兑换码不存在")

    append_admin_operation_log(
        db,
        operator_user_id=current_admin.id,
        action_type="redeem_code_hard_delete",
        target_type="redeem_code",
        target_id=str(code.id),
        before_value={
            "code_id": code.id,
            "batch_id": code.batch_id,
            "status": code.status,
            "masked_code": code.masked_code,
        },
        after_value={"deleted": True},
        note="hard_delete",
    )

    db.delete(code)
    db.commit()

    return {"ok": True, "code_id": code_id, "deleted": True}


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
    protection_error = require_export_protection_ready()
    if protection_error is not None:
        return protection_error
    if payload.confirm_text.strip() != export_confirm_text().strip():
        return error_response(400, "EXPORT_CONFIRM_REQUIRED", "导出需要二次确认")

    now_value = now()
    rows = list_unredeemed_codes_for_export(db, batch_id=payload.batch_id, now=now_value)

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

    filename = f"redeem_codes_{now_value.strftime('%Y%m%d_%H%M%S')}.csv"
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
    return AdminRedeemAuditListResponse(
        ok=True,
        page=page,
        page_size=page_size,
        total=total,
        items=items,
        summary_cards=[
            {"label": "匹配审计记录", "value": total, "hint": "当前时间与批次筛选范围", "tone": "info"},
            {"label": "本页成功", "value": sum(1 for item in items if item.success), "hint": "仅统计当前页", "tone": "success"},
            {"label": "本页失败", "value": sum(1 for item in items if not item.success), "hint": "可继续按失败原因排查", "tone": "danger"},
        ],
    )


@router.post(
    "/redeem-audit/export",
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_export_redeem_audit(
    payload: AdminRedeemAuditExportRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    protection_error = require_export_protection_ready()
    if protection_error is not None:
        return protection_error
    if payload.confirm_text.strip() != export_confirm_text().strip():
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

    now_value = now()
    filename = f"redeem_audit_{now_value.strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
