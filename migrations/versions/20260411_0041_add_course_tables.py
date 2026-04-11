"""add course and course scene tables

Revision ID: 20260411_0041
Revises: 20260409_0040
Create Date: 2026-04-11 15:55:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260411_0041"
down_revision = "20260409_0040"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _fk(schema: str | None, table_name: str, column_name: str = "id") -> str:
    if schema:
        return f"{schema}.{table_name}.{column_name}"
    return f"{table_name}.{column_name}"


def upgrade() -> None:
    schema = _schema_name()
    op.create_table(
        "courses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("source_material_hash", sa.String(length=64), nullable=False),
        sa.Column("material_text", sa.Text(), nullable=True),
        sa.Column("cefr_level_original", sa.String(length=10), nullable=False),
        sa.Column("cefr_level_target", sa.String(length=10), nullable=False),
        sa.Column("outline_json", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("scene_count", sa.Integer(), nullable=False),
        sa.Column("models_used_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], [_fk(schema, "users")]),
        sa.PrimaryKeyConstraint("id"),
        schema=schema,
    )
    op.create_index(
        "ix_courses_user_id_created_at",
        "courses",
        ["user_id", "created_at"],
        unique=False,
        schema=schema,
    )

    op.create_table(
        "course_scenes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("idx", sa.Integer(), nullable=False),
        sa.Column("scene_type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content_json", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=True),
        sa.Column("models_used_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], [_fk(schema, "courses")]),
        sa.ForeignKeyConstraint(["lesson_id"], [_fk(schema, "lessons")]),
        sa.PrimaryKeyConstraint("id"),
        schema=schema,
    )
    op.create_index(
        "ix_course_scenes_course_id_idx",
        "course_scenes",
        ["course_id", "idx"],
        unique=False,
        schema=schema,
    )


def downgrade() -> None:
    schema = _schema_name()
    op.drop_index("ix_course_scenes_course_id_idx", table_name="course_scenes", schema=schema)
    op.drop_table("course_scenes", schema=schema)
    op.drop_index("ix_courses_user_id_created_at", table_name="courses", schema=schema)
    op.drop_table("courses", schema=schema)
