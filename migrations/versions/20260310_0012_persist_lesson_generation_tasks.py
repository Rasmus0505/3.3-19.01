"""persist lesson generation tasks

Revision ID: 20260310_0012
Revises: 20260310_0011
Create Date: 2026-03-10 14:55:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260310_0012"
down_revision = "20260310_0011"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def upgrade() -> None:
    schema = _schema_name()
    op.create_table(
        "lesson_generation_tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.String(length=80), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=True),
        sa.Column("source_filename", sa.String(length=255), nullable=False),
        sa.Column("asr_model", sa.String(length=100), nullable=False),
        sa.Column("semantic_split_enabled", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("overall_percent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("current_text", sa.String(length=255), nullable=False, server_default="等待处理"),
        sa.Column("stages_json", sa.JSON(), nullable=False),
        sa.Column("counters_json", sa.JSON(), nullable=False),
        sa.Column("translation_debug_json", sa.JSON(), nullable=True),
        sa.Column("subtitle_cache_seed_json", sa.JSON(), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("message", sa.String(length=1200), nullable=False, server_default=""),
        sa.Column("resume_available", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("resume_stage", sa.String(length=32), nullable=False, server_default=""),
        sa.Column("work_dir", sa.String(length=500), nullable=False),
        sa.Column("source_path", sa.String(length=500), nullable=False),
        sa.Column("artifacts_json", sa.JSON(), nullable=False),
        sa.Column("artifact_expires_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["lesson_id"], [f"{schema}.lessons.id"] if schema else ["lessons.id"]),
        sa.ForeignKeyConstraint(["owner_user_id"], [f"{schema}.users.id"] if schema else ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema=schema,
    )
    op.create_index(
        op.f("ix_lesson_generation_tasks_task_id"),
        "lesson_generation_tasks",
        ["task_id"],
        unique=True,
        schema=schema,
    )
    op.create_index(
        op.f("ix_lesson_generation_tasks_owner_user_id"),
        "lesson_generation_tasks",
        ["owner_user_id"],
        unique=False,
        schema=schema,
    )
    op.create_index(
        op.f("ix_lesson_generation_tasks_lesson_id"),
        "lesson_generation_tasks",
        ["lesson_id"],
        unique=False,
        schema=schema,
    )


def downgrade() -> None:
    schema = _schema_name()
    op.drop_index(op.f("ix_lesson_generation_tasks_lesson_id"), table_name="lesson_generation_tasks", schema=schema)
    op.drop_index(op.f("ix_lesson_generation_tasks_owner_user_id"), table_name="lesson_generation_tasks", schema=schema)
    op.drop_index(op.f("ix_lesson_generation_tasks_task_id"), table_name="lesson_generation_tasks", schema=schema)
    op.drop_table("lesson_generation_tasks", schema=schema)
