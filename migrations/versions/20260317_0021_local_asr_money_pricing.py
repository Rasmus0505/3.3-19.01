"""add local asr money pricing helpers

Revision ID: 20260317_0021
Revises: 20260317_0020
Create Date: 2026-03-17 19:30:00
"""

from __future__ import annotations

from datetime import datetime

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260317_0021"
down_revision = "20260317_0020"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _has_table(table_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return bool(inspector.has_table(table_name, schema=schema))


def _has_column(table_name: str, column_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        return False
    return column_name in {str(item.get("name") or "").strip() for item in inspector.get_columns(table_name, schema=schema)}


def upgrade() -> None:
    schema = _schema_name()
    now = datetime.utcnow()

    if _has_table("billing_model_rates", schema) and not _has_column("billing_model_rates", "cost_per_minute_cents", schema):
        with op.batch_alter_table("billing_model_rates", schema=schema) as batch_op:
            batch_op.add_column(sa.Column("cost_per_minute_cents", sa.Integer(), nullable=False, server_default="0"))

    if _has_table("wallet_ledger", schema) and not _has_column("wallet_ledger", "amount_unit", schema):
        with op.batch_alter_table("wallet_ledger", schema=schema) as batch_op:
            batch_op.add_column(sa.Column("amount_unit", sa.String(length=16), nullable=False, server_default="points"))

    if _has_table("redeem_code_batches", schema) and not _has_column("redeem_code_batches", "face_value_unit", schema):
        with op.batch_alter_table("redeem_code_batches", schema=schema) as batch_op:
            batch_op.add_column(sa.Column("face_value_unit", sa.String(length=16), nullable=False, server_default="points"))

    if _has_table("wallet_accounts", schema):
        table_name = f"{schema}.wallet_accounts" if schema else "wallet_accounts"
        op.execute(sa.text(f"UPDATE {table_name} SET balance_points = 0"))

    if _has_table("redeem_codes", schema):
        table_name = f"{schema}.redeem_codes" if schema else "redeem_codes"
        op.execute(
            sa.text(
                f"""
                UPDATE {table_name}
                SET status = 'abandoned'
                WHERE status IN ('active', 'disabled')
                """
            )
        )

    if _has_table("redeem_code_batches", schema):
        table_name = f"{schema}.redeem_code_batches" if schema else "redeem_code_batches"
        op.execute(
            sa.text(
                f"""
                UPDATE {table_name}
                SET status = 'expired',
                    expire_at = :now
                WHERE status IN ('active', 'paused')
                """
            ).bindparams(now=now)
        )


def downgrade() -> None:
    return None
