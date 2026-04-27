"""add faster whisper settings table

Revision ID: 20260418_0046
Revises: 20260418_0045
Create Date: 2026-04-18 23:55:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260418_0046"
down_revision = "20260418_0045"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def upgrade() -> None:
    schema = _schema_name()
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("faster_whisper_settings", schema=schema):
        return

    op.create_table(
        "faster_whisper_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("device", sa.String(length=32), nullable=False, server_default="cpu"),
        sa.Column("compute_type", sa.String(length=32), nullable=False, server_default=""),
        sa.Column("cpu_threads", sa.Integer(), nullable=False, server_default="4"),
        sa.Column("num_workers", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("beam_size", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("vad_filter", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("condition_on_previous_text", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.CheckConstraint("cpu_threads > 0", name="ck_faster_whisper_cpu_threads_positive"),
        sa.CheckConstraint("num_workers > 0", name="ck_faster_whisper_num_workers_positive"),
        sa.CheckConstraint("beam_size > 0", name="ck_faster_whisper_beam_size_positive"),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"],
            [f"{APP_SCHEMA}.users.id" if schema else "users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        schema=schema,
    )
    op.execute(
        sa.text(
            f"INSERT INTO {schema + '.' if schema else ''}faster_whisper_settings "
            "(id, device, compute_type, cpu_threads, num_workers, beam_size, vad_filter, condition_on_previous_text, updated_at) "
            "VALUES (1, 'cpu', '', 4, 2, 5, 1, 0, CURRENT_TIMESTAMP)"
        )
    )


def downgrade() -> None:
    schema = _schema_name()
    op.drop_table("faster_whisper_settings", schema=schema)
