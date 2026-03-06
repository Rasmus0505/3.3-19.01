from __future__ import annotations

import os

from sqlalchemy.orm import Session

from app.db.base import Base, is_sqlite_url
from app.db.session import DATABASE_URL, engine


DB_INIT_MODE = os.getenv("DB_INIT_MODE", "auto").strip().lower()


def init_db() -> None:
    from app import models  # noqa: F401
    from app.services.billing_service import ensure_default_billing_rates

    mode = DB_INIT_MODE
    if mode == "skip":
        return

    should_create = mode == "create_all" or (mode == "auto" and is_sqlite_url(DATABASE_URL))
    if not should_create:
        return

    Base.metadata.create_all(bind=engine)
    with Session(bind=engine, future=True) as db:
        ensure_default_billing_rates(db)
