"""repair admin raw debug columns when revision 0017 was already stamped

Revision ID: 20260314_0018
Revises: 20260311_0017
Create Date: 2026-03-14 18:58:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260314_0018"
down_revision = "20260311_0017"
branch_labels = None
depends_on = None

LESSON_TASK_TABLE = "lesson_generation_tasks"
TRANSLATION_LOG_TABLE = "translation_request_logs"


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
    columns = {str(item.get("name") or "") for item in inspector.get_columns(table_name, schema=schema)}
    return column_name in columns


def upgrade() -> None:
    schema = _schema_name()

    if _has_table(LESSON_TASK_TABLE, schema):
        with op.batch_alter_table(LESSON_TASK_TABLE, schema=schema) as batch_op:
            if not _has_column(LESSON_TASK_TABLE, "asr_raw_json", schema):
                batch_op.add_column(sa.Column("asr_raw_json", sa.JSON(), nullable=True))
            if not _has_column(LESSON_TASK_TABLE, "raw_debug_purged_at", schema):
                batch_op.add_column(sa.Column("raw_debug_purged_at", sa.DateTime(), nullable=True))

    if _has_table(TRANSLATION_LOG_TABLE, schema):
        with op.batch_alter_table(TRANSLATION_LOG_TABLE, schema=schema) as batch_op:
            if not _has_column(TRANSLATION_LOG_TABLE, "raw_request_text", schema):
                batch_op.add_column(sa.Column("raw_request_text", sa.Text(), nullable=False, server_default=sa.text("''")))
            if not _has_column(TRANSLATION_LOG_TABLE, "raw_response_text", schema):
                batch_op.add_column(sa.Column("raw_response_text", sa.Text(), nullable=False, server_default=sa.text("''")))
            if not _has_column(TRANSLATION_LOG_TABLE, "raw_error_text", schema):
                batch_op.add_column(sa.Column("raw_error_text", sa.Text(), nullable=False, server_default=sa.text("''")))


def downgrade() -> None:
    return None
