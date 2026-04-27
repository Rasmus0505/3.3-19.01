"""rebuild sqlite llm usage logs primary key

Revision ID: 20260418_0048
Revises: 20260418_0047
Create Date: 2026-04-18 23:59:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260418_0048"
down_revision = "20260418_0047"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def upgrade() -> None:
    schema = _schema_name()
    if schema is not None:
        return
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("llm_usage_logs"):
        return
    primary_key_columns = inspector.get_pk_constraint("llm_usage_logs").get("constrained_columns") or []
    if primary_key_columns == ["id"]:
        return
    with op.batch_alter_table("llm_usage_logs", schema=None, recreate="always") as batch_op:
        batch_op.create_primary_key("pk_llm_usage_logs", ["id"])


def downgrade() -> None:
    schema = _schema_name()
    if schema is not None:
        return
