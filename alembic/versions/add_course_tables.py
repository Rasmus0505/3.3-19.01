"""add courses and course_scenes tables

Revision ID: add_course_tables
Revises:
Create Date: 2026-04-11
"""

from alembic import op
import sqlalchemy as sa

revision = "add_course_tables"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "courses",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("app.users.id"), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("source_material_hash", sa.String(64), nullable=False, server_default=""),
        sa.Column("cefr_level_original", sa.String(10), nullable=False, server_default=""),
        sa.Column("cefr_level_target", sa.String(10), nullable=False, server_default=""),
        sa.Column("outline_json", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("scene_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("models_used_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Index("ix_courses_user_id_created_at", "user_id", "created_at"),
        schema="app",
    )

    op.create_table(
        "course_scenes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("app.courses.id"), nullable=False, index=True),
        sa.Column("idx", sa.Integer(), nullable=False),
        sa.Column("scene_type", sa.String(32), nullable=False),
        sa.Column("title", sa.String(255), nullable=False, server_default=""),
        sa.Column("content_json", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("lesson_id", sa.Integer(), sa.ForeignKey("app.lessons.id"), nullable=True),
        sa.Column("models_used_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Index("ix_course_scenes_course_id_idx", "course_id", "idx"),
        schema="app",
    )


def downgrade() -> None:
    op.drop_table("course_scenes", schema="app")
    op.drop_table("courses", schema="app")
