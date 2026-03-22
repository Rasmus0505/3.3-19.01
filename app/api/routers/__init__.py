from app.api.routers import admin, admin_console, admin_sql_console, asr_models, auth, billing, lessons, local_asr_assets, media, practice, transcribe, wallet, wordbook


def _attach_wordbook_routes() -> None:
    existing_paths = {getattr(route, "path", "") for route in practice.router.routes}
    for route in wordbook.router.routes:
        if getattr(route, "path", "") not in existing_paths:
            practice.router.routes.append(route)


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
