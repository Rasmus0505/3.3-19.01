"""remove legacy cefr columns

Revision ID: 20260418_0045
Revises: 20260418_0044
Create Date: 2026-04-18 23:40:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260418_0045"
down_revision = "20260418_0044"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _qualified_table(table_name: str, schema: str | None) -> str:
    return f"{schema}.{table_name}" if schema else table_name


def upgrade() -> None:
    schema = _schema_name()
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    lesson_columns = {str(item.get("name") or "") for item in inspector.get_columns("lessons", schema=schema)}
    sentence_columns = {str(item.get("name") or "") for item in inspector.get_columns("lesson_sentences", schema=schema)}
    user_columns = {str(item.get("name") or "") for item in inspector.get_columns("users", schema=schema)}

    if "user_collins_level" not in lesson_columns:
        op.add_column("lessons", sa.Column("user_collins_level", sa.Integer(), nullable=True), schema=schema)
        lesson_columns.add("user_collins_level")

    if "user_cefr_level" in lesson_columns and "user_collins_level" in lesson_columns:
        op.execute(
            sa.text(
                f"""
                UPDATE {_qualified_table('lessons', schema)}
                SET user_collins_level = CASE UPPER(COALESCE(user_cefr_level, 'B1'))
                    WHEN 'A1' THEN 5
                    WHEN 'A2' THEN 4
                    WHEN 'B1' THEN 3
                    WHEN 'B2' THEN 2
                    WHEN 'C1' THEN 1
                    WHEN 'C2' THEN 1
                    ELSE COALESCE(user_collins_level, 3)
                END
                WHERE user_collins_level IS NULL
                """
            )
        )

    if "cefr_vocab_json" in sentence_columns and "vocabulary_analysis_json" not in sentence_columns:
        op.execute(
            sa.text(
                f"ALTER TABLE {_qualified_table('lesson_sentences', schema)} "
                "RENAME COLUMN cefr_vocab_json TO vocabulary_analysis_json"
            )
        )
        sentence_columns.remove("cefr_vocab_json")
        sentence_columns.add("vocabulary_analysis_json")

    if "cefr_level" in user_columns:
        op.drop_index("ix_users_cefr_level", table_name="users", schema=schema)
        op.drop_column("users", "cefr_level", schema=schema)

    if "user_cefr_level" in lesson_columns:
        op.drop_column("lessons", "user_cefr_level", schema=schema)


def downgrade() -> None:
    schema = _schema_name()
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    lesson_columns = {str(item.get("name") or "") for item in inspector.get_columns("lessons", schema=schema)}
    sentence_columns = {str(item.get("name") or "") for item in inspector.get_columns("lesson_sentences", schema=schema)}
    user_columns = {str(item.get("name") or "") for item in inspector.get_columns("users", schema=schema)}

    if "cefr_level" not in user_columns:
        op.add_column("users", sa.Column("cefr_level", sa.String(length=2), nullable=True, server_default="B1"), schema=schema)
        op.create_index("ix_users_cefr_level", "users", ["cefr_level"], unique=False, schema=schema)
        if schema is not None:
            op.alter_column("users", "cefr_level", server_default=None, schema=schema)

    if "user_cefr_level" not in lesson_columns:
        op.add_column("lessons", sa.Column("user_cefr_level", sa.String(length=10), nullable=True), schema=schema)
        if "user_collins_level" in lesson_columns:
            op.execute(
                sa.text(
                    f"""
                    UPDATE {_qualified_table('lessons', schema)}
                    SET user_cefr_level = CASE COALESCE(user_collins_level, 3)
                        WHEN 5 THEN 'A1'
                        WHEN 4 THEN 'A2'
                        WHEN 3 THEN 'B1'
                        WHEN 2 THEN 'B2'
                        WHEN 1 THEN 'C1'
                        ELSE 'B1'
                    END
                    WHERE user_cefr_level IS NULL
                    """
                )
            )

    if "vocabulary_analysis_json" in sentence_columns and "cefr_vocab_json" not in sentence_columns:
        op.execute(
            sa.text(
                f"ALTER TABLE {_qualified_table('lesson_sentences', schema)} "
                "RENAME COLUMN vocabulary_analysis_json TO cefr_vocab_json"
            )
        )

    if "user_collins_level" in lesson_columns:
        op.drop_column("lessons", "user_collins_level", schema=schema)
