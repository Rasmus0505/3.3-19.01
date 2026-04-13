"""add voice_profiles table for TTS voice cloning

Revision ID: 20260408_0038
Revises: 20260407_0037
Create Date: 2026-04-08 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260408_0038"
down_revision = "20260407_0037"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def upgrade() -> None:
    schema = _schema_name()
    op.create_table(
        "voice_profiles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("voice_name", sa.String(length=255), nullable=False),
        sa.Column("preferred_name", sa.String(length=64), nullable=False),
        sa.Column("target_model", sa.String(length=100), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=True),
        sa.Column("gmt_create", sa.DateTime(), nullable=False),
        sa.Column("gmt_used", sa.DateTime(), nullable=True),
        schema=schema,
    )
    op.create_index("ix_voice_profiles_user_id", "voice_profiles", ["user_id"], unique=False, schema=schema)
    op.create_index("ix_voice_profiles_voice_name", "voice_profiles", ["voice_name"], unique=False, schema=schema)
    op.create_index(
        "ix_voice_profiles_user_voice",
        "voice_profiles",
        ["user_id", "voice_name"],
        unique=True,
        schema=schema,
    )


def downgrade() -> None:
    schema = _schema_name()
    op.drop_index("ix_voice_profiles_user_voice", table_name="voice_profiles", schema=schema)
    op.drop_index("ix_voice_profiles_voice_name", table_name="voice_profiles", schema=schema)
    op.drop_index("ix_voice_profiles_user_id", table_name="voice_profiles", schema=schema)
    op.drop_table("voice_profiles", schema=schema)
