"""add local media storage flags and nullable sentence clip path

Revision ID: 20260304_0003
Revises: 20260304_0002
Create Date: 2026-03-04 19:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260304_0003"
down_revision = "20260304_0002"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else "app"


def _dialect_name() -> str:
    return op.get_bind().dialect.name


def _qualified_table(table_name: str, schema: str | None) -> str:
    return f"{schema}.{table_name}" if schema else table_name


def _has_table(table_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return inspector.has_table(table_name, schema=schema)


def _has_column(table_name: str, column_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        return False
    columns = inspector.get_columns(table_name, schema=schema)
    return any(col.get("name") == column_name for col in columns)


def _alter_audio_clip_nullable(schema: str | None, nullable: bool) -> None:
    if not _has_table("lesson_sentences", schema):
        return
    if not _has_column("lesson_sentences", "audio_clip_path", schema):
        return

    if _dialect_name() == "sqlite":
        with op.batch_alter_table("lesson_sentences", schema=schema) as batch_op:
            batch_op.alter_column(
                "audio_clip_path",
                existing_type=sa.String(length=500),
                nullable=nullable,
            )
        return

    op.alter_column(
        "lesson_sentences",
        "audio_clip_path",
        existing_type=sa.String(length=500),
        nullable=nullable,
        schema=schema,
    )


def _ensure_lesson_columns_not_null(schema: str | None) -> None:
    if _dialect_name() == "sqlite":
        with op.batch_alter_table("lessons", schema=schema) as batch_op:
            batch_op.alter_column(
                "media_storage",
                existing_type=sa.String(length=32),
                nullable=False,
                server_default="server",
            )
            batch_op.alter_column(
                "source_duration_ms",
                existing_type=sa.Integer(),
                nullable=False,
                server_default="0",
            )
        return

    op.alter_column(
        "lessons",
        "media_storage",
        existing_type=sa.String(length=32),
        nullable=False,
        server_default="server",
        schema=schema,
    )
    op.alter_column(
        "lessons",
        "source_duration_ms",
        existing_type=sa.Integer(),
        nullable=False,
        server_default="0",
        schema=schema,
    )


def upgrade() -> None:
    schema = _schema_name()
    if schema:
        op.execute("CREATE SCHEMA IF NOT EXISTS app")

    if _has_table("lessons", schema):
        if not _has_column("lessons", "media_storage", schema):
            op.add_column(
                "lessons",
                sa.Column("media_storage", sa.String(length=32), nullable=True, server_default="server"),
                schema=schema,
            )
        if not _has_column("lessons", "source_duration_ms", schema):
            op.add_column(
                "lessons",
                sa.Column("source_duration_ms", sa.Integer(), nullable=True, server_default="0"),
                schema=schema,
            )

        q_lessons = _qualified_table("lessons", schema)
        op.execute(f"UPDATE {q_lessons} SET media_storage = 'server' WHERE media_storage IS NULL")
        op.execute(f"UPDATE {q_lessons} SET source_duration_ms = duration_ms WHERE source_duration_ms IS NULL OR source_duration_ms = 0")
        _ensure_lesson_columns_not_null(schema)

    _alter_audio_clip_nullable(schema, True)


def downgrade() -> None:
    schema = _schema_name()

    if _has_table("lesson_sentences", schema) and _has_column("lesson_sentences", "audio_clip_path", schema):
        q_sentences = _qualified_table("lesson_sentences", schema)
        op.execute(f"UPDATE {q_sentences} SET audio_clip_path = '' WHERE audio_clip_path IS NULL")
        _alter_audio_clip_nullable(schema, False)

    if _has_table("lessons", schema):
        if _has_column("lessons", "source_duration_ms", schema):
            op.drop_column("lessons", "source_duration_ms", schema=schema)
        if _has_column("lessons", "media_storage", schema):
            op.drop_column("lessons", "media_storage", schema=schema)
