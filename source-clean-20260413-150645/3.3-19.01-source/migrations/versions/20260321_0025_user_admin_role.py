"""add persisted user admin role

Revision ID: 20260321_0025
Revises: 20260320_0024
Create Date: 2026-03-21 11:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260321_0025"
down_revision = "20260320_0024"
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


def _has_index(table_name: str, index_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = inspector.get_indexes(table_name, schema=schema)
    return any(str(item.get("name") or "") == index_name for item in indexes)


def upgrade() -> None:
    schema = _schema_name()

    with op.batch_alter_table("users", schema=schema) as batch_op:
        if not _has_column("users", "is_admin", schema):
            batch_op.add_column(sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")))

    if not _has_index("users", "ix_users_is_admin", schema):
        op.create_index("ix_users_is_admin", "users", ["is_admin"], unique=False, schema=schema)


def downgrade() -> None:
    return None
