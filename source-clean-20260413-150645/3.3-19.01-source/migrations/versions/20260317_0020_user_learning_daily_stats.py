"""add user learning daily stats

Revision ID: 20260317_0020
Revises: 20260316_0019
Create Date: 2026-03-17 01:40:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260317_0020"
down_revision = "20260316_0019"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _has_table(table_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return bool(inspector.has_table(table_name, schema=schema))


def upgrade() -> None:
    schema = _schema_name()
    if _has_table("user_learning_daily_stats", schema):
        return

    op.create_table(
        "user_learning_daily_stats",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("stat_date", sa.Date(), nullable=False),
        sa.Column("completed_sentences", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("check_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("check_passes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_learning_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], [f"{APP_SCHEMA}.users.id" if schema else "users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "stat_date", name="uq_user_learning_daily_stats_user_date"),
        schema=schema,
    )
    op.create_index(op.f("ix_user_learning_daily_stats_user_id"), "user_learning_daily_stats", ["user_id"], unique=False, schema=schema)
    op.create_index(
        "ix_user_learning_daily_stats_user_date",
        "user_learning_daily_stats",
        ["user_id", "stat_date"],
        unique=False,
        schema=schema,
    )
    op.create_index(
        "ix_user_learning_daily_stats_last_learning_at",
        "user_learning_daily_stats",
        ["last_learning_at"],
        unique=False,
        schema=schema,
    )


def downgrade() -> None:
    return None
