"""add user collins level

Revision ID: 20260418_0044
Revises: 20260418_0043
Create Date: 2026-04-18 18:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260418_0044"
down_revision = "20260418_0043"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def upgrade() -> None:
    schema = _schema_name()
    is_sqlite = schema is None
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {str(item.get("name") or "") for item in inspector.get_columns("users", schema=schema)}
    if "collins_level" not in existing_columns:
        op.add_column(
            "users",
            sa.Column("collins_level", sa.Integer(), nullable=False, server_default="3"),
            schema=schema,
        )
        op.create_index("ix_users_collins_level", "users", ["collins_level"], unique=False, schema=schema)

    if schema:
        op.execute(
            sa.text(
                """
                UPDATE app.users
                SET collins_level = CASE UPPER(COALESCE(cefr_level, 'B1'))
                    WHEN 'A1' THEN 5
                    WHEN 'A2' THEN 4
                    WHEN 'B1' THEN 3
                    WHEN 'B2' THEN 2
                    WHEN 'C1' THEN 1
                    WHEN 'C2' THEN 1
                    ELSE 3
                END
                """
            )
        )
    else:
        op.execute(
            sa.text(
                """
                UPDATE users
                SET collins_level = CASE UPPER(COALESCE(cefr_level, 'B1'))
                    WHEN 'A1' THEN 5
                    WHEN 'A2' THEN 4
                    WHEN 'B1' THEN 3
                    WHEN 'B2' THEN 2
                    WHEN 'C1' THEN 1
                    WHEN 'C2' THEN 1
                    ELSE 3
                END
                """
            )
        )

    if not is_sqlite:
        op.alter_column("users", "collins_level", server_default=None, schema=schema)


def downgrade() -> None:
    schema = _schema_name()
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {str(item.get("name") or "") for item in inspector.get_columns("users", schema=schema)}
    if "collins_level" in existing_columns:
        op.drop_index("ix_users_collins_level", table_name="users", schema=schema)
        op.drop_column("users", "collins_level", schema=schema)
