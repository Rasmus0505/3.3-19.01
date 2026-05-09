"""add learning_sessions table

Revision ID: add_learning_sessions
Revises: add_reading_packs
Create Date: 2026-05-09
"""

from alembic import op
import sqlalchemy as sa

revision = "add_learning_sessions"
down_revision = "add_reading_packs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "learning_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("lesson_id", sa.Integer(), sa.ForeignKey("lessons.id"), nullable=False, index=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("effective_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("paused_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="active"),
        sa.Column("last_activity_at", sa.DateTime(), nullable=False),
        sa.Column("manual_pause_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("auto_pause_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("title_snapshot", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_learning_sessions_user_started_at", "learning_sessions", ["user_id", "started_at"])
    op.create_index("ix_learning_sessions_user_status", "learning_sessions", ["user_id", "status"])
    op.create_index("ix_learning_sessions_lesson_status", "learning_sessions", ["lesson_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_learning_sessions_lesson_status", table_name="learning_sessions")
    op.drop_index("ix_learning_sessions_user_status", table_name="learning_sessions")
    op.drop_index("ix_learning_sessions_user_started_at", table_name="learning_sessions")
    op.drop_table("learning_sessions")
