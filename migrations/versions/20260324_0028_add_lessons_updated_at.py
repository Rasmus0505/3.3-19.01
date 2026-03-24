"""add lessons.updated_at for incremental sync

Revision ID: 20260324_0028
Revises: 20260322_0027
Create Date: 2026-03-24
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260324_0028"
down_revision = "20260322_0027"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _has_column(table_name: str, column_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [col["name"] for col in inspector.get_columns(table_name, schema=schema)]
    return column_name in columns


def upgrade() -> None:
    schema = _schema_name()
    if not _has_column("lessons", "updated_at", schema):
        import sqlalchemy as sa_
        from sqlalchemy import text

        bind = op.get_bind()
        if bind.dialect.name == "sqlite":
            op.add_column(
                "lessons",
                sa_.Column("updated_at", sa_.DateTime(), nullable=True, server_default=text("CURRENT_TIMESTAMP")),
                schema=schema,
            )
            op.execute(text("UPDATE lessons SET updated_at = created_at WHERE updated_at IS NULL"))
            op.alter_column("lessons", "updated_at", nullable=False, existing_type=sa_.DateTime())
        else:
            op.add_column(
                "lessons",
                sa_.Column("updated_at", sa_.DateTime(), nullable=False, server_default=text("CURRENT_TIMESTAMP")),
                schema=schema,
            )
            op.execute(text(f"UPDATE {schema + '.' if schema else ''}lessons SET updated_at = created_at WHERE updated_at IS NULL"))
            op.alter_column("lessons", "updated_at", nullable=False, existing_type=sa_.DateTime(), server_default=None)


def downgrade() -> None:
    schema = _schema_name()
    op.drop_column("lessons", "updated_at", schema=schema)
