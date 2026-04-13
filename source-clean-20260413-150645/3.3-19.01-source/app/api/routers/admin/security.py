from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_admin_user
from app.core.config import BASE_DATA_DIR, get_app_environment, is_production_environment, is_weak_confirm_text
from app.db import DATABASE_URL, get_db, is_sqlite_url
from app.models import User
from app.schemas import (
    AdminSecurityAdminStatus,
    AdminSecurityDatabaseStatus,
    AdminSecurityExportStatus,
    AdminSecurityMediaStatus,
    AdminSecuritySectionStatus,
    AdminSecurityStatusResponse,
    ErrorResponse,
)
from app.services.admin_bootstrap import count_admin_users, get_admin_bootstrap_status
from app.services.media import get_controlled_media_roots

from .shared import export_confirm_text


router = APIRouter(prefix="/api/admin", tags=["admin"])


def _role_runtime_mode() -> str:
    return "db_role"


def _build_security_status_payload(db: Session) -> AdminSecurityStatusResponse:
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

    confirm_text = export_confirm_text()
    export_strong = not is_weak_confirm_text(confirm_text)
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
            confirm_text_configured=bool(confirm_text),
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


@router.get(
    "/security/status",
    response_model=AdminSecurityStatusResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_security_status(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    return _build_security_status_payload(db)
