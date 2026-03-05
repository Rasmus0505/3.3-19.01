from __future__ import annotations

import shutil
import subprocess
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routers import admin, auth, billing, lessons, media, practice, transcribe, wallet
from app.core.config import BASE_DATA_DIR, BASE_TMP_DIR, DASHSCOPE_API_KEY, SERVICE_NAME, STATIC_DIR
from app.core.logging import setup_logging
from app.db import SessionLocal, init_db
from app.services.asr_dashscope import setup_dashscope
from app.services.admin_bootstrap import ensure_admin_users
from app.services.billing_service import ensure_default_billing_rates


setup_logging()


def _ensure_cmd_exists(cmd: str) -> None:
    if shutil.which(cmd) is None:
        raise RuntimeError(f"missing_dependency: `{cmd}` 未安装或不可执行")


def _ensure_ffmpeg_supports_libopus() -> None:
    try:
        proc = subprocess.run(
            ["ffmpeg", "-hide_banner", "-encoders"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except Exception as exc:
        raise RuntimeError(f"ffmpeg 检查失败: {exc}") from exc
    output = (proc.stdout or "") + "\n" + (proc.stderr or "")
    if "libopus" not in output:
        raise RuntimeError("missing_dependency: ffmpeg 未启用 libopus 编码器，请安装支持 libopus 的 ffmpeg")


@asynccontextmanager
async def app_lifespan(_: FastAPI):
    _ensure_cmd_exists("ffmpeg")
    _ensure_cmd_exists("ffprobe")
    _ensure_ffmpeg_supports_libopus()
    if not DASHSCOPE_API_KEY:
        raise RuntimeError("missing_env: `DASHSCOPE_API_KEY` 未配置")
    BASE_TMP_DIR.mkdir(parents=True, exist_ok=True)
    BASE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    setup_dashscope(DASHSCOPE_API_KEY)
    init_db()
    seed_db = SessionLocal()
    try:
        ensure_default_billing_rates(seed_db)
        ensure_admin_users(seed_db)
    finally:
        seed_db.close()
    yield


def create_app(*, enable_lifespan: bool = True) -> FastAPI:
    app = FastAPI(title=SERVICE_NAME, version="0.3.0", lifespan=app_lifespan if enable_lifespan else None)
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
        return {"ok": True, "service": SERVICE_NAME}

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
