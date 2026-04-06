"""alter llm_usage_logs input_text_preview to 300 chars

Revision ID: 20260407_0037
Revises: 20260404_0036
Create Date: 2026-04-07 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260407_0037"
down_revision = "20260404_0036"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def upgrade() -> None:
    schema = _schema_name()
    # Fix input_text_preview column to be 300 chars (was incorrectly set to 16 in some deployments)
    op.alter_column(
        "llm_usage_logs",
        "input_text_preview",
        type_=sa.String(300),
        existing_type=sa.String(16),
        schema=schema,
    )


def downgrade() -> None:
    schema = _schema_name()
    op.alter_column(
        "llm_usage_logs",
        "input_text_preview",
        type_=sa.String(16),
        existing_type=sa.String(300),
        schema=schema,
    )
