from __future__ import annotations

import os

from app.db.base import Base
from app.db.session import DATABASE_URL, engine


# Priority: migrations in production, create_all fallback for local sqlite or explicit opt-in.
DB_INIT_MODE = os.getenv("DB_INIT_MODE", "auto").strip().lower()


def init_db() -> None:
    from app import models  # noqa: F401

    mode = DB_INIT_MODE
    if mode == "create_all":
        Base.metadata.create_all(bind=engine)
        return
    if mode == "skip":
        return
    if mode == "auto" and DATABASE_URL.startswith("sqlite"):
        Base.metadata.create_all(bind=engine)
