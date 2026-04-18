"""add wordbook token ranges

Revision ID: 20260418_0043
Revises: 20260418_0042
Create Date: 2026-04-18 15:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260418_0043"
down_revision = "20260418_0042"
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

    if not _has_column("wordbook_entries", "start_token_index", schema):
        op.add_column(
            "wordbook_entries",
            sa.Column("start_token_index", sa.Integer(), nullable=False, server_default="0"),
            schema=schema,
        )
    if not _has_column("wordbook_entries", "end_token_index", schema):
        op.add_column(
            "wordbook_entries",
            sa.Column("end_token_index", sa.Integer(), nullable=False, server_default="0"),
            schema=schema,
        )

    op.alter_column("wordbook_entries", "start_token_index", server_default=None, schema=schema)
    op.alter_column("wordbook_entries", "end_token_index", server_default=None, schema=schema)


def downgrade() -> None:
    schema = _schema_name()
    if _has_column("wordbook_entries", "end_token_index", schema):
        op.drop_column("wordbook_entries", "end_token_index", schema=schema)
    if _has_column("wordbook_entries", "start_token_index", schema):
        op.drop_column("wordbook_entries", "start_token_index", schema=schema)
