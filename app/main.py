from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from app.api.routers import admin, auth, billing, lessons, media, practice, transcribe, wallet
from app.core.config import BASE_DATA_DIR, BASE_TMP_DIR, DASHSCOPE_API_KEY, SERVICE_NAME, STATIC_DIR
from app.core.logging import setup_logging
from app.db import BUSINESS_TABLES, DATABASE_URL, SessionLocal, engine, init_db, schema_name_for_url
from app.services.admin_bootstrap import ensure_admin_users
from app.services.asr_dashscope import setup_dashscope
from app.services.media import get_media_runtime_status


setup_logging()
logger = logging.getLogger(__name__)


READINESS_REQUIRED_COLUMNS: dict[str, tuple[str, ...]] = {
    "billing_model_rates": (
        "parallel_enabled",
        "parallel_threshold_seconds",
        "segment_seconds",
        "max_concurrency",
    )
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


def _read_positive_int_env(name: str, default: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except Exception:
        return default
    return value if value > 0 else default


def _read_positive_float_env(name: str, default: float) -> float:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = float(raw)
    except Exception:
        return default
    return value if value > 0 else default


def _ensure_runtime_status(app: FastAPI) -> RuntimeStatus:
    status = getattr(app.state, "runtime_status", None)
    if status is None:
        status = RuntimeStatus()
        app.state.runtime_status = status
    return status


def _probe_database_ready() -> tuple[bool, str]:
    try:
        init_db()
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
    retries = _read_positive_int_env("STARTUP_DB_MAX_RETRIES", 8)
    delay_seconds = _read_positive_float_env("STARTUP_DB_RETRY_DELAY_SECONDS", 2.0)

    for attempt in range(1, retries + 1):
        ready, error = _probe_database_ready()
        runtime_status.db_ready = ready
        runtime_status.db_error = error
        runtime_status.checked_at = _utc_iso()
        if ready:
            logger.info("[DEBUG] startup.db ready attempt=%s/%s", attempt, retries)
            admin_ok, admin_error = _bootstrap_admin_users()
            runtime_status.admin_bootstrap_ok = admin_ok
            runtime_status.admin_bootstrap_error = admin_error
            if admin_ok:
                logger.info("[DEBUG] startup.admin_bootstrap ready")
            return

        logger.warning("[DEBUG] startup.db unavailable attempt=%s/%s detail=%s", attempt, retries, error)
        if attempt < retries:
            await asyncio.sleep(delay_seconds)


def _runtime_status_payload(runtime_status: RuntimeStatus) -> dict:
    return asdict(runtime_status)


@asynccontextmanager
async def app_lifespan(app: FastAPI):
    logger.info("[DEBUG] startup.begin")
    BASE_TMP_DIR.mkdir(parents=True, exist_ok=True)
    BASE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    _refresh_optional_runtime_status(app)
    await _bootstrap_runtime_state(app)
    logger.info("[DEBUG] startup.ready")
    yield


def create_app(*, enable_lifespan: bool = True) -> FastAPI:
    app = FastAPI(title=SERVICE_NAME, version="0.3.0", lifespan=app_lifespan if enable_lifespan else None)
    app.state.runtime_status = RuntimeStatus()
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    @app.get("/", include_in_schema=False)
    def root_page() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/admin", include_in_schema=False)
    @app.get("/admin/{full_path:path}", include_in_schema=False)
    def admin_page(full_path: str = "") -> FileResponse:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        return FileResponse(STATIC_DIR / "index.html")

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
    app.include_router(transcribe.router)
    app.include_router(lessons.router)
    app.include_router(practice.router)
    app.include_router(media.router)
    return app


app = create_app()
