from __future__ import annotations

from app.api.routers.auth.router import router as auth
from app.api.routers.lessons.router import router as lessons
from app.api.routers.billing.router import router as billing
from app.api.routers.billing.wallet import router as wallet
from app.api.routers.admin.router import router as admin
from app.api.routers.admin.console import router as admin_console
from app.api.routers.admin.sql_console import router as admin_sql_console
from app.api.routers.practice import router as practice
from app.api.routers.wordbook import router as wordbook
from app.api.routers.media import router as media
from app.api.routers.asr_models import router as asr_models
from app.api.routers.transcribe import router as transcribe
from app.api.routers.desktop_asr import router as desktop_asr
from app.api.routers.local_asr_assets import router as local_asr_assets


def _attach_wordbook_routes() -> None:
    existing_paths = {getattr(route, "path", "") for route in practice.routes}
    for route in wordbook.routes:
        if getattr(route, "path", "") not in existing_paths:
            practice.routes.append(route)


_attach_wordbook_routes()

__all__ = [
    "auth",
    "wallet",
    "billing",
    "admin",
    "admin_console",
    "admin_sql_console",
    "lessons",
    "practice",
    "media",
    "transcribe",
    "local_asr_assets",
    "asr_models",
    "wordbook",
]
