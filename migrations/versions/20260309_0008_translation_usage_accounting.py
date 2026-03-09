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

TRANSLATION_LOG_INDEXES = (
    ("ix_translation_request_logs_trace_id", ["trace_id"]),
    ("ix_translation_request_logs_task_id", ["task_id"]),
    ("ix_translation_request_logs_lesson_id", ["lesson_id"]),
    ("ix_translation_request_logs_user_id", ["user_id"]),
    ("ix_translation_request_logs_sentence_idx", ["sentence_idx"]),
    ("ix_translation_request_logs_provider_request_id", ["provider_request_id"]),
    ("ix_translation_request_logs_success", ["success"]),
    ("ix_translation_request_logs_created_at", ["created_at"]),
)


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _qualified_table(table_name: str, schema: str | None) -> str:
    return f"{schema}.{table_name}" if schema else table_name


def _has_table(table_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return inspector.has_table(table_name, schema=schema)


def _column_names(table_name: str, schema: str | None) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        return set()
    return {str(item.get("name") or "").strip() for item in inspector.get_columns(table_name, schema=schema)}


def _index_names(table_name: str, schema: str | None) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        return set()
    return {str(item.get("name") or "").strip() for item in inspector.get_indexes(table_name, schema=schema)}


def _check_constraints(table_name: str, schema: str | None) -> dict[str, str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        return {}
    items: dict[str, str] = {}
    for row in inspector.get_check_constraints(table_name, schema=schema):
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        items[name] = _normalize_sql(str(row.get("sqltext") or ""))
    return items


def _normalize_sql(text: str) -> str:
    return " ".join((text or "").lower().replace('"', "").replace("'", "").split())


def _translation_log_columns() -> tuple[sa.Column, ...]:
    return (
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
    )


def upgrade() -> None:
    schema = _schema_name()
    bind = op.get_bind()

    _upgrade_billing_model_rates(schema)
    _upgrade_wallet_ledger(schema)
    _upgrade_translation_request_logs(schema)

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


def _upgrade_billing_model_rates(schema: str | None) -> None:
    if not _has_table("billing_model_rates", schema):
        return

    existing_columns = _column_names("billing_model_rates", schema)
    billing_checks = _check_constraints("billing_model_rates", schema)
    normalized_positive = _normalize_sql("points_per_minute >= 0")
    normalized_token = _normalize_sql("points_per_1k_tokens >= 0")

    needs_batch = (
        "points_per_1k_tokens" not in existing_columns
        or "billing_unit" not in existing_columns
        or billing_checks.get("ck_billing_rate_positive") != normalized_positive
        or billing_checks.get("ck_billing_rate_token_non_negative") != normalized_token
    )
    if not needs_batch:
        return

    with op.batch_alter_table("billing_model_rates", schema=schema) as batch_op:
        if "points_per_1k_tokens" not in existing_columns:
            batch_op.add_column(sa.Column("points_per_1k_tokens", sa.Integer(), nullable=False, server_default="0"))
        if "billing_unit" not in existing_columns:
            batch_op.add_column(sa.Column("billing_unit", sa.String(length=32), nullable=False, server_default="minute"))
        if billing_checks.get("ck_billing_rate_positive") != normalized_positive:
            if "ck_billing_rate_positive" in billing_checks:
                batch_op.drop_constraint("ck_billing_rate_positive", type_="check")
            batch_op.create_check_constraint("ck_billing_rate_positive", "points_per_minute >= 0")
        if billing_checks.get("ck_billing_rate_token_non_negative") != normalized_token:
            if "ck_billing_rate_token_non_negative" in billing_checks:
                batch_op.drop_constraint("ck_billing_rate_token_non_negative", type_="check")
            batch_op.create_check_constraint("ck_billing_rate_token_non_negative", "points_per_1k_tokens >= 0")


def _upgrade_wallet_ledger(schema: str | None) -> None:
    if not _has_table("wallet_ledger", schema):
        return

    wallet_checks = _check_constraints("wallet_ledger", schema)
    normalized_event_check = _normalize_sql(
        "event_type IN ('reserve','consume','refund','manual_adjust','redeem_code','consume_translate','refund_translate')"
    )
    if wallet_checks.get("ck_wallet_ledger_event_type") == normalized_event_check:
        return

    with op.batch_alter_table("wallet_ledger", schema=schema) as batch_op:
        if "ck_wallet_ledger_event_type" in wallet_checks:
            batch_op.drop_constraint("ck_wallet_ledger_event_type", type_="check")
        batch_op.create_check_constraint(
            "ck_wallet_ledger_event_type",
            "event_type IN ('reserve','consume','refund','manual_adjust','redeem_code','consume_translate','refund_translate')",
        )


def _upgrade_translation_request_logs(schema: str | None) -> None:
    if not _has_table("translation_request_logs", schema):
        op.create_table(
            "translation_request_logs",
            *_translation_log_columns(),
            sa.CheckConstraint("attempt_no > 0", name="ck_translation_request_attempt_positive"),
            sa.ForeignKeyConstraint(["lesson_id"], [f"{APP_SCHEMA}.lessons.id" if schema else "lessons.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], [f"{APP_SCHEMA}.users.id" if schema else "users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            schema=schema,
        )
    else:
        existing_columns = _column_names("translation_request_logs", schema)
        missing_columns = [column for column in _translation_log_columns() if column.name not in existing_columns]
        checks = _check_constraints("translation_request_logs", schema)
        needs_attempt_check = checks.get("ck_translation_request_attempt_positive") != _normalize_sql("attempt_no > 0")
        if missing_columns or needs_attempt_check:
            with op.batch_alter_table("translation_request_logs", schema=schema) as batch_op:
                for column in missing_columns:
                    batch_op.add_column(column)
                if needs_attempt_check:
                    if "ck_translation_request_attempt_positive" in checks:
                        batch_op.drop_constraint("ck_translation_request_attempt_positive", type_="check")
                    batch_op.create_check_constraint("ck_translation_request_attempt_positive", "attempt_no > 0")

    existing_indexes = _index_names("translation_request_logs", schema)
    for index_name, columns in TRANSLATION_LOG_INDEXES:
        resolved_name = op.f(index_name)
        if resolved_name in existing_indexes:
            continue
        op.create_index(resolved_name, "translation_request_logs", columns, unique=False, schema=schema)


def downgrade() -> None:
    schema = _schema_name()
    bind = op.get_bind()
    table_name = _qualified_table("billing_model_rates", schema)

    if _has_table("billing_model_rates", schema):
        for model_name in MT_MODELS:
            bind.execute(sa.text(f"DELETE FROM {table_name} WHERE model_name = :model_name"), {"model_name": model_name})

    if _has_table("translation_request_logs", schema):
        existing_indexes = _index_names("translation_request_logs", schema)
        for index_name, _ in reversed(TRANSLATION_LOG_INDEXES):
            resolved_name = op.f(index_name)
            if resolved_name in existing_indexes:
                op.drop_index(resolved_name, table_name="translation_request_logs", schema=schema)
        op.drop_table("translation_request_logs", schema=schema)

    if _has_table("wallet_ledger", schema):
        with op.batch_alter_table("wallet_ledger", schema=schema) as batch_op:
            wallet_checks = _check_constraints("wallet_ledger", schema)
            if "ck_wallet_ledger_event_type" in wallet_checks:
                batch_op.drop_constraint("ck_wallet_ledger_event_type", type_="check")
            batch_op.create_check_constraint(
                "ck_wallet_ledger_event_type",
                "event_type IN ('reserve','consume','refund','manual_adjust','redeem_code')",
            )

    if _has_table("billing_model_rates", schema):
        existing_columns = _column_names("billing_model_rates", schema)
        billing_checks = _check_constraints("billing_model_rates", schema)
        with op.batch_alter_table("billing_model_rates", schema=schema) as batch_op:
            if "ck_billing_rate_token_non_negative" in billing_checks:
                batch_op.drop_constraint("ck_billing_rate_token_non_negative", type_="check")
            if "ck_billing_rate_positive" in billing_checks:
                batch_op.drop_constraint("ck_billing_rate_positive", type_="check")
            batch_op.create_check_constraint("ck_billing_rate_positive", "points_per_minute > 0")
            if "billing_unit" in existing_columns:
                batch_op.drop_column("billing_unit")
            if "points_per_1k_tokens" in existing_columns:
                batch_op.drop_column("points_per_1k_tokens")
