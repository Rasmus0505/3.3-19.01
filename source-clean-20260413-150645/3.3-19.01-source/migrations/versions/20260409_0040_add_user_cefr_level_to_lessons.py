"""add_user_cefr_level_to_lessons

Revision ID: 20260409_0040
Revises: 20260408_0039
Create Date: 2026-04-09
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260409_0040"
down_revision = "20260408_0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lessons",
        sa.Column("user_cefr_level", sa.String(10), nullable=True, comment="用户生成课程时的CEFR等级"),
        schema="app",
    )
    # 为已有的 lesson 生成任务补充历史数据（通过关联 task 查找 owner 的 cefr_level）
    # 但由于 task 和 lesson 不是强关联，这里只加字段，历史数据留空


def downgrade() -> None:
    op.drop_column("lessons", "user_cefr_level", schema="app")
