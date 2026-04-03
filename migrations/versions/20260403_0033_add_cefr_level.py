"""add cefr_level to users

Revision ID: 20260403_0033
Revises: 20260401_0032
Create Date: 2026-04-03 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260403_0033"
down_revision = "20260401_0032"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def upgrade() -> None:
    schema = _schema_name()
    op.add_column(
        "users",
        sa.Column("cefr_level", sa.String(length=2), nullable=True, server_default="B1"),
        schema=schema,
    )
    # Index for filtering by CEFR level
    op.create_index(
        "ix_users_cefr_level",
        "users",
        ["cefr_level"],
        unique=False,
        schema=schema,
    )


def downgrade() -> None:
    schema = _schema_name()
    op.drop_index("ix_users_cefr_level", table_name="users", schema=schema)
    op.drop_column("users", "cefr_level", schema=schema)
