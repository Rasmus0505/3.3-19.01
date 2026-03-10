"""add failure debug fields to lesson generation tasks

Revision ID: 20260310_0013
Revises: 20260310_0012
Create Date: 2026-03-10 17:10:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260310_0013"
down_revision = "20260310_0012"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _has_column(table_name: str, column_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return column_name in {str(item.get("name") or "") for item in inspector.get_columns(table_name, schema=schema)}


def upgrade() -> None:
    schema = _schema_name()
    with op.batch_alter_table("lesson_generation_tasks", schema=schema) as batch_op:
        if not _has_column("lesson_generation_tasks", "failure_debug_json", schema):
            batch_op.add_column(sa.Column("failure_debug_json", sa.JSON(), nullable=True))
        if not _has_column("lesson_generation_tasks", "failed_at", schema):
            batch_op.add_column(sa.Column("failed_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    schema = _schema_name()
    with op.batch_alter_table("lesson_generation_tasks", schema=schema) as batch_op:
        if _has_column("lesson_generation_tasks", "failed_at", schema):
            batch_op.drop_column("failed_at")
        if _has_column("lesson_generation_tasks", "failure_debug_json", schema):
            batch_op.drop_column("failure_debug_json")
