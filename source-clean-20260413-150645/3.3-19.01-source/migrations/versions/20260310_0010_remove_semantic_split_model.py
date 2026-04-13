"""remove semantic split model setting

Revision ID: 20260310_0010
Revises: 20260309_0009
Create Date: 2026-03-10 14:05:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260310_0010"
down_revision = "20260309_0009"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _has_table(table_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return inspector.has_table(table_name, schema=schema)


def _column_names(table_name: str, schema: str | None) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        return set()
    return {str(item.get("name") or "").strip() for item in inspector.get_columns(table_name, schema=schema)}


def upgrade() -> None:
    schema = _schema_name()
    if not _has_table("subtitle_settings", schema):
        return

    columns = _column_names("subtitle_settings", schema)
    if "semantic_split_model" not in columns:
        return

    with op.batch_alter_table("subtitle_settings", schema=schema) as batch_op:
        batch_op.drop_column("semantic_split_model")


def downgrade() -> None:
    schema = _schema_name()
    if not _has_table("subtitle_settings", schema):
        return

    columns = _column_names("subtitle_settings", schema)
    if "semantic_split_model" in columns:
        return

    with op.batch_alter_table("subtitle_settings", schema=schema) as batch_op:
        batch_op.add_column(sa.Column("semantic_split_model", sa.String(length=100), nullable=False, server_default="qwen-mt-flash"))
