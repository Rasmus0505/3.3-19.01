"""add wordbook review fields

Revision ID: 20260328_0031
Revises: 20260328_0030
Create Date: 2026-03-28 21:10:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260328_0031"
down_revision = "20260328_0030"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _has_column(table_name: str, column_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        return False
    return column_name in {column.get("name") for column in inspector.get_columns(table_name, schema=schema)}


def upgrade() -> None:
    schema = _schema_name()
    with op.batch_alter_table("wordbook_entries", schema=schema) as batch_op:
        if not _has_column("wordbook_entries", "next_review_at", schema):
            batch_op.add_column(sa.Column("next_review_at", sa.DateTime(), nullable=True))
        if not _has_column("wordbook_entries", "last_reviewed_at", schema):
            batch_op.add_column(sa.Column("last_reviewed_at", sa.DateTime(), nullable=True))
        if not _has_column("wordbook_entries", "review_count", schema):
            batch_op.add_column(sa.Column("review_count", sa.Integer(), nullable=True))
        if not _has_column("wordbook_entries", "wrong_count", schema):
            batch_op.add_column(sa.Column("wrong_count", sa.Integer(), nullable=True))
        if not _has_column("wordbook_entries", "memory_score", schema):
            batch_op.add_column(sa.Column("memory_score", sa.Float(), nullable=True))

    entries_table = sa.table(
        "wordbook_entries",
        sa.column("id", sa.Integer()),
        sa.column("next_review_at", sa.DateTime()),
        sa.column("review_count", sa.Integer()),
        sa.column("wrong_count", sa.Integer()),
        sa.column("memory_score", sa.Float()),
        schema=schema,
    )
    bind = op.get_bind()
    now_sql = sa.text("CURRENT_TIMESTAMP")
    bind.execute(
        entries_table.update()
        .where(entries_table.c.next_review_at.is_(None))
        .values(next_review_at=now_sql)
    )
    bind.execute(
        entries_table.update()
        .where(entries_table.c.review_count.is_(None))
        .values(review_count=0)
    )
    bind.execute(
        entries_table.update()
        .where(entries_table.c.wrong_count.is_(None))
        .values(wrong_count=0)
    )
    bind.execute(
        entries_table.update()
        .where(entries_table.c.memory_score.is_(None))
        .values(memory_score=0.35)
    )

    with op.batch_alter_table("wordbook_entries", schema=schema) as batch_op:
        batch_op.alter_column("next_review_at", existing_type=sa.DateTime(), nullable=False)
        batch_op.alter_column("review_count", existing_type=sa.Integer(), nullable=False)
        batch_op.alter_column("wrong_count", existing_type=sa.Integer(), nullable=False)
        batch_op.alter_column("memory_score", existing_type=sa.Float(), nullable=False)


def downgrade() -> None:
    schema = _schema_name()
    with op.batch_alter_table("wordbook_entries", schema=schema) as batch_op:
        if _has_column("wordbook_entries", "memory_score", schema):
            batch_op.drop_column("memory_score")
        if _has_column("wordbook_entries", "wrong_count", schema):
            batch_op.drop_column("wrong_count")
        if _has_column("wordbook_entries", "review_count", schema):
            batch_op.drop_column("review_count")
        if _has_column("wordbook_entries", "last_reviewed_at", schema):
            batch_op.drop_column("last_reviewed_at")
        if _has_column("wordbook_entries", "next_review_at", schema):
            batch_op.drop_column("next_review_at")
