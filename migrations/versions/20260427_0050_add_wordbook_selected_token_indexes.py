"""add wordbook selected token indexes

Revision ID: 20260427_0050
Revises: 20260418_0049
Create Date: 2026-04-27 12:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260427_0050"
down_revision = "20260418_0049"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _has_column(table_name: str, column_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(str(column.get("name") or "") == column_name for column in inspector.get_columns(table_name, schema=schema))


def upgrade() -> None:
    schema = _schema_name()
    for table_name in ("wordbook_entries", "wordbook_entry_sources"):
        if not _has_column(table_name, "selected_token_indexes_json", schema):
            op.add_column(
                table_name,
                sa.Column("selected_token_indexes_json", sa.JSON(), nullable=True),
                schema=schema,
            )


def downgrade() -> None:
    schema = _schema_name()
    for table_name in ("wordbook_entry_sources", "wordbook_entries"):
        if _has_column(table_name, "selected_token_indexes_json", schema):
            op.drop_column(table_name, "selected_token_indexes_json", schema=schema)
