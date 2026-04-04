"""add llm_usage_logs table

Revision ID: 20260404_0035
Revises: 20260404_0034
Create Date: 2026-04-04 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260404_0035"
down_revision = "20260404_0034"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def upgrade() -> None:
    schema = _schema_name()
    op.create_table(
        "llm_usage_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("trace_id", sa.String(length=64), nullable=False),
        sa.Column("category", sa.String(length=16), nullable=False),
        sa.Column("model_name", sa.String(length=100), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reasoning_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("input_cost_cents", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("charge_cents", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("gross_profit_cents", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("enable_thinking", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("input_text_preview", sa.String(length=300), nullable=False, server_default="''"),
        sa.Column("lesson_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        schema=schema,
    )
    op.create_index("ix_llm_usage_user_id", "llm_usage_logs", ["user_id"], unique=False, schema=schema)
    op.create_index("ix_llm_usage_trace_id", "llm_usage_logs", ["trace_id"], unique=False, schema=schema)
    op.create_index("ix_llm_usage_category", "llm_usage_logs", ["category"], unique=False, schema=schema)
    op.create_index("ix_llm_usage_model_name", "llm_usage_logs", ["model_name"], unique=False, schema=schema)
    op.create_index("ix_llm_usage_lesson_id", "llm_usage_logs", ["lesson_id"], unique=False, schema=schema)
    op.create_index("ix_llm_usage_created_at", "llm_usage_logs", ["created_at"], unique=False, schema=schema)
    op.create_foreign_key(
        "fk_llm_usage_user_id",
        "llm_usage_logs", "users",
        ["user_id"], ["id"],
        ondelete="CASCADE",
        source_schema=schema,
        referent_schema=schema,
    )
    op.create_foreign_key(
        "fk_llm_usage_lesson_id",
        "llm_usage_logs", "lessons",
        ["lesson_id"], ["id"],
        ondelete="SET NULL",
        source_schema=schema,
        referent_schema=schema,
    )

    if schema is None:
        op.execute(
            "ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS event_type VARCHAR(32) NOT NULL DEFAULT 'reserve' "
            "CHECK(event_type IN ('reserve','consume','refund','manual_adjust','redeem_code','consume_translate','refund_translate','consume_llm'))"
        )
    else:
        op.execute(
            f"ALTER TABLE {schema}.wallet_ledger ADD COLUMN IF NOT EXISTS event_type VARCHAR(32) NOT NULL DEFAULT 'reserve'"
        )


def downgrade() -> None:
    schema = _schema_name()
    op.drop_constraint("fk_llm_usage_lesson_id", "llm_usage_logs", schema=schema)
    op.drop_constraint("fk_llm_usage_user_id", "llm_usage_logs", schema=schema)
    op.drop_index("ix_llm_usage_created_at", table_name="llm_usage_logs", schema=schema)
    op.drop_index("ix_llm_usage_lesson_id", table_name="llm_usage_logs", schema=schema)
    op.drop_index("ix_llm_usage_model_name", table_name="llm_usage_logs", schema=schema)
    op.drop_index("ix_llm_usage_category", table_name="llm_usage_logs", schema=schema)
    op.drop_index("ix_llm_usage_trace_id", table_name="llm_usage_logs", schema=schema)
    op.drop_index("ix_llm_usage_user_id", table_name="llm_usage_logs", schema=schema)
    op.drop_table("llm_usage_logs", schema=schema)
