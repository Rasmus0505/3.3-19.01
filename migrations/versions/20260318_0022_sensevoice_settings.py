"""add sensevoice settings table

Revision ID: 20260318_0022
Revises: 20260317_0021
Create Date: 2026-03-18 22:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260318_0022"
down_revision = "20260317_0021"
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
    if _has_table("sensevoice_settings", schema):
        return

    op.create_table(
        "sensevoice_settings",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("model_dir", sa.String(length=255), nullable=False, server_default="iic/SenseVoiceSmall"),
        sa.Column("trust_remote_code", sa.Boolean(), nullable=False, server_default=sa.text("0" if schema is None else "FALSE")),
        sa.Column("remote_code", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("device", sa.String(length=64), nullable=False, server_default="cuda:0"),
        sa.Column("language", sa.String(length=32), nullable=False, server_default="auto"),
        sa.Column("vad_model", sa.String(length=100), nullable=False, server_default="fsmn-vad"),
        sa.Column("vad_max_single_segment_time", sa.Integer(), nullable=False, server_default="30000"),
        sa.Column("use_itn", sa.Boolean(), nullable=False, server_default=sa.text("1" if schema is None else "TRUE")),
        sa.Column("batch_size_s", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("merge_vad", sa.Boolean(), nullable=False, server_default=sa.text("1" if schema is None else "TRUE")),
        sa.Column("merge_length_s", sa.Integer(), nullable=False, server_default="15"),
        sa.Column("ban_emo_unk", sa.Boolean(), nullable=False, server_default=sa.text("0" if schema is None else "FALSE")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.CheckConstraint("vad_max_single_segment_time > 0", name="ck_sensevoice_vad_max_segment_positive"),
        sa.CheckConstraint("batch_size_s > 0", name="ck_sensevoice_batch_size_positive"),
        sa.CheckConstraint("merge_length_s > 0", name="ck_sensevoice_merge_length_positive"),
        schema=schema,
    )


def downgrade() -> None:
    schema = _schema_name()
    if _has_table("sensevoice_settings", schema):
        op.drop_table("sensevoice_settings", schema=schema)
