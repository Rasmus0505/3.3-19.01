"""repair lesson generation task table when missing

Revision ID: 20260310_0014
Revises: 20260310_0013
Create Date: 2026-03-10 21:03:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260310_0014"
down_revision = "20260310_0013"
branch_labels = None
depends_on = None

TABLE_NAME = "lesson_generation_tasks"


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


def _has_index(table_name: str, index_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = {str(item.get("name") or "") for item in inspector.get_indexes(table_name, schema=schema)}
    return index_name in indexes


def _create_task_table(schema: str | None) -> None:
    op.create_table(
        TABLE_NAME,
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.String(length=80), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=True),
        sa.Column("source_filename", sa.String(length=255), nullable=False),
        sa.Column("asr_model", sa.String(length=100), nullable=False),
        sa.Column("semantic_split_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("overall_percent", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("current_text", sa.String(length=255), nullable=False, server_default="等待处理"),
        sa.Column("stages_json", sa.JSON(), nullable=False),
        sa.Column("counters_json", sa.JSON(), nullable=False),
        sa.Column("translation_debug_json", sa.JSON(), nullable=True),
        sa.Column("failure_debug_json", sa.JSON(), nullable=True),
        sa.Column("subtitle_cache_seed_json", sa.JSON(), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=False, server_default=sa.text("''")),
        sa.Column("message", sa.String(length=1200), nullable=False, server_default=sa.text("''")),
        sa.Column("resume_available", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("resume_stage", sa.String(length=32), nullable=False, server_default=sa.text("''")),
        sa.Column("work_dir", sa.String(length=500), nullable=False),
        sa.Column("source_path", sa.String(length=500), nullable=False),
        sa.Column("artifacts_json", sa.JSON(), nullable=False),
        sa.Column("artifact_expires_at", sa.DateTime(), nullable=True),
        sa.Column("failed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["lesson_id"], [f"{schema}.lessons.id"] if schema else ["lessons.id"]),
        sa.ForeignKeyConstraint(["owner_user_id"], [f"{schema}.users.id"] if schema else ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema=schema,
    )


def _ensure_task_indexes(schema: str | None) -> None:
    index_specs: tuple[tuple[str, list[str], bool], ...] = (
        (op.f("ix_lesson_generation_tasks_task_id"), ["task_id"], True),
        (op.f("ix_lesson_generation_tasks_owner_user_id"), ["owner_user_id"], False),
        (op.f("ix_lesson_generation_tasks_lesson_id"), ["lesson_id"], False),
    )
    for index_name, columns, unique in index_specs:
        if not _has_index(TABLE_NAME, index_name, schema):
            op.create_index(index_name, TABLE_NAME, columns, unique=unique, schema=schema)


def _ensure_failure_columns(schema: str | None) -> None:
    with op.batch_alter_table(TABLE_NAME, schema=schema) as batch_op:
        if not _has_column(TABLE_NAME, "failure_debug_json", schema):
            batch_op.add_column(sa.Column("failure_debug_json", sa.JSON(), nullable=True))
        if not _has_column(TABLE_NAME, "failed_at", schema):
            batch_op.add_column(sa.Column("failed_at", sa.DateTime(), nullable=True))


def upgrade() -> None:
    schema = _schema_name()
    if not _has_table(TABLE_NAME, schema):
        _create_task_table(schema)
    _ensure_failure_columns(schema)
    _ensure_task_indexes(schema)


def downgrade() -> None:
    # Repair migration only. Keep schema unchanged on downgrade to avoid destructive rollback.
    return None
