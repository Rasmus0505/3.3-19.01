"""add composite index for lesson catalog queries

Revision ID: 20260311_0015
Revises: 20260310_0014
Create Date: 2026-03-11 01:15:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260311_0015"
down_revision = "20260310_0014"
branch_labels = None
depends_on = None

TABLE_NAME = "lessons"
INDEX_NAME = "ix_lessons_user_id_created_at"


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _has_index(table_name: str, index_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = {str(item.get("name") or "") for item in inspector.get_indexes(table_name, schema=schema)}
    return index_name in indexes


def upgrade() -> None:
    schema = _schema_name()
    if not _has_index(TABLE_NAME, INDEX_NAME, schema):
        op.create_index(INDEX_NAME, TABLE_NAME, ["user_id", "created_at"], unique=False, schema=schema)


def downgrade() -> None:
    schema = _schema_name()
    if _has_index(TABLE_NAME, INDEX_NAME, schema):
        op.drop_index(INDEX_NAME, table_name=TABLE_NAME, schema=schema)
