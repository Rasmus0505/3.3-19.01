"""add learning growth fields

Revision ID: 20260320_0023
Revises: 20260318_0022
Create Date: 2026-03-20 21:10:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260320_0023"
down_revision = "20260318_0022"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _has_column(table_name: str, column_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = inspector.get_columns(table_name, schema=schema)
    return any(str(item.get("name") or "") == column_name for item in columns)


def upgrade() -> None:
    schema = _schema_name()

    with op.batch_alter_table("user_learning_daily_stats", schema=schema) as batch_op:
        if not _has_column("user_learning_daily_stats", "learning_actions", schema):
            batch_op.add_column(sa.Column("learning_actions", sa.Integer(), nullable=False, server_default="0"))
        if not _has_column("user_learning_daily_stats", "growth_points", schema):
            batch_op.add_column(sa.Column("growth_points", sa.Integer(), nullable=False, server_default="0"))
        if not _has_column("user_learning_daily_stats", "task_completions", schema):
            batch_op.add_column(sa.Column("task_completions", sa.Integer(), nullable=False, server_default="0"))
        if not _has_column("user_learning_daily_stats", "completed_lessons", schema):
            batch_op.add_column(sa.Column("completed_lessons", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    return None
