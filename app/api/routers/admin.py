from __future__ import annotations

import csv
import io
import json
from datetime import datetime
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps.auth import get_admin_user
from app.api.serializers import (
    to_admin_subtitle_settings_item,
    to_rate_item,
)
from app.core.config import (
    BASE_DATA_DIR,
    LESSON_DEFAULT_ASR_MODEL,
    REDEEM_CODE_DEFAULT_DAILY_LIMIT,
    get_app_environment,
    get_redeem_code_export_confirm_text,
    is_production_environment,
    is_weak_confirm_text,
)
from app.core.errors import error_response, map_billing_error
from app.core.timezone import now_shanghai_naive, to_shanghai_aware, to_shanghai_naive
from app.db import DATABASE_URL, get_db, is_sqlite_url
from app.models import AdminOperationLog, BillingModelRate, RedeemCode, RedeemCodeBatch, SubtitleSetting, User
from app.repositories.admin import (
    list_admin_users,
    list_all_redeem_audit_rows,
    list_redeem_audit_rows,
    list_redeem_batches,
    list_redeem_codes,
    list_unredeemed_codes_for_export,
)
from app.repositories.wallet_ledger import list_translation_request_rows, list_wallet_ledger_rows
from app.schemas import (
    AdminBillingRateUpdateRequest,
    AdminBillingRatesResponse,
    AdminRuntimeReadinessItem,
    AdminRuntimeReadinessResponse,
    AdminSubtitleSettingsItem,
    AdminSubtitleSettingsHistoryItem,
    AdminSubtitleSettingsHistoryResponse,
    AdminSubtitleSettingsResponse,
    AdminSubtitleSettingsUpdateRequest,
    AdminTranslationLogItem,
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
    AdminRoleChangeRequest,
    AdminRoleChangeResponse,
    AdminSecurityAdminStatus,
    AdminSecurityDatabaseStatus,
    AdminSecurityExportStatus,
    AdminSecurityMediaStatus,
    AdminSecuritySectionStatus,
    AdminSecurityStatusResponse,
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
from app.services.asr_model_registry import list_asr_models_with_status
from app.services.admin_bootstrap import count_admin_users, get_admin_bootstrap_status
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
    enforce_mt_flash_only_rates,
    ensure_default_billing_rates,
    get_subtitle_settings,
    list_admin_rates,
    manual_adjust,
    normalize_rate_yuan,
    set_redeem_batch_status,
    update_redeem_code_status,
    yuan_to_compat_cents,
)
from app.services.media import get_controlled_media_roots
from app.api.routers.admin.announcements import router as announcement_router


router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)

_ADMIN_RUNTIME_READINESS_MODELS = (
    {
        "model_key": "faster-whisper-medium",
        "display_name": "Bottle 1.0",
        "runtime_kind": "desktop_local",
    },
    {
        "model_key": "qwen3-asr-flash-filetrans",
        "display_name": "Bottle 2.0",
        "runtime_kind": "cloud_api",
    },
)


def _now() -> datetime:
    return now_shanghai_naive()


def _parse_optional_lesson_id(raw_value: str | int | None):
    text_value = str(raw_value or "").strip()
    if not text_value:
        return None, None
    if not text_value.isdigit():
        return None, error_response(400, "INVALID_LESSON_ID", "lesson_id 必须是正整数")
    lesson_id = int(text_value)
    if lesson_id <= 0:
        return None, error_response(400, "INVALID_LESSON_ID", "lesson_id 必须是正整数")
    return lesson_id, None


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


def _export_confirm_text() -> str:
    return get_redeem_code_export_confirm_text()


def _require_export_protection_ready():
    confirm_text = _export_confirm_text()
    if is_production_environment() and is_weak_confirm_text(confirm_text):
        return error_response(
            503,
            "EXPORT_CONFIRM_NOT_CONFIGURED",
            "生产环境尚未配置强导出确认词",
            "请在 Zeabur 环境变量里把 REDEEM_CODE_EXPORT_CONFIRM_TEXT 设置为一个强随机短语",
        )
    return None


def _mask_email(email: str) -> str:
    local, _, domain = str(email or "").partition("@")
    if not local or not domain:
        return str(email or "")
    if len(local) <= 2:
        visible_local = f"{local[:1]}*"
    else:
        visible_local = f"{local[:2]}***"
    return f"{visible_local}@{domain}"


def _role_runtime_mode() -> str:
    return "db_role"


def _build_security_status_payload(db: Session, current_admin: User) -> AdminSecurityStatusResponse:
    bootstrap_status = get_admin_bootstrap_status()
    total_admin_users = count_admin_users(db)
    database_url = str(DATABASE_URL or "").strip()
    sqlite_in_use = is_sqlite_url(database_url)
    db_state = "healthy"
    db_detail = "生产环境已连接外部数据库。" if is_production_environment() and not sqlite_in_use else "当前运行配置允许。"
    if not database_url:
        db_state = "critical"
        db_detail = "DATABASE_URL 未配置。"
    elif is_production_environment() and sqlite_in_use:
        db_state = "critical"
        db_detail = "生产环境禁止使用 SQLite。"
    elif sqlite_in_use:
        db_state = "warning"
        db_detail = "当前仍在使用 SQLite，仅适合本地开发或测试。"

    export_confirm_text = _export_confirm_text()
    export_strong = not is_weak_confirm_text(export_confirm_text)
    export_state = "healthy"
    export_detail = "危险导出操作需要环境确认词。"
    if is_production_environment() and not export_strong:
        export_state = "critical"
        export_detail = "生产环境尚未配置强导出确认词，导出接口将被拒绝。"
    elif not export_strong:
        export_state = "warning"
        export_detail = "当前确认词仍然偏弱，建议尽快改成强随机短语。"

    media_roots = get_controlled_media_roots()
    media_root = media_roots[0] if media_roots else BASE_DATA_DIR.resolve()
    media_state = "healthy"
    media_detail = "媒体读取已限制在受控目录内，并兼容旧绝对路径。"
    if not media_root.exists():
        media_state = "warning"
        media_detail = "媒体根目录尚未创建；读取仍会做越界拦截。"

    admin_emails = [str(item) for item in list(bootstrap_status.get("admin_emails") or [])]
    bootstrap_password_configured = bool(bootstrap_status.get("bootstrap_password_configured"))
    bootstrap_password_strong = bool(bootstrap_status.get("bootstrap_password_strong"))
    bootstrap_state = "healthy"
    bootstrap_detail = f"当前共有 {total_admin_users} 个管理员账号。"
    if total_admin_users <= 0 and admin_emails:
        if bootstrap_password_configured and bootstrap_password_strong:
            bootstrap_state = "warning"
            bootstrap_detail = f"尚无管理员落库；已配置首次引导，可创建 {len(admin_emails)} 个管理员。"
        else:
            bootstrap_state = "critical"
            bootstrap_detail = "尚无管理员落库，且首次引导密码未安全配置。"
    elif total_admin_users <= 0:
        bootstrap_state = "critical"
        bootstrap_detail = "当前没有任何管理员账号。"
    return AdminSecurityStatusResponse(
        ok=True,
        sections=[
            AdminSecuritySectionStatus(state=db_state, summary="数据库策略", detail=db_detail),
            AdminSecuritySectionStatus(state=bootstrap_state, summary="管理员权限", detail=bootstrap_detail),
            AdminSecuritySectionStatus(state=export_state, summary="导出保护", detail=export_detail),
            AdminSecuritySectionStatus(state=media_state, summary="媒体路径安全", detail=media_detail),
        ],
        database=AdminSecurityDatabaseStatus(
            environment=get_app_environment(),
            database_url_present=bool(database_url),
            url_scheme=database_url.split(":", 1)[0] if database_url else "",
            sqlite_in_use=sqlite_in_use,
            production_requires_external_db=True,
            state=db_state,
            detail=db_detail,
        ),
        admin_access=AdminSecurityAdminStatus(
            total_admin_users=total_admin_users,
            runtime_authorization_mode=_role_runtime_mode(),
            email_fallback_enabled=False,
            admin_emails_configured_count=len(admin_emails),
            bootstrap_password_configured=bootstrap_password_configured,
            bootstrap_password_strong=bootstrap_password_strong,
            bootstrap_mode=str(bootstrap_status.get("bootstrap_mode") or ""),
            state=bootstrap_state,
            detail=bootstrap_detail,
        ),
        export_protection=AdminSecurityExportStatus(
            confirm_text_configured=bool(export_confirm_text),
            confirm_text_strong=export_strong,
            confirmation_mode="env_phrase",
            state=export_state,
            detail=export_detail,
        ),
        media_storage=AdminSecurityMediaStatus(
            storage_root=str(media_root),
            path_policy="relative_preferred_with_legacy_absolute_compat",
            strict_read_validation=True,
            root_exists=media_root.exists(),
            state=media_state,
            detail=media_detail,
        ),
    )


def _subtitle_settings_item_with_meta(
    settings: SubtitleSetting,
    *,
    updated_by_user_email: str | None = None,
) -> AdminSubtitleSettingsItem:
    item = to_admin_subtitle_settings_item(settings)
    return item.model_copy(
        update={
            "updated_by_user_id": settings.updated_by_user_id,
            "updated_by_user_email": updated_by_user_email,
        }
    )


def _subtitle_settings_item_from_dict(
    payload: dict[str, object],
    *,
    updated_at: datetime,
    updated_by_user_id: int | None = None,
    updated_by_user_email: str | None = None,
) -> AdminSubtitleSettingsItem:
    return AdminSubtitleSettingsItem(
        semantic_split_default_enabled=bool(payload.get("semantic_split_default_enabled")),
        default_asr_model=str(payload.get("default_asr_model") or LESSON_DEFAULT_ASR_MODEL),
        subtitle_split_enabled=bool(payload.get("subtitle_split_enabled", True)),
        subtitle_split_target_words=int(payload.get("subtitle_split_target_words", 18) or 18),
        subtitle_split_max_words=int(payload.get("subtitle_split_max_words", 28) or 28),
        semantic_split_max_words_threshold=int(payload.get("semantic_split_max_words_threshold", 24) or 24),
        semantic_split_timeout_seconds=int(payload.get("semantic_split_timeout_seconds", 40) or 40),
        translation_batch_max_chars=max(1, min(12000, int(payload.get("translation_batch_max_chars", 2600) or 2600))),
        updated_at=to_shanghai_aware(updated_at),
        updated_by_user_id=updated_by_user_id,
        updated_by_user_email=updated_by_user_email,
    )


def _load_subtitle_settings_rollback_candidate(db: Session) -> AdminSubtitleSettingsHistoryItem | None:
    operator_user = User.__table__.alias("subtitle_settings_operator")
    row = db.execute(
        select(AdminOperationLog, operator_user.c.email.label("operator_email"))
        .outerjoin(operator_user, operator_user.c.id == AdminOperationLog.operator_user_id)
        .where(
            AdminOperationLog.target_type == "subtitle_settings",
            AdminOperationLog.action_type.in_(["subtitle_settings_update", "subtitle_settings_rollback"]),
        )
        .order_by(AdminOperationLog.created_at.desc(), AdminOperationLog.id.desc())
        .limit(1)
    ).first()
    if row is None:
        return None

    raw_before = getattr(row[0], "before_value", "") or ""
    try:
        payload = json.loads(raw_before)
    except Exception:
        payload = {}
    if not isinstance(payload, dict) or not payload:
        return None

    return AdminSubtitleSettingsHistoryItem(
        action_id=int(row[0].id),
        created_at=to_shanghai_aware(row[0].created_at),
        operator_user_id=row[0].operator_user_id,
        operator_user_email=row.operator_email,
        settings=_subtitle_settings_item_from_dict(
            payload,
            updated_at=row[0].created_at,
            updated_by_user_id=row[0].operator_user_id,
            updated_by_user_email=row.operator_email,
        ),
    )


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


@router.get(
    "/security/status",
    response_model=AdminSecurityStatusResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_security_status(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    return _build_security_status_payload(db, current_admin)


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
    protection_error = _require_export_protection_ready()
    if protection_error is not None:
        return protection_error

    target_user = db.get(User, user_id)
    if not target_user:
        return error_response(404, "USER_NOT_FOUND", "用户不存在")
    if payload.confirm_text.strip() != _export_confirm_text().strip():
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
    protection_error = _require_export_protection_ready()
    if protection_error is not None:
        return protection_error

    target_user = db.get(User, user_id)
    if not target_user:
        return error_response(404, "USER_NOT_FOUND", "用户不存在")
    if payload.confirm_text.strip() != _export_confirm_text().strip():
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

    payload = list_wallet_ledger_rows(
        db,
        user_email=user_email,
        event_type=event_type,
        page=page,
        page_size=page_size,
        date_from=normalized_date_from,
        date_to=normalized_date_to,
    )
    total = int(payload["total"])
    rows = payload["rows"]

    items = [
        WalletLedgerItem(
            id=ledger.id,
            user_id=ledger.user_id,
            user_email=email,
            operator_user_id=ledger.operator_user_id,
            event_type=ledger.event_type,
            delta_points=int(ledger.delta_points),
            balance_after=int(ledger.balance_after),
            delta_amount_cents=int(getattr(ledger, "delta_amount_cents", ledger.delta_points)),
            balance_after_amount_cents=int(getattr(ledger, "balance_after_amount_cents", ledger.balance_after)),
            amount_unit=str(getattr(ledger, "amount_unit", "cents") or "cents"),
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
    return AdminWalletLogsResponse(
        ok=True,
        page=page,
        page_size=page_size,
        total=total,
        items=items,
        summary_cards=payload.get("summary_cards", []),
        charts=payload.get("charts", []),
    )


@router.get(
    "/translation-logs",
    response_model=AdminTranslationLogsResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_translation_logs(
    user_email: str = "",
    task_id: str = "",
    lesson_id: str = "",
    success: str = "",
    page: int = 1,
    page_size: int = 20,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    page = max(page, 1)
    page_size = max(1, min(page_size, 100))
    normalized_lesson_id, parse_error = _parse_optional_lesson_id(lesson_id)
    if parse_error is not None:
        return parse_error
    normalized_date_from = to_shanghai_naive(date_from)
    normalized_date_to = to_shanghai_naive(date_to)
    logger.debug(
        "[DEBUG] /api/admin/translation-logs normalized filters date_from=%s date_to=%s task_id=%s lesson_id=%s success=%s",
        normalized_date_from.isoformat() if normalized_date_from else "",
        normalized_date_to.isoformat() if normalized_date_to else "",
        task_id,
        lesson_id,
        success,
    )

    payload = list_translation_request_rows(
        db,
        user_email=user_email,
        task_id=task_id,
        lesson_id=normalized_lesson_id,
        success=success,
        page=page,
        page_size=page_size,
        date_from=normalized_date_from,
        date_to=normalized_date_to,
    )
    total = int(payload["total"])
    rows = payload["rows"]
    items = [
        AdminTranslationLogItem(
            id=row.id,
            user_email=email or "-",
            task_id=row.task_id,
            lesson_id=row.lesson_id,
            sentence_idx=int(row.sentence_idx),
            attempt_no=int(row.attempt_no),
            provider=row.provider,
            model_name=row.model_name,
            base_url=row.base_url,
            input_text_preview=row.input_text_preview,
            provider_request_id=row.provider_request_id,
            status_code=row.status_code,
            finish_reason=row.finish_reason,
            prompt_tokens=int(row.prompt_tokens),
            completion_tokens=int(row.completion_tokens),
            total_tokens=int(row.total_tokens),
            success=bool(row.success),
            error_code=row.error_code,
            error_message=row.error_message,
            started_at=to_shanghai_aware(row.started_at),
            finished_at=to_shanghai_aware(row.finished_at),
            created_at=to_shanghai_aware(row.created_at),
        )
        for row, email in rows
    ]
    return AdminTranslationLogsResponse(
        ok=True,
        page=page,
        page_size=page_size,
        total=total,
        items=items,
        summary_cards=payload.get("summary_cards", []),
        charts=payload.get("charts", []),
    )


@router.get(
    "/billing-rates",
    response_model=AdminBillingRatesResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_billing_rates(db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    ensure_default_billing_rates(db)
    enforce_mt_flash_only_rates(db)
    rates = list_admin_rates(db)
    return AdminBillingRatesResponse(ok=True, rates=[to_rate_item(item) for item in rates])


@router.get(
    "/runtime-readiness",
    response_model=AdminRuntimeReadinessResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_runtime_readiness(_: User = Depends(get_admin_user)):
    descriptors = {
        str(item.get("model_key") or "").strip(): item
        for item in list_asr_models_with_status()
    }
    items = []
    for meta in _ADMIN_RUNTIME_READINESS_MODELS:
        descriptor = descriptors.get(meta["model_key"], {})
        items.append(
            AdminRuntimeReadinessItem(
                model_key=meta["model_key"],
                display_name=str(descriptor.get("display_name") or meta["display_name"]),
                runtime_kind=meta["runtime_kind"],
                status=str(descriptor.get("status") or "unsupported"),
                available=bool(descriptor.get("available")),
                message=str(descriptor.get("message") or "未返回运行状态。"),
                actions=list(descriptor.get("actions") or []),
            )
        )
    return AdminRuntimeReadinessResponse(ok=True, items=items)


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
    normalized_model_name = (model_name or "").strip().lower()
    if normalized_model_name.startswith("qwen-mt-") and normalized_model_name != "qwen-mt-flash":
        return error_response(400, "MT_MODEL_DEPRECATED", "翻译模型仅支持 qwen-mt-flash", model_name)
    ensure_default_billing_rates(db)
    enforce_mt_flash_only_rates(db)
    managed_model_names = {
        str(item.model_name or "").strip().lower()
        for item in list_admin_rates(db)
    }
    if normalized_model_name not in managed_model_names:
        return error_response(400, "BILLING_RATE_NOT_MANAGEABLE", "该模型不在后台可维护范围内", model_name)
    rate = db.get(BillingModelRate, model_name)
    if not rate:
        return error_response(404, "BILLING_RATE_NOT_FOUND", "计费模型不存在", model_name)
    if payload.price_per_minute_yuan < 0 or payload.cost_per_minute_yuan < 0:
        return error_response(400, "INVALID_BILLING_RATE", "分钟售价和分钟成本不能为负数")
    if payload.points_per_1k_tokens < 0:
        return error_response(400, "INVALID_BILLING_RATE", "1k Tokens 费率不能为负数")
    normalized_unit = payload.billing_unit.strip().lower()
    if normalized_unit not in {"minute", "1k_tokens"}:
        return error_response(400, "INVALID_BILLING_UNIT", "计费单位仅支持 minute 或 1k_tokens", payload.billing_unit)
    expected_unit = "1k_tokens" if normalized_model_name == "qwen-mt-flash" else "minute"
    if normalized_unit != expected_unit:
        return error_response(400, "INVALID_BILLING_UNIT", f"模型 {model_name} 仅支持 {expected_unit} 计费", payload.billing_unit)
    if expected_unit == "minute":
        price_per_minute_yuan = normalize_rate_yuan(payload.price_per_minute_yuan)
        cost_per_minute_yuan = normalize_rate_yuan(payload.cost_per_minute_yuan)
    else:
        price_per_minute_yuan = normalize_rate_yuan(0)
        # MT continues to charge by token, while this compatibility field stores
        # the admin-only reference cost in yuan / 1k tokens.
        cost_per_minute_yuan = normalize_rate_yuan(payload.cost_per_minute_yuan)
    rate.price_per_minute_yuan = price_per_minute_yuan
    rate.price_per_minute_cents_legacy = yuan_to_compat_cents(price_per_minute_yuan)
    rate.points_per_1k_tokens = payload.points_per_1k_tokens if expected_unit == "1k_tokens" else 0
    rate.cost_per_minute_yuan = cost_per_minute_yuan
    rate.cost_per_minute_cents_legacy = yuan_to_compat_cents(cost_per_minute_yuan)
    rate.billing_unit = expected_unit
    rate.is_active = payload.is_active
    rate.updated_by_user_id = current_admin.id
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return AdminBillingRatesResponse(ok=True, rates=[to_rate_item(rate)])


@router.get(
    "/subtitle-settings",
    response_model=AdminSubtitleSettingsResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_get_subtitle_settings(db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    settings = get_subtitle_settings(db)
    updated_by_user_email = None
    if settings.updated_by_user_id:
        updated_by_user = db.get(User, settings.updated_by_user_id)
        updated_by_user_email = updated_by_user.email if updated_by_user is not None else None
    return AdminSubtitleSettingsResponse(ok=True, settings=_subtitle_settings_item_with_meta(settings, updated_by_user_email=updated_by_user_email))


@router.get(
    "/subtitle-settings/history",
    response_model=AdminSubtitleSettingsHistoryResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_get_subtitle_settings_history(db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    settings = get_subtitle_settings(db)
    updated_by_user_email = None
    if settings.updated_by_user_id:
        updated_by_user = db.get(User, settings.updated_by_user_id)
        updated_by_user_email = updated_by_user.email if updated_by_user is not None else None
    return AdminSubtitleSettingsHistoryResponse(
        ok=True,
        current=_subtitle_settings_item_with_meta(settings, updated_by_user_email=updated_by_user_email),
        rollback_candidate=_load_subtitle_settings_rollback_candidate(db),
    )


@router.put(
    "/subtitle-settings",
    response_model=AdminSubtitleSettingsResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_update_subtitle_settings(
    payload: AdminSubtitleSettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    settings = get_subtitle_settings(db)
    normalized_default_asr_model = payload.default_asr_model.strip() or str(getattr(settings, "default_asr_model", "") or LESSON_DEFAULT_ASR_MODEL)
    available_asr_models = {
        str(item.model_name or "").strip()
        for item in list_admin_rates(db)
        if str(getattr(item, "billing_unit", "minute") or "minute") == "minute"
    }
    if normalized_default_asr_model not in available_asr_models:
        return error_response(400, "INVALID_DEFAULT_ASR_MODEL", "默认 ASR 模型不在当前可用模型列表内", normalized_default_asr_model)
    before = to_admin_subtitle_settings_item(settings).model_dump(mode="json")
    settings.semantic_split_default_enabled = payload.semantic_split_default_enabled
    settings.default_asr_model = normalized_default_asr_model
    settings.subtitle_split_enabled = payload.subtitle_split_enabled
    settings.subtitle_split_target_words = payload.subtitle_split_target_words
    settings.subtitle_split_max_words = payload.subtitle_split_max_words
    settings.semantic_split_max_words_threshold = payload.semantic_split_max_words_threshold
    settings.semantic_split_timeout_seconds = payload.semantic_split_timeout_seconds
    if payload.translation_batch_max_chars is not None:
        settings.translation_batch_max_chars = payload.translation_batch_max_chars
    settings.updated_by_user_id = current_admin.id
    db.add(settings)
    db.flush()
    append_admin_operation_log(
        db,
        operator_user_id=current_admin.id,
        action_type="subtitle_settings_update",
        target_type="subtitle_settings",
        target_id=str(getattr(settings, "id", 1)),
        before_value=before,
        after_value=to_admin_subtitle_settings_item(settings).model_dump(mode="json"),
        note="subtitle_settings",
    )
    db.commit()
    db.refresh(settings)
    return AdminSubtitleSettingsResponse(ok=True, settings=_subtitle_settings_item_with_meta(settings, updated_by_user_email=current_admin.email))


@router.post(
    "/subtitle-settings/rollback-last",
    response_model=AdminSubtitleSettingsResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_rollback_subtitle_settings_last(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    rollback_candidate = _load_subtitle_settings_rollback_candidate(db)
    if rollback_candidate is None:
        return error_response(400, "SUBTITLE_SETTINGS_ROLLBACK_EMPTY", "暂无可回滚的上一版本")

    settings = get_subtitle_settings(db)
    before = _subtitle_settings_item_with_meta(settings).model_dump(mode="json")
    previous = rollback_candidate.settings
    settings.semantic_split_default_enabled = previous.semantic_split_default_enabled
    settings.default_asr_model = previous.default_asr_model
    settings.subtitle_split_enabled = previous.subtitle_split_enabled
    settings.subtitle_split_target_words = previous.subtitle_split_target_words
    settings.subtitle_split_max_words = previous.subtitle_split_max_words
    settings.semantic_split_max_words_threshold = previous.semantic_split_max_words_threshold
    settings.semantic_split_timeout_seconds = previous.semantic_split_timeout_seconds
    settings.translation_batch_max_chars = previous.translation_batch_max_chars
    settings.updated_by_user_id = current_admin.id
    db.add(settings)
    db.flush()
    append_admin_operation_log(
        db,
        operator_user_id=current_admin.id,
        action_type="subtitle_settings_rollback",
        target_type="subtitle_settings",
        target_id=str(getattr(settings, "id", 1)),
        before_value=before,
        after_value=_subtitle_settings_item_with_meta(settings, updated_by_user_email=current_admin.email).model_dump(mode="json"),
        note=f"subtitle_settings_rollback_from:{rollback_candidate.action_id}",
    )
    db.commit()
    db.refresh(settings)
    return AdminSubtitleSettingsResponse(ok=True, settings=_subtitle_settings_item_with_meta(settings, updated_by_user_email=current_admin.email))


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
    protection_error = _require_export_protection_ready()
    if protection_error is not None:
        return protection_error
    if payload.confirm_text.strip() != _export_confirm_text().strip():
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
    protection_error = _require_export_protection_ready()
    if protection_error is not None:
        return protection_error
    if payload.confirm_text.strip() != _export_confirm_text().strip():
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


router.include_router(announcement_router)
