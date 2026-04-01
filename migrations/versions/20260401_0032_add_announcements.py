"""add announcements table

Revision ID: 20260401_0032
Revises: 20260328_0031
Create Date: 2026-04-01 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260401_0032"
down_revision = "20260328_0031"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def upgrade() -> None:
    schema = _schema_name()
    op.create_table(
        "announcements",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False, server_default="banner"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        schema=schema,
    )
    # Index for active announcements query
    op.create_index(
        "ix_announcements_is_active_created_at",
        "announcements",
        ["is_active", "created_at"],
        unique=False,
        schema=schema,
    )


def downgrade() -> None:
    schema = _schema_name()
    op.drop_index("ix_announcements_is_active_created_at", table_name="announcements", schema=schema)
    op.drop_table("announcements", schema=schema)
