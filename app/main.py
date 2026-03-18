from __future__ import annotations

import logging
import re
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from app.api.routers import admin, admin_console, auth, billing, lessons, local_asr_assets, local_whisper_assets, local_whisper_browser_assets, media, practice, transcribe, wallet
from app.core.config import BASE_DATA_DIR, BASE_TMP_DIR, DASHSCOPE_API_KEY, PERSISTENT_DATA_DIR, SERVICE_NAME, STATIC_DIR, WHISPER_MIRROR_ROOT
from app.core.logging import setup_logging
from app.db import BUSINESS_TABLES, DATABASE_URL, SessionLocal, engine, schema_name_for_url
from app.models import LessonGenerationTask
from app.services.admin_bootstrap import ensure_admin_users
from app.services.asr_dashscope import setup_dashscope
from app.services.media import get_media_runtime_status
from app.services.user_activity import ensure_user_activity_schema


setup_logging()
logger = logging.getLogger(__name__)


LESSON_TASK_REQUIRED_COLUMNS: tuple[str, ...] = tuple(str(column.name) for column in LessonGenerationTask.__table__.columns)


READINESS_REQUIRED_COLUMNS: dict[str, tuple[str, ...]] = {
    "users": ("last_login_at",),
    "user_login_events": (
        "user_id",
        "event_type",
        "created_at",
    ),
    "billing_model_rates": (
        "billing_unit",
        "points_per_1k_tokens",
        "cost_per_minute_cents",
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
        "provider_request_id",
        "status_code",
        "finish_reason",
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
        "success",
        "error_code",
        "error_message",
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
    "sensevoice_settings": (
        "model_dir",
        "trust_remote_code",
        "remote_code",
        "device",
        "language",
        "vad_model",
        "vad_max_single_segment_time",
        "use_itn",
        "batch_size_s",
        "merge_vad",
        "merge_length_s",
        "ban_emo_unk",
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
    dashscope_configured: bool = False
    ffmpeg_ready: bool = False
    ffprobe_ready: bool = False
    media_detail: str = ""
    admin_bootstrap_ok: bool = False
    admin_bootstrap_error: str = ""
    checked_at: str = ""


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_runtime_status(app: FastAPI) -> RuntimeStatus:
    status = getattr(app.state, "runtime_status", None)
    if status is None:
        status = RuntimeStatus()
        app.state.runtime_status = status
    return status


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


def _refresh_optional_runtime_status(app: FastAPI) -> None:
    runtime_status = _ensure_runtime_status(app)
    runtime_status.checked_at = _utc_iso()
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


async def _bootstrap_runtime_state(app: FastAPI) -> None:
    runtime_status = _ensure_runtime_status(app)
    db = SessionLocal()
    try:
        ensure_user_activity_schema(db)
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
    logger.info("[DEBUG] startup.begin")
    BASE_TMP_DIR.mkdir(parents=True, exist_ok=True)
    BASE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    PERSISTENT_DATA_DIR.mkdir(parents=True, exist_ok=True)
    WHISPER_MIRROR_ROOT.mkdir(parents=True, exist_ok=True)
    logger.info(
        "[DEBUG] startup.paths tmp_dir=%s tmp_data_dir=%s persistent_data_dir=%s whisper_cache_dir=%s",
        BASE_TMP_DIR,
        BASE_DATA_DIR,
        PERSISTENT_DATA_DIR,
        WHISPER_MIRROR_ROOT,
    )
    _refresh_optional_runtime_status(app)
    await _bootstrap_runtime_state(app)
    if local_asr_assets.schedule_local_asr_asset_prefetch():
        logger.info("[DEBUG] startup.local_asr_prefetch scheduled")
    else:
        logger.info("[DEBUG] startup.local_asr_prefetch skipped")
    if local_whisper_assets.schedule_local_whisper_asset_prefetch():
        logger.info("[DEBUG] startup.local_whisper_prefetch scheduled")
    else:
        logger.info("[DEBUG] startup.local_whisper_prefetch skipped")
    logger.info("[DEBUG] startup.ready")
    yield


def create_app(*, enable_lifespan: bool = True) -> FastAPI:
    app = FastAPI(title=SERVICE_NAME, version="0.3.0", lifespan=app_lifespan if enable_lifespan else None)
    app.state.runtime_status = RuntimeStatus()
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

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

    @app.get("/health")
    def health() -> dict:
        runtime_status = _ensure_runtime_status(app)
        return {
            "ok": True,
            "service": SERVICE_NAME,
            "ready": runtime_status.db_ready,
        }

    @app.get("/health/ready")
    def health_ready():
        runtime_status = _ensure_runtime_status(app)
        ready, error = _probe_database_ready()
        runtime_status.db_ready = ready
        runtime_status.db_error = error
        runtime_status.checked_at = _utc_iso()
        payload = {
            "ok": ready,
            "service": SERVICE_NAME,
            "status": _runtime_status_payload(runtime_status),
        }
        if ready:
            return payload
        return JSONResponse(status_code=503, content=payload)

    app.include_router(auth.router)
    app.include_router(wallet.router)
    app.include_router(billing.router)
    app.include_router(admin.router)
    app.include_router(admin_console.router)
    app.include_router(transcribe.router)
    app.include_router(lessons.router)
    app.include_router(practice.router)
    app.include_router(media.router)
    app.include_router(local_asr_assets.router)
    app.include_router(local_whisper_assets.router)
    app.include_router(local_whisper_browser_assets.router)

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback_page(full_path: str) -> FileResponse:
        if not _is_spa_fallback_path(full_path):
            raise HTTPException(status_code=404, detail="Not Found")
        logger.info("[DEBUG] spa.fallback path=%s", full_path or "/")
        return _spa_shell_response()

    return app


app = create_app()
