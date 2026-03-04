"""add redeem code tables and wallet ledger extensions

Revision ID: 20260304_0002
Revises: 20260304_0001
Create Date: 2026-03-04 18:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260304_0002"
down_revision = "20260304_0001"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else "app"


def _dialect_name() -> str:
    return op.get_bind().dialect.name


def _qualified_table(table_name: str, schema: str | None) -> str:
    return f"{schema}.{table_name}" if schema else table_name


def _has_table(table_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return inspector.has_table(table_name, schema=schema)


def _has_column(table_name: str, column_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        return False
    columns = inspector.get_columns(table_name, schema=schema)
    return any(col.get("name") == column_name for col in columns)


def _has_index(table_name: str, index_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        return False
    indexes = inspector.get_indexes(table_name, schema=schema)
    return any(idx.get("name") == index_name for idx in indexes)


def _has_check_constraint(table_name: str, constraint_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        return False
    checks = inspector.get_check_constraints(table_name, schema=schema)
    return any(item.get("name") == constraint_name for item in checks)


def upgrade() -> None:
    schema = _schema_name()
    if schema:
        op.execute("CREATE SCHEMA IF NOT EXISTS app")

    if not _has_table("redeem_code_batches", schema):
        op.create_table(
            "redeem_code_batches",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("batch_name", sa.String(length=120), nullable=False),
            sa.Column("face_value_points", sa.Integer(), nullable=False),
            sa.Column("generated_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("active_from", sa.DateTime(), nullable=False),
            sa.Column("expire_at", sa.DateTime(), nullable=False),
            sa.Column("daily_limit_per_user", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
            sa.Column("remark", sa.Text(), nullable=False, server_default=""),
            sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.CheckConstraint("face_value_points > 0", name="ck_redeem_batch_face_value_positive"),
            sa.CheckConstraint("generated_count >= 0", name="ck_redeem_batch_generated_count_non_negative"),
            sa.CheckConstraint("status IN ('active','paused','expired')", name="ck_redeem_batch_status"),
            sa.CheckConstraint("daily_limit_per_user IS NULL OR daily_limit_per_user > 0", name="ck_redeem_batch_daily_limit_positive"),
            sa.CheckConstraint("expire_at > active_from", name="ck_redeem_batch_time_range"),
            schema=schema,
        )

    if not _has_index("redeem_code_batches", "ix_redeem_code_batches_batch_name", schema):
        op.create_index("ix_redeem_code_batches_batch_name", "redeem_code_batches", ["batch_name"], unique=False, schema=schema)
    if not _has_index("redeem_code_batches", "ix_redeem_code_batches_status", schema):
        op.create_index("ix_redeem_code_batches_status", "redeem_code_batches", ["status"], unique=False, schema=schema)
    if not _has_index("redeem_code_batches", "ix_redeem_code_batches_active_from", schema):
        op.create_index("ix_redeem_code_batches_active_from", "redeem_code_batches", ["active_from"], unique=False, schema=schema)
    if not _has_index("redeem_code_batches", "ix_redeem_code_batches_expire_at", schema):
        op.create_index("ix_redeem_code_batches_expire_at", "redeem_code_batches", ["expire_at"], unique=False, schema=schema)
    if not _has_index("redeem_code_batches", "ix_redeem_code_batches_created_by_user_id", schema):
        op.create_index("ix_redeem_code_batches_created_by_user_id", "redeem_code_batches", ["created_by_user_id"], unique=False, schema=schema)
    if not _has_index("redeem_code_batches", "ix_redeem_code_batches_created_at", schema):
        op.create_index("ix_redeem_code_batches_created_at", "redeem_code_batches", ["created_at"], unique=False, schema=schema)

    if not _has_table("redeem_codes", schema):
        op.create_table(
            "redeem_codes",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("batch_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}redeem_code_batches.id", ondelete="CASCADE"), nullable=False),
            sa.Column("code_plain", sa.String(length=64), nullable=False),
            sa.Column("code_hash", sa.String(length=64), nullable=False),
            sa.Column("masked_code", sa.String(length=32), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
            sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("redeemed_by_user_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("redeemed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.CheckConstraint("status IN ('active','disabled','abandoned','redeemed')", name="ck_redeem_code_status"),
            sa.UniqueConstraint("code_plain", name="uq_redeem_code_plain"),
            sa.UniqueConstraint("code_hash", name="uq_redeem_code_hash"),
            schema=schema,
        )

    if not _has_index("redeem_codes", "ix_redeem_codes_batch_id", schema):
        op.create_index("ix_redeem_codes_batch_id", "redeem_codes", ["batch_id"], unique=False, schema=schema)
    if not _has_index("redeem_codes", "ix_redeem_codes_code_hash", schema):
        op.create_index("ix_redeem_codes_code_hash", "redeem_codes", ["code_hash"], unique=False, schema=schema)
    if not _has_index("redeem_codes", "ix_redeem_codes_status", schema):
        op.create_index("ix_redeem_codes_status", "redeem_codes", ["status"], unique=False, schema=schema)
    if not _has_index("redeem_codes", "ix_redeem_codes_created_by_user_id", schema):
        op.create_index("ix_redeem_codes_created_by_user_id", "redeem_codes", ["created_by_user_id"], unique=False, schema=schema)
    if not _has_index("redeem_codes", "ix_redeem_codes_redeemed_by_user_id", schema):
        op.create_index("ix_redeem_codes_redeemed_by_user_id", "redeem_codes", ["redeemed_by_user_id"], unique=False, schema=schema)
    if not _has_index("redeem_codes", "ix_redeem_codes_redeemed_at", schema):
        op.create_index("ix_redeem_codes_redeemed_at", "redeem_codes", ["redeemed_at"], unique=False, schema=schema)
    if not _has_index("redeem_codes", "ix_redeem_codes_created_at", schema):
        op.create_index("ix_redeem_codes_created_at", "redeem_codes", ["created_at"], unique=False, schema=schema)

    if not _has_table("redeem_code_attempts", schema):
        op.create_table(
            "redeem_code_attempts",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("batch_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}redeem_code_batches.id", ondelete="SET NULL"), nullable=True),
            sa.Column("code_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}redeem_codes.id", ondelete="SET NULL"), nullable=True),
            sa.Column("code_mask", sa.String(length=32), nullable=False, server_default=""),
            sa.Column("success", sa.Boolean(), nullable=False),
            sa.Column("failure_reason", sa.String(length=64), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            schema=schema,
        )

    if not _has_index("redeem_code_attempts", "ix_redeem_code_attempts_user_id", schema):
        op.create_index("ix_redeem_code_attempts_user_id", "redeem_code_attempts", ["user_id"], unique=False, schema=schema)
    if not _has_index("redeem_code_attempts", "ix_redeem_code_attempts_batch_id", schema):
        op.create_index("ix_redeem_code_attempts_batch_id", "redeem_code_attempts", ["batch_id"], unique=False, schema=schema)
    if not _has_index("redeem_code_attempts", "ix_redeem_code_attempts_code_id", schema):
        op.create_index("ix_redeem_code_attempts_code_id", "redeem_code_attempts", ["code_id"], unique=False, schema=schema)
    if not _has_index("redeem_code_attempts", "ix_redeem_code_attempts_success", schema):
        op.create_index("ix_redeem_code_attempts_success", "redeem_code_attempts", ["success"], unique=False, schema=schema)
    if not _has_index("redeem_code_attempts", "ix_redeem_code_attempts_created_at", schema):
        op.create_index("ix_redeem_code_attempts_created_at", "redeem_code_attempts", ["created_at"], unique=False, schema=schema)

    if not _has_table("admin_operation_logs", schema):
        op.create_table(
            "admin_operation_logs",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("operator_user_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("action_type", sa.String(length=64), nullable=False),
            sa.Column("target_type", sa.String(length=64), nullable=False),
            sa.Column("target_id", sa.String(length=64), nullable=False, server_default=""),
            sa.Column("before_value", sa.Text(), nullable=False, server_default=""),
            sa.Column("after_value", sa.Text(), nullable=False, server_default=""),
            sa.Column("note", sa.Text(), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            schema=schema,
        )

    if not _has_index("admin_operation_logs", "ix_admin_operation_logs_operator_user_id", schema):
        op.create_index("ix_admin_operation_logs_operator_user_id", "admin_operation_logs", ["operator_user_id"], unique=False, schema=schema)
    if not _has_index("admin_operation_logs", "ix_admin_operation_logs_action_type", schema):
        op.create_index("ix_admin_operation_logs_action_type", "admin_operation_logs", ["action_type"], unique=False, schema=schema)
    if not _has_index("admin_operation_logs", "ix_admin_operation_logs_target_type", schema):
        op.create_index("ix_admin_operation_logs_target_type", "admin_operation_logs", ["target_type"], unique=False, schema=schema)
    if not _has_index("admin_operation_logs", "ix_admin_operation_logs_target_id", schema):
        op.create_index("ix_admin_operation_logs_target_id", "admin_operation_logs", ["target_id"], unique=False, schema=schema)
    if not _has_index("admin_operation_logs", "ix_admin_operation_logs_created_at", schema):
        op.create_index("ix_admin_operation_logs_created_at", "admin_operation_logs", ["created_at"], unique=False, schema=schema)

    if _has_table("wallet_ledger", schema):
        if not _has_column("wallet_ledger", "redeem_batch_id", schema):
            op.add_column(
                "wallet_ledger",
                sa.Column("redeem_batch_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}redeem_code_batches.id", ondelete="SET NULL"), nullable=True),
                schema=schema,
            )
        if not _has_column("wallet_ledger", "redeem_code_id", schema):
            op.add_column(
                "wallet_ledger",
                sa.Column("redeem_code_id", sa.Integer(), sa.ForeignKey(f"{schema + '.' if schema else ''}redeem_codes.id", ondelete="SET NULL"), nullable=True),
                schema=schema,
            )
        if not _has_column("wallet_ledger", "redeem_code_mask", schema):
            op.add_column("wallet_ledger", sa.Column("redeem_code_mask", sa.String(length=32), nullable=True), schema=schema)

        if not _has_index("wallet_ledger", "ix_wallet_ledger_redeem_batch_id", schema):
            op.create_index("ix_wallet_ledger_redeem_batch_id", "wallet_ledger", ["redeem_batch_id"], unique=False, schema=schema)
        if not _has_index("wallet_ledger", "ix_wallet_ledger_redeem_code_id", schema):
            op.create_index("ix_wallet_ledger_redeem_code_id", "wallet_ledger", ["redeem_code_id"], unique=False, schema=schema)

        if _dialect_name() == "postgresql":
            q_wallet_ledger = _qualified_table("wallet_ledger", schema)
            op.execute(f"ALTER TABLE {q_wallet_ledger} DROP CONSTRAINT IF EXISTS ck_wallet_ledger_event_type")
            op.execute(
                f"ALTER TABLE {q_wallet_ledger} ADD CONSTRAINT ck_wallet_ledger_event_type "
                f"CHECK (event_type IN ('reserve','consume','refund','manual_adjust','redeem_code'))"
            )


def downgrade() -> None:
    schema = _schema_name()

    if _has_table("wallet_ledger", schema):
        if _dialect_name() == "postgresql":
            q_wallet_ledger = _qualified_table("wallet_ledger", schema)
            op.execute(f"ALTER TABLE {q_wallet_ledger} DROP CONSTRAINT IF EXISTS ck_wallet_ledger_event_type")
            op.execute(
                f"ALTER TABLE {q_wallet_ledger} ADD CONSTRAINT ck_wallet_ledger_event_type "
                f"CHECK (event_type IN ('reserve','consume','refund','manual_adjust'))"
            )

        if _has_index("wallet_ledger", "ix_wallet_ledger_redeem_code_id", schema):
            op.drop_index("ix_wallet_ledger_redeem_code_id", table_name="wallet_ledger", schema=schema)
        if _has_index("wallet_ledger", "ix_wallet_ledger_redeem_batch_id", schema):
            op.drop_index("ix_wallet_ledger_redeem_batch_id", table_name="wallet_ledger", schema=schema)

        if _has_column("wallet_ledger", "redeem_code_mask", schema):
            op.drop_column("wallet_ledger", "redeem_code_mask", schema=schema)
        if _has_column("wallet_ledger", "redeem_code_id", schema):
            op.drop_column("wallet_ledger", "redeem_code_id", schema=schema)
        if _has_column("wallet_ledger", "redeem_batch_id", schema):
            op.drop_column("wallet_ledger", "redeem_batch_id", schema=schema)

    if _has_table("admin_operation_logs", schema):
        op.drop_table("admin_operation_logs", schema=schema)
    if _has_table("redeem_code_attempts", schema):
        op.drop_table("redeem_code_attempts", schema=schema)
    if _has_table("redeem_codes", schema):
        op.drop_table("redeem_codes", schema=schema)
    if _has_table("redeem_code_batches", schema):
        op.drop_table("redeem_code_batches", schema=schema)
