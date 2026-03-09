"""translation usage accounting and diagnostics

Revision ID: 20260309_0008
Revises: 20260307_0007
Create Date: 2026-03-09 01:40:00
"""

from __future__ import annotations

from datetime import datetime

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260309_0008"
down_revision = "20260307_0007"
branch_labels = None
depends_on = None


MT_MODELS = ("qwen-mt-plus", "qwen-mt-flash", "qwen-mt-lite", "qwen-mt-turbo")
DEFAULT_MT_POINTS_PER_1K_TOKENS = 15


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _qualified_table(table_name: str, schema: str | None) -> str:
    return f"{schema}.{table_name}" if schema else table_name


def upgrade() -> None:
    schema = _schema_name()
    bind = op.get_bind()

    with op.batch_alter_table("billing_model_rates", schema=schema) as batch_op:
        batch_op.add_column(sa.Column("points_per_1k_tokens", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("billing_unit", sa.String(length=32), nullable=False, server_default="minute"))
        batch_op.drop_constraint("ck_billing_rate_positive", type_="check")
        batch_op.create_check_constraint("ck_billing_rate_positive", "points_per_minute >= 0")
        batch_op.create_check_constraint("ck_billing_rate_token_non_negative", "points_per_1k_tokens >= 0")

    with op.batch_alter_table("wallet_ledger", schema=schema) as batch_op:
        batch_op.drop_constraint("ck_wallet_ledger_event_type", type_="check")
        batch_op.create_check_constraint(
            "ck_wallet_ledger_event_type",
            "event_type IN ('reserve','consume','refund','manual_adjust','redeem_code','consume_translate','refund_translate')",
        )

    op.create_table(
        "translation_request_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("trace_id", sa.String(length=64), nullable=False),
        sa.Column("task_id", sa.String(length=128), nullable=True),
        sa.Column("lesson_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("sentence_idx", sa.Integer(), nullable=False),
        sa.Column("attempt_no", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("provider", sa.String(length=64), nullable=False, server_default="dashscope_compatible"),
        sa.Column("model_name", sa.String(length=100), nullable=False),
        sa.Column("base_url", sa.String(length=255), nullable=False),
        sa.Column("input_text_preview", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("provider_request_id", sa.String(length=128), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("finish_reason", sa.String(length=64), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("error_code", sa.String(length=120), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=False, server_default=""),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("attempt_no > 0", name="ck_translation_request_attempt_positive"),
        sa.ForeignKeyConstraint(["lesson_id"], [f"{APP_SCHEMA}.lessons.id" if schema else "lessons.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], [f"{APP_SCHEMA}.users.id" if schema else "users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        schema=schema,
    )
    op.create_index(op.f("ix_translation_request_logs_trace_id"), "translation_request_logs", ["trace_id"], unique=False, schema=schema)
    op.create_index(op.f("ix_translation_request_logs_task_id"), "translation_request_logs", ["task_id"], unique=False, schema=schema)
    op.create_index(op.f("ix_translation_request_logs_lesson_id"), "translation_request_logs", ["lesson_id"], unique=False, schema=schema)
    op.create_index(op.f("ix_translation_request_logs_user_id"), "translation_request_logs", ["user_id"], unique=False, schema=schema)
    op.create_index(op.f("ix_translation_request_logs_sentence_idx"), "translation_request_logs", ["sentence_idx"], unique=False, schema=schema)
    op.create_index(op.f("ix_translation_request_logs_provider_request_id"), "translation_request_logs", ["provider_request_id"], unique=False, schema=schema)
    op.create_index(op.f("ix_translation_request_logs_success"), "translation_request_logs", ["success"], unique=False, schema=schema)
    op.create_index(op.f("ix_translation_request_logs_created_at"), "translation_request_logs", ["created_at"], unique=False, schema=schema)

    table_name = _qualified_table("billing_model_rates", schema)
    bind.execute(
        sa.text(
            f"""
            UPDATE {table_name}
            SET
                points_per_1k_tokens = COALESCE(points_per_1k_tokens, 0),
                billing_unit = CASE
                    WHEN model_name LIKE 'qwen-mt-%' THEN '1k_tokens'
                    ELSE 'minute'
                END
            """
        )
    )

    for model_name in MT_MODELS:
        exists = bind.execute(
            sa.text(f"SELECT 1 FROM {table_name} WHERE model_name = :model_name LIMIT 1"),
            {"model_name": model_name},
        ).scalar()
        if exists:
            continue
        bind.execute(
            sa.text(
                f"""
                INSERT INTO {table_name}
                    (model_name, points_per_minute, points_per_1k_tokens, billing_unit, is_active,
                     parallel_enabled, parallel_threshold_seconds, segment_seconds, max_concurrency, updated_at, updated_by_user_id)
                VALUES
                    (:model_name, :points_per_minute, :points_per_1k_tokens, :billing_unit, :is_active,
                     :parallel_enabled, :parallel_threshold_seconds, :segment_seconds, :max_concurrency, :updated_at, NULL)
                """
            ),
            {
                "model_name": model_name,
                "points_per_minute": 0,
                "points_per_1k_tokens": DEFAULT_MT_POINTS_PER_1K_TOKENS,
                "billing_unit": "1k_tokens",
                "is_active": True,
                "parallel_enabled": False,
                "parallel_threshold_seconds": 600,
                "segment_seconds": 300,
                "max_concurrency": 1,
                "updated_at": datetime.utcnow(),
            },
        )


def downgrade() -> None:
    schema = _schema_name()
    bind = op.get_bind()
    table_name = _qualified_table("billing_model_rates", schema)

    for model_name in MT_MODELS:
        bind.execute(sa.text(f"DELETE FROM {table_name} WHERE model_name = :model_name"), {"model_name": model_name})

    op.drop_index(op.f("ix_translation_request_logs_created_at"), table_name="translation_request_logs", schema=schema)
    op.drop_index(op.f("ix_translation_request_logs_success"), table_name="translation_request_logs", schema=schema)
    op.drop_index(op.f("ix_translation_request_logs_provider_request_id"), table_name="translation_request_logs", schema=schema)
    op.drop_index(op.f("ix_translation_request_logs_sentence_idx"), table_name="translation_request_logs", schema=schema)
    op.drop_index(op.f("ix_translation_request_logs_user_id"), table_name="translation_request_logs", schema=schema)
    op.drop_index(op.f("ix_translation_request_logs_lesson_id"), table_name="translation_request_logs", schema=schema)
    op.drop_index(op.f("ix_translation_request_logs_task_id"), table_name="translation_request_logs", schema=schema)
    op.drop_index(op.f("ix_translation_request_logs_trace_id"), table_name="translation_request_logs", schema=schema)
    op.drop_table("translation_request_logs", schema=schema)

    with op.batch_alter_table("wallet_ledger", schema=schema) as batch_op:
        batch_op.drop_constraint("ck_wallet_ledger_event_type", type_="check")
        batch_op.create_check_constraint(
            "ck_wallet_ledger_event_type",
            "event_type IN ('reserve','consume','refund','manual_adjust','redeem_code')",
        )

    with op.batch_alter_table("billing_model_rates", schema=schema) as batch_op:
        batch_op.drop_constraint("ck_billing_rate_token_non_negative", type_="check")
        batch_op.drop_constraint("ck_billing_rate_positive", type_="check")
        batch_op.create_check_constraint("ck_billing_rate_positive", "points_per_minute > 0")
        batch_op.drop_column("billing_unit")
        batch_op.drop_column("points_per_1k_tokens")
