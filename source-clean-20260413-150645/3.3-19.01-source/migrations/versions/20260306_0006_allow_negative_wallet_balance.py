"""wallet accounts: allow negative balance for settlement

Revision ID: 20260306_0006
Revises: 20260306_0005
Create Date: 2026-03-06 19:24:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260306_0006"
down_revision = "20260306_0005"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def upgrade() -> None:
    schema = _schema_name()
    try:
        with op.batch_alter_table("wallet_accounts", schema=schema) as batch_op:
            batch_op.drop_constraint("ck_wallet_balance_non_negative", type_="check")
    except Exception:
        # Legacy sqlite snapshots may not carry a named check constraint.
        pass


def downgrade() -> None:
    schema = _schema_name()
    try:
        with op.batch_alter_table("wallet_accounts", schema=schema) as batch_op:
            batch_op.create_check_constraint("ck_wallet_balance_non_negative", "balance_points >= 0")
    except Exception:
        pass
