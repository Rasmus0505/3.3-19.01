"""add_composite_indexes_lesson_task_wallet

Revision ID: 20260504_0052
Revises: 20260428_0051
Create Date: 2026-05-04 14:03:00.000000
"""
from __future__ import annotations

from alembic import op


revision = "20260504_0052"
down_revision = "20260428_0051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("lesson_generation_tasks") as batch_op:
        batch_op.create_index("ix_lesson_gen_tasks_owner_status", ["owner_user_id", "status"])
        batch_op.create_index("ix_lesson_gen_tasks_status_updated", ["status", "updated_at"])

    with op.batch_alter_table("wallet_ledger") as batch_op:
        batch_op.create_index("ix_wallet_ledger_user_lesson", ["user_id", "lesson_id"])


def downgrade() -> None:
    with op.batch_alter_table("lesson_generation_tasks") as batch_op:
        batch_op.drop_index("ix_lesson_gen_tasks_owner_status")
        batch_op.drop_index("ix_lesson_gen_tasks_status_updated")

    with op.batch_alter_table("wallet_ledger") as batch_op:
        batch_op.drop_index("ix_wallet_ledger_user_lesson")
