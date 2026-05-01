"""add asr record history tables

Revision ID: 20260428_0051
Revises: 20260427_0050
Create Date: 2026-04-28 15:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260428_0051"
down_revision = "20260427_0050"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def upgrade() -> None:
    schema = _schema_name()
    op.create_table(
        "asr_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("asr_model", sa.String(length=100), nullable=False),
        sa.Column("output_mode", sa.String(length=32), nullable=False, server_default="per_file"),
        sa.Column("include_timestamps", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("include_filename_headers", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("record_status", sa.String(length=32), nullable=False, server_default="succeeded"),
        sa.Column("file_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("success_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failure_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_elapsed_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("preview_text", sa.String(length=600), nullable=False, server_default=""),
        sa.Column("merged_text", sa.String(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], [f"{APP_SCHEMA}.users.id"] if schema else ["users.id"], ondelete="CASCADE"),
        schema=schema,
    )
    op.create_index("ix_asr_records_id", "asr_records", ["id"], unique=False, schema=schema)
    op.create_index("ix_asr_records_user_id", "asr_records", ["user_id"], unique=False, schema=schema)
    op.create_index("ix_asr_records_user_id_created_at", "asr_records", ["user_id", "created_at"], unique=False, schema=schema)

    op.create_table(
        "asr_record_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("record_id", sa.Integer(), nullable=False),
        sa.Column("file_index", sa.Integer(), nullable=False),
        sa.Column("source_filename", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="succeeded"),
        sa.Column("error_code", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("error_message", sa.String(length=1200), nullable=False, server_default=""),
        sa.Column("preview_text", sa.String(length=600), nullable=False, server_default=""),
        sa.Column("transcript_text", sa.String(), nullable=False, server_default=""),
        sa.Column("rendered_text", sa.String(), nullable=False, server_default=""),
        sa.Column("elapsed_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("segments_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["record_id"], [f"{APP_SCHEMA}.asr_records.id"] if schema else ["asr_records.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("record_id", "file_index", name="uq_asr_record_item_record_index"),
        schema=schema,
    )
    op.create_index("ix_asr_record_items_id", "asr_record_items", ["id"], unique=False, schema=schema)
    op.create_index("ix_asr_record_items_record_id", "asr_record_items", ["record_id"], unique=False, schema=schema)


def downgrade() -> None:
    schema = _schema_name()
    op.drop_index("ix_asr_record_items_record_id", table_name="asr_record_items", schema=schema)
    op.drop_index("ix_asr_record_items_id", table_name="asr_record_items", schema=schema)
    op.drop_table("asr_record_items", schema=schema)

    op.drop_index("ix_asr_records_user_id_created_at", table_name="asr_records", schema=schema)
    op.drop_index("ix_asr_records_user_id", table_name="asr_records", schema=schema)
    op.drop_index("ix_asr_records_id", table_name="asr_records", schema=schema)
    op.drop_table("asr_records", schema=schema)
