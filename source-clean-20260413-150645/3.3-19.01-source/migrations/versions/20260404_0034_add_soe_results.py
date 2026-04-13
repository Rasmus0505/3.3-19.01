"""add soe_results table

Revision ID: 20260404_0034
Revises: 20260403_0033
Create Date: 2026-04-04 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260404_0034"
down_revision = "20260403_0033"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def upgrade() -> None:
    schema = _schema_name()
    op.create_table(
        "soe_results",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=True),
        sa.Column("sentence_id", sa.Integer(), nullable=True),
        sa.Column("ref_text", sa.Text(), nullable=False),
        sa.Column("user_text", sa.Text(), nullable=False),
        sa.Column("total_score", sa.Float(), nullable=False),
        sa.Column("pronunciation_score", sa.Float(), nullable=False),
        sa.Column("fluency_score", sa.Float(), nullable=False),
        sa.Column("completeness_score", sa.Float(), nullable=False),
        sa.Column("audio_duration_ms", sa.Integer(), nullable=True),
        sa.Column("voice_id", sa.String(length=64), nullable=False),
        sa.Column("raw_response_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        schema=schema,
    )
    op.create_index("ix_soe_results_user_id", "soe_results", ["user_id"], unique=False, schema=schema)
    op.create_index("ix_soe_results_lesson_id", "soe_results", ["lesson_id"], unique=False, schema=schema)
    op.create_index("ix_soe_results_sentence_id", "soe_results", ["sentence_id"], unique=False, schema=schema)
    op.create_index("ix_soe_results_voice_id", "soe_results", ["voice_id"], unique=False, schema=schema)
    op.create_index("ix_soe_results_created_at", "soe_results", ["created_at"], unique=False, schema=schema)
    op.create_foreign_key(
        "fk_soe_results_user_id",
        "soe_results", "users",
        ["user_id"], ["id"],
        ondelete="CASCADE",
        source_schema=schema,
        referent_schema=schema,
    )
    op.create_foreign_key(
        "fk_soe_results_lesson_id",
        "soe_results", "lessons",
        ["lesson_id"], ["id"],
        ondelete="SET NULL",
        source_schema=schema,
        referent_schema=schema,
    )
    op.create_foreign_key(
        "fk_soe_results_sentence_id",
        "soe_results", "lesson_sentences",
        ["sentence_id"], ["id"],
        ondelete="SET NULL",
        source_schema=schema,
        referent_schema=schema,
    )


def downgrade() -> None:
    schema = _schema_name()
    op.drop_constraint("fk_soe_results_sentence_id", "soe_results", schema=schema)
    op.drop_constraint("fk_soe_results_lesson_id", "soe_results", schema=schema)
    op.drop_constraint("fk_soe_results_user_id", "soe_results", schema=schema)
    op.drop_index("ix_soe_results_created_at", table_name="soe_results", schema=schema)
    op.drop_index("ix_soe_results_voice_id", table_name="soe_results", schema=schema)
    op.drop_index("ix_soe_results_sentence_id", table_name="soe_results", schema=schema)
    op.drop_index("ix_soe_results_lesson_id", table_name="soe_results", schema=schema)
    op.drop_index("ix_soe_results_user_id", table_name="soe_results", schema=schema)
    op.drop_table("soe_results", schema=schema)
