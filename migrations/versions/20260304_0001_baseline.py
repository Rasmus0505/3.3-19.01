"""baseline schema with lessons and wallet billing tables

Revision ID: 20260304_0001
Revises: 
Create Date: 2026-03-04 13:40:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260304_0001"
down_revision = None
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else "app"


def _has_table(table_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return inspector.has_table(table_name, schema=schema)


def upgrade() -> None:
    schema = _schema_name()
    if schema:
        op.execute("CREATE SCHEMA IF NOT EXISTS app")

    if not _has_table("users", schema):
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("password_hash", sa.String(length=255), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("email", name="uq_users_email"),
            schema=schema,
        )
        op.create_index("ix_users_id", "users", ["id"], unique=False, schema=schema)
        op.create_index("ix_users_email", "users", ["email"], unique=True, schema=schema)

    if not _has_table("lessons", schema):
        op.create_table(
            "lessons",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}users.id"), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("source_filename", sa.String(length=255), nullable=False),
            sa.Column("asr_model", sa.String(length=100), nullable=False),
            sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="ready"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            schema=schema,
        )
        op.create_index("ix_lessons_id", "lessons", ["id"], unique=False, schema=schema)
        op.create_index("ix_lessons_user_id", "lessons", ["user_id"], unique=False, schema=schema)

    if not _has_table("lesson_sentences", schema):
        op.create_table(
            "lesson_sentences",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("lesson_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}lessons.id"), nullable=False),
            sa.Column("idx", sa.Integer(), nullable=False),
            sa.Column("begin_ms", sa.Integer(), nullable=False),
            sa.Column("end_ms", sa.Integer(), nullable=False),
            sa.Column("text_en", sa.String(), nullable=False),
            sa.Column("text_zh", sa.String(), nullable=False, server_default=""),
            sa.Column("tokens_json", sa.JSON(), nullable=False),
            sa.Column("audio_clip_path", sa.String(length=500), nullable=False),
            sa.UniqueConstraint("lesson_id", "idx", name="uq_lesson_sentence_idx"),
            schema=schema,
        )
        op.create_index("ix_lesson_sentences_lesson_id", "lesson_sentences", ["lesson_id"], unique=False, schema=schema)

    if not _has_table("lesson_progress", schema):
        op.create_table(
            "lesson_progress",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("lesson_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}lessons.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}users.id"), nullable=False),
            sa.Column("current_sentence_idx", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("completed_indexes_json", sa.JSON(), nullable=False),
            sa.Column("last_played_at_ms", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("lesson_id", "user_id", name="uq_lesson_progress_user"),
            schema=schema,
        )
        op.create_index("ix_lesson_progress_lesson_id", "lesson_progress", ["lesson_id"], unique=False, schema=schema)
        op.create_index("ix_lesson_progress_user_id", "lesson_progress", ["user_id"], unique=False, schema=schema)

    if not _has_table("media_assets", schema):
        op.create_table(
            "media_assets",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("lesson_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}lessons.id"), nullable=False),
            sa.Column("original_path", sa.String(length=500), nullable=False),
            sa.Column("opus_path", sa.String(length=500), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            schema=schema,
        )
        op.create_index("ix_media_assets_lesson_id", "media_assets", ["lesson_id"], unique=False, schema=schema)

    if not _has_table("wallet_accounts", schema):
        op.create_table(
            "wallet_accounts",
            sa.Column("user_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}users.id"), primary_key=True),
            sa.Column("balance_points", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.CheckConstraint("balance_points >= 0", name="ck_wallet_balance_non_negative"),
            schema=schema,
        )

    if not _has_table("wallet_ledger", schema):
        op.create_table(
            "wallet_ledger",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}users.id"), nullable=False),
            sa.Column("operator_user_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}users.id"), nullable=True),
            sa.Column("event_type", sa.String(length=32), nullable=False),
            sa.Column("delta_points", sa.BigInteger(), nullable=False),
            sa.Column("balance_after", sa.BigInteger(), nullable=False),
            sa.Column("model_name", sa.String(length=100), nullable=True),
            sa.Column("duration_ms", sa.Integer(), nullable=True),
            sa.Column("lesson_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}lessons.id"), nullable=True),
            sa.Column("note", sa.Text(), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.CheckConstraint("event_type IN ('reserve','consume','refund','manual_adjust')", name="ck_wallet_ledger_event_type"),
            schema=schema,
        )
        op.create_index("ix_wallet_ledger_user_id", "wallet_ledger", ["user_id"], unique=False, schema=schema)
        op.create_index("ix_wallet_ledger_operator_user_id", "wallet_ledger", ["operator_user_id"], unique=False, schema=schema)
        op.create_index("ix_wallet_ledger_event_type", "wallet_ledger", ["event_type"], unique=False, schema=schema)
        op.create_index("ix_wallet_ledger_lesson_id", "wallet_ledger", ["lesson_id"], unique=False, schema=schema)
        op.create_index("ix_wallet_ledger_created_at", "wallet_ledger", ["created_at"], unique=False, schema=schema)

    if not _has_table("billing_model_rates", schema):
        op.create_table(
            "billing_model_rates",
            sa.Column("model_name", sa.String(length=100), primary_key=True),
            sa.Column("points_per_minute", sa.Integer(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("updated_by_user_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}users.id"), nullable=True),
            sa.CheckConstraint("points_per_minute > 0", name="ck_billing_rate_positive"),
            schema=schema,
        )


def downgrade() -> None:
    schema = _schema_name()
    if _has_table("billing_model_rates", schema):
        op.drop_table("billing_model_rates", schema=schema)
    if _has_table("wallet_ledger", schema):
        op.drop_table("wallet_ledger", schema=schema)
    if _has_table("wallet_accounts", schema):
        op.drop_table("wallet_accounts", schema=schema)
    if _has_table("media_assets", schema):
        op.drop_table("media_assets", schema=schema)
    if _has_table("lesson_progress", schema):
        op.drop_table("lesson_progress", schema=schema)
    if _has_table("lesson_sentences", schema):
        op.drop_table("lesson_sentences", schema=schema)
    if _has_table("lessons", schema):
        op.drop_table("lessons", schema=schema)
    if _has_table("users", schema):
        op.drop_table("users", schema=schema)
