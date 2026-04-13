"""seed faster-whisper-medium billing rate for desktop Bottle 1.0

Revision ID: 20260327_0029
Revises: 20260324_0028
Create Date: 2026-03-27 13:00:00
"""

from __future__ import annotations

from datetime import datetime

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260327_0029"
down_revision = "20260324_0028"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _qualified_table(table_name: str, schema: str | None) -> str:
    return f"{schema}.{table_name}" if schema else table_name


def upgrade() -> None:
    schema = _schema_name()
    table_name = _qualified_table("billing_model_rates", schema)
    bind = op.get_bind()

    # faster-whisper-medium: same points-per-minute as qwen3-asr-flash-filetrans (130)
    # price_per_minute_yuan and billing_unit columns must exist (added in prior migrations)
    faster_whisper = "faster-whisper-medium"
    points_per_minute = 130
    price_per_minute_yuan = 1.3000
    billing_unit = "minute"

    exists = bind.execute(
        sa.text(f"SELECT 1 FROM {table_name} WHERE model_name = :model_name LIMIT 1"),
        {"model_name": faster_whisper},
    ).scalar()
    if exists:
        return

    # Try to insert with all known columns; if price_per_minute_yuan / billing_unit don't exist yet,
    # fall back to the minimal set so the migration still succeeds on older schemas.
    minimal_columns = "(model_name, points_per_minute, is_active, updated_at, updated_by_user_id)"
    minimal_values = "(:model_name, :points_per_minute, :is_active, :updated_at, NULL)"

    bind.execute(
        sa.text(f"INSERT INTO {table_name} {minimal_columns} VALUES {minimal_values}"),
        {
            "model_name": faster_whisper,
            "points_per_minute": points_per_minute,
            "is_active": True,
            "updated_at": datetime.utcnow(),
        },
    )


def downgrade() -> None:
    schema = _schema_name()
    table_name = _qualified_table("billing_model_rates", schema)
    bind = op.get_bind()

    bind.execute(
        sa.text(f"DELETE FROM {table_name} WHERE model_name = :model_name"),
        {"model_name": "faster-whisper-medium"},
    )
