from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.core.timezone import now_shanghai_naive
from app.db import APP_SCHEMA
from app.models import User, UserLoginEvent


logger = logging.getLogger(__name__)


def _schema_name(db: Session) -> str | None:
    bind = db.get_bind()
    if bind is None or bind.dialect.name == "sqlite":
        return None
    return APP_SCHEMA


def _qualified_table(table_name: str, schema: str | None) -> str:
    return f"{schema}.{table_name}" if schema else table_name


def _has_column(db: Session, table_name: str, column_name: str, schema: str | None) -> bool:
    bind = db.get_bind()
    if bind is None:
        return False
    inspector = inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        return False
    return column_name in {str(item.get("name") or "").strip() for item in inspector.get_columns(table_name, schema=schema)}


def ensure_user_activity_schema(db: Session) -> bool:
    bind = db.get_bind()
    if bind is None:
        raise RuntimeError("user_activity schema repair missing bind")

    schema = _schema_name(db)
    inspector = inspect(bind)
    changed = False

    if bind.dialect.name != "sqlite":
        db.execute(text("CREATE SCHEMA IF NOT EXISTS app"))
        db.commit()

    if not inspector.has_table(UserLoginEvent.__tablename__, schema=schema):
        logger.warning("[DEBUG] user_activity.schema_repair_create_table")
        UserLoginEvent.__table__.create(bind=bind, checkfirst=True)
        db.commit()
        changed = True

    if not _has_column(db, User.__tablename__, "last_login_at", schema):
        table_name = _qualified_table(User.__tablename__, schema)
        logger.warning("[DEBUG] user_activity.schema_repair_add_column column=users.last_login_at")
        db.execute(text(f"ALTER TABLE {table_name} ADD COLUMN last_login_at TIMESTAMP NULL"))
        db.commit()
        changed = True

    return changed


def record_user_login_event(db: Session, *, user_id: int, event_type: str = "login") -> UserLoginEvent:
    ensure_user_activity_schema(db)
    now = now_shanghai_naive()
    user = db.get(User, user_id)
    if user is None:
        raise RuntimeError(f"user not found: {user_id}")
    user.last_login_at = now
    row = UserLoginEvent(user_id=user_id, event_type=(event_type or "login").strip() or "login", created_at=now)
    db.add(user)
    db.add(row)
    db.flush()
    return row
