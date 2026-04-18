"""add lesson generation option tracking

Revision ID: 20260418_0042
Revises: 20260411_0041
Create Date: 2026-04-18
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260418_0042"
down_revision = "20260411_0041"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def upgrade() -> None:
    schema = _schema_name()
    op.add_column("lessons", sa.Column("requested_generation_options_json", sa.JSON(), nullable=True), schema=schema)
    op.add_column("lessons", sa.Column("effective_generation_options_json", sa.JSON(), nullable=True), schema=schema)
    op.add_column("lessons", sa.Column("generated_content_status_json", sa.JSON(), nullable=True), schema=schema)


def downgrade() -> None:
    schema = _schema_name()
    op.drop_column("lessons", "generated_content_status_json", schema=schema)
    op.drop_column("lessons", "effective_generation_options_json", schema=schema)
    op.drop_column("lessons", "requested_generation_options_json", schema=schema)
