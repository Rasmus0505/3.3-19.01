"""add user activity tracking and default asr model

Revision ID: 20260316_0019
Revises: 20260314_0018
Create Date: 2026-03-16 19:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.core.config import LESSON_DEFAULT_ASR_MODEL
from app.db import APP_SCHEMA


revision = "20260316_0019"
down_revision = "20260314_0018"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _has_table(table_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return bool(inspector.has_table(table_name, schema=schema))


def _has_column(table_name: str, column_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        return False
    return column_name in {str(item.get("name") or "").strip() for item in inspector.get_columns(table_name, schema=schema)}


def upgrade() -> None:
    schema = _schema_name()
    if _has_table("users", schema) and not _has_column("users", "last_login_at", schema):
        with op.batch_alter_table("users", schema=schema) as batch_op:
            batch_op.add_column(sa.Column("last_login_at", sa.DateTime(), nullable=True))

    if not _has_table("user_login_events", schema):
        op.create_table(
            "user_login_events",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("event_type", sa.String(length=32), nullable=False, server_default="login"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["user_id"], [f"{APP_SCHEMA}.users.id" if schema else "users.id"], ondelete="CASCADE"),
            schema=schema,
        )
        op.create_index(op.f("ix_user_login_events_user_id"), "user_login_events", ["user_id"], unique=False, schema=schema)
        op.create_index(op.f("ix_user_login_events_event_type"), "user_login_events", ["event_type"], unique=False, schema=schema)
        op.create_index(op.f("ix_user_login_events_created_at"), "user_login_events", ["created_at"], unique=False, schema=schema)

    if _has_table("subtitle_settings", schema) and not _has_column("subtitle_settings", "default_asr_model", schema):
        with op.batch_alter_table("subtitle_settings", schema=schema) as batch_op:
            batch_op.add_column(
                sa.Column(
                    "default_asr_model",
                    sa.String(length=100),
                    nullable=False,
                    server_default=LESSON_DEFAULT_ASR_MODEL,
                )
            )


def downgrade() -> None:
    return None
