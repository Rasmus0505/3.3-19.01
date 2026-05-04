from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_admin_user
from app.core.errors import error_response, map_billing_error
from app.core.timezone import to_shanghai_aware
from app.db import get_db
from app.models import User
from app.repositories.admin import list_admin_users
from app.schemas import (
    AdminRoleChangeRequest,
    AdminRoleChangeResponse,
    AdminUserDeleteResponse,
    AdminUserItem,
    AdminUsersResponse,
    ErrorResponse,
    WalletAdjustRequest,
    WalletAdjustResponse,
)
from app.services.admin_bootstrap import count_admin_users
from app.services.admin_service import AdminUserDeleteError, delete_user_hard
from app.services.billing import BillingError, append_admin_operation_log, manual_adjust

from .shared import export_confirm_text, require_export_protection_ready

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
            is_admin=is_admin,
            created_at=to_shanghai_aware(created_at),
            balance_points=balance_points,
            last_login_at=to_shanghai_aware(last_login_at) if last_login_at else None,
        )
        for user_id, email, is_admin, created_at, balance_points, last_login_at in rows
    ]
    visible_balance_points = sum(int(item.balance_points or 0) for item in items)
    return AdminUsersResponse(
        ok=True,
        page=page,
        page_size=page_size,
        total=total,
        items=items,
        summary_cards=[
            {"label": "匹配用户", "value": total, "hint": "当前关键词筛中的总用户数", "tone": "info"},
            {"label": "本页管理员", "value": sum(1 for item in items if item.is_admin), "hint": "仅统计当前页", "tone": "warning"},
            {"label": "本页余额合计", "value": visible_balance_points, "hint": "仅统计当前页，避免误读为全量", "tone": "success"},
            {"label": "当前排序", "value": f"{sort_by}/{sort_dir}", "hint": "支持按最近登录与管理员状态排查", "tone": "default"},
        ],
    )


@router.post(
    "/users/{user_id}/grant-admin",
    response_model=AdminRoleChangeResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def admin_grant_admin_role(
    user_id: int,
    payload: AdminRoleChangeRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    protection_error = require_export_protection_ready()
    if protection_error is not None:
        return protection_error

    target_user = db.get(User, user_id)
    if not target_user:
        return error_response(404, "USER_NOT_FOUND", "用户不存在")
    if payload.confirm_text.strip() != export_confirm_text().strip():
        return error_response(400, "CONFIRM_TEXT_INVALID", "确认词错误")
    if payload.confirm_email.strip().lower() != target_user.email.lower():
        return error_response(400, "CONFIRM_EMAIL_MISMATCH", "请再次输入目标用户邮箱以确认")
    if bool(target_user.is_admin):
        return AdminRoleChangeResponse(ok=True, user_id=target_user.id, email=target_user.email, is_admin=True)

    target_user.is_admin = True
    append_admin_operation_log(
        db,
        operator_user_id=current_admin.id,
        action_type="admin_role_grant",
        target_type="user",
        target_id=str(target_user.id),
        before_value={"user_email": target_user.email, "is_admin": False},
        after_value={"user_email": target_user.email, "is_admin": True},
        note=(payload.reason or "").strip(),
    )
    db.add(target_user)
    db.commit()
    return AdminRoleChangeResponse(ok=True, user_id=target_user.id, email=target_user.email, is_admin=True)


@router.post(
    "/users/{user_id}/revoke-admin",
    response_model=AdminRoleChangeResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def admin_revoke_admin_role(
    user_id: int,
    payload: AdminRoleChangeRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    protection_error = require_export_protection_ready()
    if protection_error is not None:
        return protection_error

    target_user = db.get(User, user_id)
    if not target_user:
        return error_response(404, "USER_NOT_FOUND", "用户不存在")
    if payload.confirm_text.strip() != export_confirm_text().strip():
        return error_response(400, "CONFIRM_TEXT_INVALID", "确认词错误")
    if payload.confirm_email.strip().lower() != target_user.email.lower():
        return error_response(400, "CONFIRM_EMAIL_MISMATCH", "请再次输入目标用户邮箱以确认")
    if current_admin.id == target_user.id and count_admin_users(db) <= 1:
        return error_response(400, "LAST_ADMIN_PROTECTED", "不能移除系统最后一个管理员")
    if bool(target_user.is_admin) and count_admin_users(db) <= 1:
        return error_response(400, "LAST_ADMIN_PROTECTED", "不能移除系统最后一个管理员")
    if not bool(target_user.is_admin):
        return AdminRoleChangeResponse(ok=True, user_id=target_user.id, email=target_user.email, is_admin=False)

    target_user.is_admin = False
    append_admin_operation_log(
        db,
        operator_user_id=current_admin.id,
        action_type="admin_role_revoke",
        target_type="user",
        target_id=str(target_user.id),
        before_value={"user_email": target_user.email, "is_admin": True},
        after_value={"user_email": target_user.email, "is_admin": False},
        note=(payload.reason or "").strip(),
    )
    db.add(target_user)
    db.commit()
    return AdminRoleChangeResponse(ok=True, user_id=target_user.id, email=target_user.email, is_admin=False)


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
        )
        return AdminUserDeleteResponse(
            ok=True,
            user_id=result.user_id,
            email=result.email,
            deleted_lessons=result.deleted_lessons,
            deleted_lesson_sentences=result.deleted_lesson_sentences,
            deleted_lesson_progress=result.deleted_lesson_progress,
            deleted_media_assets=result.deleted_media_assets,
            deleted_ledger_rows=result.deleted_ledger_rows,
            deleted_wallet_account=result.deleted_wallet_account,
            cleared_operator_refs=result.cleared_operator_refs,
            cleared_task_refs=result.cleared_task_refs,
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
