"""add billing rate yuan columns

Revision ID: 20260418_0047
Revises: 20260418_0046
Create Date: 2026-04-18 23:58:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260418_0047"
down_revision = "20260418_0046"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _qualified_table(table_name: str, schema: str | None) -> str:
    return f"{schema}.{table_name}" if schema else table_name


def upgrade() -> None:
    schema = _schema_name()
    inspector = sa.inspect(op.get_bind())
    existing_columns = {column["name"] for column in inspector.get_columns("billing_model_rates", schema=schema)}

    with op.batch_alter_table("billing_model_rates", schema=schema) as batch_op:
        if "price_per_minute_yuan" not in existing_columns:
            batch_op.add_column(sa.Column("price_per_minute_yuan", sa.Numeric(12, 4), nullable=False, server_default="0.0000"))
        if "cost_per_minute_yuan" not in existing_columns:
            batch_op.add_column(sa.Column("cost_per_minute_yuan", sa.Numeric(12, 4), nullable=False, server_default="0.0000"))

    table_name = _qualified_table("billing_model_rates", schema)
    op.execute(
        sa.text(
            f"""
            UPDATE {table_name}
            SET
                price_per_minute_yuan = CASE
                    WHEN COALESCE(price_per_minute_yuan, 0) = 0 THEN COALESCE(points_per_minute, 0) / 100.0
                    ELSE price_per_minute_yuan
                END,
                cost_per_minute_yuan = CASE
                    WHEN COALESCE(cost_per_minute_yuan, 0) = 0 THEN COALESCE(cost_per_minute_cents, 0) / 100.0
                    ELSE cost_per_minute_yuan
                END
            """
        )
    )


def downgrade() -> None:
    schema = _schema_name()
    inspector = sa.inspect(op.get_bind())
    existing_columns = {column["name"] for column in inspector.get_columns("billing_model_rates", schema=schema)}
    with op.batch_alter_table("billing_model_rates", schema=schema) as batch_op:
        if "cost_per_minute_yuan" in existing_columns:
            batch_op.drop_column("cost_per_minute_yuan")
        if "price_per_minute_yuan" in existing_columns:
            batch_op.drop_column("price_per_minute_yuan")
