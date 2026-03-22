"""add wordbook storage

Revision ID: 20260322_0027
Revises: 20260322_0026
Create Date: 2026-03-22 20:45:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260322_0027"
down_revision = "20260322_0026"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _has_table(table_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return bool(inspector.has_table(table_name, schema=schema))


def upgrade() -> None:
    schema = _schema_name()

    if not _has_table("wordbook_entries", schema):
        op.create_table(
            "wordbook_entries",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("latest_lesson_id", sa.Integer(), nullable=True),
            sa.Column("entry_text", sa.String(length=255), nullable=False),
            sa.Column("normalized_text", sa.String(length=255), nullable=False),
            sa.Column("entry_type", sa.String(length=16), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
            sa.Column("latest_sentence_idx", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("latest_sentence_en", sa.String(length=1200), nullable=False, server_default=""),
            sa.Column("latest_sentence_zh", sa.String(length=1200), nullable=False, server_default=""),
            sa.Column("latest_collected_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["user_id"], [f"{APP_SCHEMA}.users.id" if schema else "users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["latest_lesson_id"], [f"{APP_SCHEMA}.lessons.id" if schema else "lessons.id"], ondelete="SET NULL"),
            sa.UniqueConstraint("user_id", "normalized_text", "entry_type", name="uq_wordbook_entry_user_text_type"),
            schema=schema,
        )
        op.create_index(op.f("ix_wordbook_entries_user_id"), "wordbook_entries", ["user_id"], unique=False, schema=schema)
        op.create_index(op.f("ix_wordbook_entries_latest_lesson_id"), "wordbook_entries", ["latest_lesson_id"], unique=False, schema=schema)
        op.create_index(op.f("ix_wordbook_entries_status"), "wordbook_entries", ["status"], unique=False, schema=schema)
        op.create_index(op.f("ix_wordbook_entries_latest_collected_at"), "wordbook_entries", ["latest_collected_at"], unique=False, schema=schema)
        op.create_index(
            "ix_wordbook_entries_user_status_collected_at",
            "wordbook_entries",
            ["user_id", "status", "latest_collected_at"],
            unique=False,
            schema=schema,
        )

    if not _has_table("wordbook_entry_sources", schema):
        op.create_table(
            "wordbook_entry_sources",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("entry_id", sa.Integer(), nullable=False),
            sa.Column("lesson_id", sa.Integer(), nullable=False),
            sa.Column("sentence_idx", sa.Integer(), nullable=False),
            sa.Column("sentence_en", sa.String(length=1200), nullable=False, server_default=""),
            sa.Column("sentence_zh", sa.String(length=1200), nullable=False, server_default=""),
            sa.Column("first_collected_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("last_collected_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["entry_id"], [f"{APP_SCHEMA}.wordbook_entries.id" if schema else "wordbook_entries.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["lesson_id"], [f"{APP_SCHEMA}.lessons.id" if schema else "lessons.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("entry_id", "lesson_id", "sentence_idx", name="uq_wordbook_entry_source_context"),
            schema=schema,
        )
        op.create_index(op.f("ix_wordbook_entry_sources_entry_id"), "wordbook_entry_sources", ["entry_id"], unique=False, schema=schema)
        op.create_index(op.f("ix_wordbook_entry_sources_last_collected_at"), "wordbook_entry_sources", ["last_collected_at"], unique=False, schema=schema)
        op.create_index("ix_wordbook_entry_sources_lesson_id", "wordbook_entry_sources", ["lesson_id"], unique=False, schema=schema)
        op.create_index(
            "ix_wordbook_entry_sources_entry_collected_at",
            "wordbook_entry_sources",
            ["entry_id", "last_collected_at"],
            unique=False,
            schema=schema,
        )


def downgrade() -> None:
    schema = _schema_name()
    if _has_table("wordbook_entry_sources", schema):
        op.drop_table("wordbook_entry_sources", schema=schema)
    if _has_table("wordbook_entries", schema):
        op.drop_table("wordbook_entries", schema=schema)
