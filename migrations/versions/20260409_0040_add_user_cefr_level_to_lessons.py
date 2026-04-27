"""add_user_cefr_level_to_lessons

Revision ID: 20260409_0040
Revises: 20260408_0039
Create Date: 2026-04-09
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260409_0040"
down_revision = "20260408_0039"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def upgrade() -> None:
    schema = _schema_name()
    op.add_column(
        "lessons",
        sa.Column("user_cefr_level", sa.String(10), nullable=True, comment="用户生成课程时的CEFR等级"),
        schema=schema,
    )
    # 为已有的 lesson 生成任务补充历史数据（通过关联 task 查找 owner 的 cefr_level）
    # 但由于 task 和 lesson 不是强关联，这里只加字段，历史数据留空


def downgrade() -> None:
    schema = _schema_name()
    op.drop_column("lessons", "user_cefr_level", schema=schema)
