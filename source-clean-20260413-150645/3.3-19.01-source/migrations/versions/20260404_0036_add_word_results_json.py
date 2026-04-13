"""add word_results_json column to soe_results

Revision ID: 20260404_0036
Revises: 20260404_0035
Create Date: 2026-04-04 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260404_0036"
down_revision = "20260404_0035"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def upgrade() -> None:
    schema = _schema_name()
    op.add_column(
        "soe_results",
        sa.Column("word_results_json", sa.JSON(), nullable=True),
        schema=schema,
    )


def downgrade() -> None:
    schema = _schema_name()
    op.drop_column("soe_results", "word_results_json", schema=schema)
