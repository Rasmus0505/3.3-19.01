from __future__ import annotations

import logging
import os
import re
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from functools import lru_cache

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError, ProgrammingError

from app.api.routers import admin, admin_console, admin_sql_console, asr_models, asr_models_router, auth, billing, lessons, lessons_router, media, practice, transcribe, wallet
from app.api.routers.dashscope_upload import router as dashscope_upload_router
from app.api.routers.local_asr_assets import router as local_asr_assets_router
from app.api.routers.lessons.cloud_transcribe import router as cloud_transcribe_router
from app.core.config import (
    BASE_DATA_DIR,
    BASE_TMP_DIR,
    DASHSCOPE_API_KEY,
    PERSISTENT_DATA_DIR,
    SERVICE_NAME,
    STATIC_DIR,
    get_app_environment,
    get_redeem_code_export_confirm_text,
    is_production_environment,
    is_weak_confirm_text,
)
from app.core.errors import error_response
from app.core.logging import setup_logging
from app.db import BUSINESS_TABLES, DATABASE_URL, SessionLocal, engine, schema_name_for_url
from app.models import LessonGenerationTask
from app.services.admin_bootstrap import ensure_admin_users
from app.services.asr_dashscope import setup_dashscope
from app.services.asr_model_registry import list_asr_models_with_status
from app.services.billing_service import ensure_default_billing_rates
from app.services.media import get_media_runtime_status
from app.services.user_activity import ensure_user_activity_schema


setup_logging()
logger = logging.getLogger(__name__)


LESSON_TASK_REQUIRED_COLUMNS: tuple[str, ...] = tuple(str(column.name) for column in LessonGenerationTask.__table__.columns)


READINESS_REQUIRED_COLUMNS: dict[str, tuple[str, ...]] = {
    "users": ("is_admin", "last_login_at", "username", "username_normalized"),
    "user_login_events": (
        "user_id",
        "event_type",
        "created_at",
    ),
    "wordbook_entries": (
        "next_review_at",
        "last_reviewed_at",
        "review_count",
        "wrong_count",
        "memory_score",
    ),
    "billing_model_rates": (
        "billing_unit",
        "points_per_1k_tokens",
        "cost_per_minute_cents",
        "price_per_minute_yuan",
        "cost_per_minute_yuan",
        "parallel_enabled",
        "parallel_threshold_seconds",
        "segment_seconds",
        "max_concurrency",
    ),
    "translation_request_logs": (
        "trace_id",
        "task_id",
        "lesson_id",
        "user_id",
        "sentence_idx",
        "attempt_no",
        "provider",
        "model_name",
        "base_url",
        "input_text_preview",
        "provider_request_id",
        "status_code",
        "finish_reason",
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
        "success",
        "error_code",
        "error_message",
        "raw_request_text",
        "raw_response_text",
        "raw_error_text",
        "started_at",
        "finished_at",
        "created_at",
    ),
    "subtitle_settings": (
        "semantic_split_default_enabled",
        "default_asr_model",
        "subtitle_split_enabled",
        "subtitle_split_target_words",
        "subtitle_split_max_words",
        "semantic_split_max_words_threshold",
        "semantic_split_timeout_seconds",
        "translation_batch_max_chars",
    ),
    "lesson_generation_tasks": LESSON_TASK_REQUIRED_COLUMNS,
}

HTML_NO_STORE_HEADERS: dict[str, str] = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}


@dataclass
class RuntimeStatus:
    db_ready: bool = False
    db_error: str = ""
    environment: str = "development"
    production_mode: bool = False
    database_url_scheme: str = ""
    database_policy_ok: bool = True
    database_policy_error: str = ""
    export_guard_ok: bool = True
    export_guard_error: str = ""
    dashscope_configured: bool = False
    ffmpeg_ready: bool = False
    ffprobe_ready: bool = False
    media_detail: str = ""
    upload_asr_ready: bool = False
    upload_asr_detail: str = ""
    admin_bootstrap_ok: bool = False
    admin_bootstrap_error: str = ""
    checked_at: str = ""
    readiness_issues: list[str] = field(default_factory=list)


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_runtime_status(app: FastAPI) -> RuntimeStatus:
    status = getattr(app.state, "runtime_status", None)
    if status is None:
        status = RuntimeStatus()
        app.state.runtime_status = status
    return status


def _database_url_scheme() -> str:
    normalized = str(DATABASE_URL or "").strip().lower()
    if normalized.startswith("postgresql"):
        return "postgresql"
    if normalized.startswith("mysql"):
        return "mysql"
    if normalized.startswith("sqlite"):
        return "sqlite"
    return normalized.split(":", 1)[0] if ":" in normalized else (normalized or "unknown")


def _database_policy_status() -> tuple[bool, str]:
    if not is_production_environment():
        return True, ""
    if not str(DATABASE_URL or "").strip():
        return False, "production requires DATABASE_URL"
    if _database_url_scheme() == "sqlite":
        return False, "production requires an external PostgreSQL or MySQL database"
    return True, ""


def _export_guard_policy_status() -> tuple[bool, str]:
    if not is_production_environment():
        return True, ""
    if is_weak_confirm_text(get_redeem_code_export_confirm_text()):
        return False, "production requires a strong REDEEM_CODE_EXPORT_CONFIRM_TEXT"
    return True, ""


def _probe_database_ready() -> tuple[bool, str]:
    try:
        schema = schema_name_for_url(DATABASE_URL)
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            inspector = inspect(connection)
            missing_tables = [table_name for table_name in BUSINESS_TABLES if not inspector.has_table(table_name, schema=schema)]
            missing_columns = _find_missing_required_columns(inspector, schema)
        if missing_tables:
            logger.warning("[DEBUG] readiness.missing_tables count=%s detail=%s", len(missing_tables), ",".join(missing_tables))
            return False, f"missing business tables: {', '.join(missing_tables)}"
        if missing_columns:
            logger.warning("[DEBUG] readiness.missing_columns count=%s detail=%s", len(missing_columns), ",".join(missing_columns))
            return False, f"missing critical columns: {', '.join(missing_columns)}"
        return True, ""
    except Exception as exc:
        logger.exception("[DEBUG] readiness.exception detail=%s", str(exc)[:400])
        return False, str(exc)[:1200]


def _find_missing_required_columns(db_inspector, schema: str | None) -> list[str]:
    missing: list[str] = []
    for table_name, required_columns in READINESS_REQUIRED_COLUMNS.items():
        if not db_inspector.has_table(table_name, schema=schema):
            continue
        available_columns = {col.get("name") for col in db_inspector.get_columns(table_name, schema=schema)}
        for column_name in required_columns:
            if column_name not in available_columns:
                missing.append(f"{table_name}.{column_name}")
    return missing


def _bootstrap_admin_users() -> tuple[bool, str]:
    try:
        db = SessionLocal()
        try:
            ensure_admin_users(db)
        finally:
            db.close()
        return True, ""
    except Exception as exc:
        logger.exception("[DEBUG] startup.admin_bootstrap failed")
        return False, str(exc)[:1200]


def _build_upload_asr_runtime_status() -> tuple[bool, str]:
    try:
        model_statuses = list_asr_models_with_status()
    except Exception as exc:
        detail = f"failed to evaluate upload ASR readiness: {str(exc)[:400]}"
        logger.warning("[DEBUG] readiness.upload_asr.exception detail=%s", detail)
        return False, detail

    ready_models: list[str] = []
    blocked_models: list[str] = []
    for item in model_statuses:
        if not bool(item.get("supports_upload")):
            continue
        display_name = str(item.get("display_name") or item.get("model_key") or "").strip() or "unknown"
        status = str(item.get("status") or "").strip().lower() or "unknown"
        if bool(item.get("available")):
            ready_models.append(display_name)
        else:
            blocked_models.append(f"{display_name}={status}")

    if ready_models:
        return True, f"ready upload ASR models: {', '.join(ready_models)}"

    detail = "no upload-capable ASR model is ready"
    if blocked_models:
        detail = f"{detail} ({'; '.join(blocked_models)})"
    return False, detail


def _refresh_optional_runtime_status(app: FastAPI) -> None:
    runtime_status = _ensure_runtime_status(app)
    runtime_status.checked_at = _utc_iso()
    runtime_status.environment = get_app_environment()
    runtime_status.production_mode = is_production_environment()
    runtime_status.database_url_scheme = _database_url_scheme()
    runtime_status.database_policy_ok, runtime_status.database_policy_error = _database_policy_status()
    runtime_status.export_guard_ok, runtime_status.export_guard_error = _export_guard_policy_status()
    runtime_status.dashscope_configured = bool(DASHSCOPE_API_KEY)

    if runtime_status.dashscope_configured:
        try:
            setup_dashscope(DASHSCOPE_API_KEY)
            logger.info("[DEBUG] startup.dashscope configured")
        except Exception as exc:
            runtime_status.dashscope_configured = False
            logger.warning("[DEBUG] startup.dashscope setup failed detail=%s", str(exc)[:400])
    else:
        logger.warning("[DEBUG] startup.dashscope missing DASHSCOPE_API_KEY; ASR endpoints may fail")

    media_status = get_media_runtime_status()
    runtime_status.ffmpeg_ready = bool(media_status["ffmpeg_ready"])
    runtime_status.ffprobe_ready = bool(media_status["ffprobe_ready"])
    runtime_status.media_detail = str(media_status["detail"] or "")
    runtime_status.upload_asr_ready, runtime_status.upload_asr_detail = _build_upload_asr_runtime_status()


def _build_runtime_readiness_issues(runtime_status: RuntimeStatus) -> list[str]:
    issues: list[str] = []
    if runtime_status.production_mode and not runtime_status.database_policy_ok:
        issues.append(runtime_status.database_policy_error or "database policy is not satisfied")
    if runtime_status.production_mode and not runtime_status.export_guard_ok:
        issues.append(runtime_status.export_guard_error or "export guard policy is not satisfied")
    if not runtime_status.db_ready:
        issues.append(runtime_status.db_error or "database is not ready")
    if not runtime_status.dashscope_configured:
        issues.append("DASHSCOPE_API_KEY is not configured")
    if not runtime_status.ffmpeg_ready or not runtime_status.ffprobe_ready:
        issues.append(runtime_status.media_detail or "ffmpeg / ffprobe are not ready")
    if not runtime_status.upload_asr_ready:
        issues.append(runtime_status.upload_asr_detail or "no upload-capable ASR model is ready")
    return issues


def _update_runtime_readiness(runtime_status: RuntimeStatus) -> bool:
    runtime_status.readiness_issues = _build_runtime_readiness_issues(runtime_status)
    return not runtime_status.readiness_issues


def _is_schema_migration_related_error(detail: str) -> bool:
    normalized = str(detail or "").strip().lower()
    if not normalized:
        return False
    markers = (
        "missing business table",
        "missing business tables",
        "missing critical columns",
        "no such table",
        "no such column",
        "undefined table",
        "undefined column",
        "does not exist",
        "unknown column",
    )
    return any(marker in normalized for marker in markers)


def _build_database_not_ready_response(runtime_status: RuntimeStatus) -> JSONResponse:
    detail = str(runtime_status.db_error or "").strip()
    if _is_schema_migration_related_error(detail):
        return error_response(
            503,
            "DB_MIGRATION_REQUIRED",
            "数据库迁移未完成，请先执行生产迁移",
            detail or "请先执行 Alembic upgrade head",
        )
    return error_response(
        503,
        "DATABASE_NOT_READY",
        "数据库未就绪，请稍后重试",
        detail or "database readiness check failed",
    )


async def _bootstrap_runtime_state(app: FastAPI) -> None:
    runtime_status = _ensure_runtime_status(app)
    db = SessionLocal()
    try:
        ensure_user_activity_schema(db)
        ensure_default_billing_rates(db)
    finally:
        db.close()
    ready, error = _probe_database_ready()
    runtime_status.db_ready = ready
    runtime_status.db_error = error
    runtime_status.checked_at = _utc_iso()
    if ready:
        logger.info("[DEBUG] startup.db ready")
        admin_ok, admin_error = _bootstrap_admin_users()
        runtime_status.admin_bootstrap_ok = admin_ok
        runtime_status.admin_bootstrap_error = admin_error
        if admin_ok:
            logger.info("[DEBUG] startup.admin_bootstrap ready")
        return
    logger.warning("[DEBUG] startup.db unavailable detail=%s", error)


def _runtime_status_payload(runtime_status: RuntimeStatus) -> dict:
    return asdict(runtime_status)


def _enforce_runtime_security_policies(app: FastAPI) -> None:
    runtime_status = _ensure_runtime_status(app)
    blocking_errors: list[str] = []
    if runtime_status.production_mode and not runtime_status.database_policy_ok:
        blocking_errors.append(runtime_status.database_policy_error)
    if runtime_status.production_mode and not runtime_status.export_guard_ok:
        blocking_errors.append(runtime_status.export_guard_error)
    if blocking_errors:
        raise RuntimeError("; ".join(error for error in blocking_errors if error))


@lru_cache(maxsize=1)
def _read_frontend_build_marker() -> str:
    index_path = STATIC_DIR / "index.html"
    try:
        html = index_path.read_text(encoding="utf-8")
    except Exception:
        return ""

    match = re.search(r'/static/assets/([^"\']+)', html)
    return str(match.group(1)).strip() if match else ""


def _spa_shell_response() -> FileResponse:
    response = FileResponse(STATIC_DIR / "index.html", headers=HTML_NO_STORE_HEADERS)
    build_marker = _read_frontend_build_marker()
    if build_marker:
        response.headers["X-Frontend-Build"] = build_marker
    return response


def _trim_text(value: object) -> str:
    return str(value or "").strip()


def _normalize_desktop_client_version(value: object) -> str:
    return _trim_text(value).lstrip("vV")


def _build_desktop_client_default_download_url(request: Request) -> str:
    return f"{str(request.base_url).rstrip('/')}/download/desktop"


def _get_desktop_client_release_payload(request: Request) -> dict[str, object]:
    requested_version = _normalize_desktop_client_version(request.headers.get("x-bottle-client-version", ""))
    configured_version = _normalize_desktop_client_version(
        os.getenv("DESKTOP_CLIENT_LATEST_VERSION") or os.getenv("DESKTOP_CLIENT_VERSION") or ""
    )
    configured_entry_url = _trim_text(
        os.getenv("DESKTOP_CLIENT_ENTRY_URL")
        or os.getenv("DESKTOP_CLIENT_DOWNLOAD_URL")
        or os.getenv("DESKTOP_CLIENT_UPDATE_ENTRY_URL")
        or os.getenv("DESKTOP_CLIENT_UPDATE_DOWNLOAD_URL")
    )
    configured_release_name = _trim_text(
        os.getenv("DESKTOP_CLIENT_RELEASE_NAME") or os.getenv("DESKTOP_CLIENT_VERSION_NAME") or ""
    )
    configured_release_notes = _trim_text(
        os.getenv("DESKTOP_CLIENT_RELEASE_NOTES") or os.getenv("DESKTOP_CLIENT_CHANGELOG") or ""
    )
    configured_published_at = _trim_text(
        os.getenv("DESKTOP_CLIENT_PUBLISHED_AT") or os.getenv("DESKTOP_CLIENT_RELEASED_AT") or ""
    )
    metadata_url = f"{str(request.base_url).rstrip('/')}/desktop/client/latest.json"
    entry_url = configured_entry_url or _build_desktop_client_default_download_url(request)
    latest_version = configured_version or requested_version or "0.0.0"
    release_notes = configured_release_notes or (
        "尚未在服务端配置正式桌面客户端发布信息；发布新客户端后请设置 "
        "DESKTOP_CLIENT_LATEST_VERSION 与 DESKTOP_CLIENT_ENTRY_URL。"
    )
    return {
        "latestVersion": latest_version,
        "entryUrl": entry_url,
        "releaseNotes": release_notes,
        "releaseName": configured_release_name or (f"Bottle Desktop {latest_version}" if configured_version else "Bottle Desktop"),
        "publishedAt": configured_published_at,
        "metadataUrl": metadata_url,
        "configured": bool(configured_version),
        "requestedVersion": requested_version,
    }


def _is_spa_fallback_path(full_path: str) -> bool:
    normalized_path = str(full_path or "").strip().lstrip("/")
    if not normalized_path:
        return True

    root_segment = normalized_path.split("/", 1)[0].lower()
    if root_segment in {"api", "health", "static"}:
        return False
    if normalized_path.lower() == "favicon.ico":
        return False

    last_segment = normalized_path.rsplit("/", 1)[-1]
    return "." not in last_segment


@asynccontextmanager
async def app_lifespan(app: FastAPI):
    runtime_status = _ensure_runtime_status(app)
    logger.info("[DEBUG] startup.begin")
    BASE_TMP_DIR.mkdir(parents=True, exist_ok=True)
    BASE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    PERSISTENT_DATA_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(
        "[DEBUG] startup.paths tmp_dir=%s tmp_data_dir=%s persistent_data_dir=%s",
        BASE_TMP_DIR,
        BASE_DATA_DIR,
        PERSISTENT_DATA_DIR,
    )
    _refresh_optional_runtime_status(app)
    _enforce_runtime_security_policies(app)
    await _bootstrap_runtime_state(app)
    if _update_runtime_readiness(runtime_status):
        logger.info("[DEBUG] startup.ready")
    else:
        logger.warning("[DEBUG] startup.degraded issues=%s", runtime_status.readiness_issues)
    yield


def create_app(*, enable_lifespan: bool = True) -> FastAPI:
    app = FastAPI(title=SERVICE_NAME, version="0.3.0", lifespan=app_lifespan if enable_lifespan else None)
    app.state.runtime_status = RuntimeStatus()
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    @app.middleware("http")
    async def block_api_requests_when_database_not_ready(request: Request, call_next):
        runtime_status = _ensure_runtime_status(app)
        path = request.url.path
        if path.startswith("/api/") and runtime_status.checked_at and not runtime_status.db_ready:
            return _build_database_not_ready_response(runtime_status)
        return await call_next(request)

    @app.exception_handler(OperationalError)
    @app.exception_handler(ProgrammingError)
    async def handle_database_programming_errors(_request: Request, exc: Exception):
        detail = str(exc)[:1200]
        if _is_schema_migration_related_error(detail):
            logger.warning("[DEBUG] db.schema_error detail=%s", detail[:400])
            return error_response(
                503,
                "DB_MIGRATION_REQUIRED",
                "数据库迁移未完成，请先执行生产迁移",
                detail,
            )
        logger.exception("[DEBUG] db.unhandled_programming_error detail=%s", detail[:400])
        return error_response(500, "DATABASE_ERROR", "数据库操作失败", detail)

    @app.get("/", include_in_schema=False)
    def root_page() -> FileResponse:
        return _spa_shell_response()

    @app.get("/admin", include_in_schema=False)
    @app.get("/admin/{full_path:path}", include_in_schema=False)
    def admin_page(full_path: str = "") -> FileResponse:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        return _spa_shell_response()

    @app.get("/favicon.ico", include_in_schema=False)
    def favicon():
        icon_path = STATIC_DIR / "favicon.ico"
        if icon_path.exists():
            return FileResponse(icon_path)
        return Response(status_code=204)

    @app.get("/desktop/client/latest.json", include_in_schema=False)
    def desktop_client_latest(request: Request) -> dict[str, object]:
        return _get_desktop_client_release_payload(request)

    @app.get("/desktop-client-version.json", include_in_schema=False)
    def desktop_client_latest_legacy(request: Request) -> dict[str, object]:
        # Keep legacy packaged clients working while runtime-config.mjs uses the newer nested route.
        return _get_desktop_client_release_payload(request)

    @app.get("/download/desktop", include_in_schema=False)
    def desktop_client_download(request: Request):
        payload = _get_desktop_client_release_payload(request)
        entry_url = _trim_text(payload.get("entryUrl"))
        current_url = str(request.url).strip()
        if entry_url and entry_url != current_url:
            return RedirectResponse(entry_url, status_code=307)
        body = [
            "<html><head><meta charset='utf-8'><title>Bottle Desktop Download</title></head><body>",
            "<h1>Bottle Desktop 下载入口未单独配置</h1>",
            "<p>请在部署环境中设置 <code>DESKTOP_CLIENT_ENTRY_URL</code> 指向当前桌面安装包或发布页。</p>",
            f"<p>当前最新版本：<code>{payload['latestVersion']}</code></p>",
            f"<p>元数据地址：<code>{payload['metadataUrl']}</code></p>",
            "</body></html>",
        ]
        return Response(content="".join(body), media_type="text/html; charset=utf-8")

    @app.get("/health")
    def health() -> dict:
        runtime_status = _ensure_runtime_status(app)
        ready = _update_runtime_readiness(runtime_status)
        return {
            "ok": True,
            "service": SERVICE_NAME,
            "ready": ready,
        }

    @app.get("/health/ready")
    def health_ready():
        runtime_status = _ensure_runtime_status(app)
        _refresh_optional_runtime_status(app)
        ready, error = _probe_database_ready()
        runtime_status.db_ready = ready
        runtime_status.db_error = error
        runtime_status.checked_at = _utc_iso()
        ready = _update_runtime_readiness(runtime_status)
        payload = {
            "ok": ready,
            "service": SERVICE_NAME,
            "status": _runtime_status_payload(runtime_status),
        }
        if ready:
            return payload
        return JSONResponse(status_code=503, content=payload)

    app.include_router(auth)
    app.include_router(wallet)
    app.include_router(billing)
    app.include_router(admin)
    app.include_router(admin_console)
    app.include_router(admin_sql_console)
    app.include_router(transcribe)
    app.include_router(lessons_router)
    app.include_router(cloud_transcribe_router)
    app.include_router(dashscope_upload_router)
    app.include_router(asr_models_router)
    app.include_router(local_asr_assets_router)
    app.include_router(practice)
    app.include_router(media)

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback_page(full_path: str) -> FileResponse:
        if not _is_spa_fallback_path(full_path):
            raise HTTPException(status_code=404, detail="Not Found")
        logger.info("[DEBUG] spa.fallback path=%s", full_path or "/")
        return _spa_shell_response()

    return app


app = create_app()
