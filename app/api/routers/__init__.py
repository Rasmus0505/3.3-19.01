from __future__ import annotations

from app.api.routers.auth.router import router as auth
import app.api.routers.lessons.router as lessons
from app.api.routers.lessons.router import router as lessons_router
from app.api.routers.billing.router import router as billing
from app.api.routers.billing.wallet import router as wallet
# app/api/routers/admin/ (directory) shadows app/api/routers/admin.py (file).
# Use __import__ to bypass the package and load router.py directly from the sub-package.
from importlib import import_module as _imp
admin = _imp("app.api.routers.admin.router").router
del _imp
from app.api.routers.admin.console import router as admin_console
from app.api.routers.admin.sql_console import router as admin_sql_console
from app.api.routers.admin.announcements import router as admin_announcements
from app.api.routers.announcement_public import router as announcement_public
from app.api.routers.practice import router as practice
from app.api.routers.wordbook import router as wordbook
from app.api.routers.media import router as media
import app.api.routers.asr_models as asr_models
from app.api.routers.asr_models import router as asr_models_router
from app.api.routers.transcribe import router as transcribe
from app.api.routers.soe import router as soe


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
    "admin_announcements",
    "announcement_public",
    "lessons",
    "lessons_router",
    "practice",
    "media",
    "transcribe",
    "asr_models",
    "asr_models_router",
    "wordbook",
    "soe",
]
