"""subtitle settings: add database-driven subtitle config

Revision ID: 20260307_0007
Revises: 20260306_0006
Create Date: 2026-03-07 15:20:00
"""

from __future__ import annotations

from datetime import datetime

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260307_0007"
down_revision = "20260306_0006"
branch_labels = None
depends_on = None


def _default_values() -> dict[str, object]:
    return {
        "id": 1,
        "semantic_split_default_enabled": False,
        "subtitle_split_enabled": True,
        "subtitle_split_target_words": 18,
        "subtitle_split_max_words": 28,
        "semantic_split_max_words_threshold": 24,
        "semantic_split_timeout_seconds": 40,
        "translation_batch_max_chars": 2600,
        "updated_at": datetime.utcnow(),
    }


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _qualified_table(table_name: str, schema: str | None) -> str:
    return f"{schema}.{table_name}" if schema else table_name


def _has_table(table_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return inspector.has_table(table_name, schema=schema)


def _column_names(table_name: str, schema: str | None) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        return set()
    return {str(item.get("name") or "").strip() for item in inspector.get_columns(table_name, schema=schema)}


def _debug(message: str) -> None:
    print(f"[DEBUG] migration.20260307_0007 {message}")


def _ensure_default_row(schema: str | None) -> None:
    table_name = _qualified_table("subtitle_settings", schema)
    bind = op.get_bind()
    exists = bind.execute(
        sa.text(f"SELECT 1 FROM {table_name} WHERE id = :id LIMIT 1"),
        {"id": 1},
    ).scalar()
    if exists:
        _debug("default_row_exists id=1")
        return

    columns = _column_names("subtitle_settings", schema)
    include_translation_batch_chars = "translation_batch_max_chars" in columns
    if include_translation_batch_chars:
        bind.execute(
            sa.text(
                f"""
                INSERT INTO {table_name}
                    (id, semantic_split_default_enabled, subtitle_split_enabled, subtitle_split_target_words, subtitle_split_max_words,
                     semantic_split_max_words_threshold, semantic_split_timeout_seconds, translation_batch_max_chars, updated_at, updated_by_user_id)
                VALUES
                    (:id, :semantic_split_default_enabled, :subtitle_split_enabled, :subtitle_split_target_words, :subtitle_split_max_words,
                     :semantic_split_max_words_threshold, :semantic_split_timeout_seconds, :translation_batch_max_chars, :updated_at, NULL)
                """
            ),
            _default_values(),
        )
    else:
        bind.execute(
            sa.text(
                f"""
                INSERT INTO {table_name}
                    (id, semantic_split_default_enabled, subtitle_split_enabled, subtitle_split_target_words, subtitle_split_max_words,
                     semantic_split_max_words_threshold, semantic_split_timeout_seconds, updated_at, updated_by_user_id)
                VALUES
                    (:id, :semantic_split_default_enabled, :subtitle_split_enabled, :subtitle_split_target_words, :subtitle_split_max_words,
                     :semantic_split_max_words_threshold, :semantic_split_timeout_seconds, :updated_at, NULL)
                """
            ),
            _default_values(),
        )
    _debug("default_row_inserted id=1")


def upgrade() -> None:
    schema = _schema_name()
    if _has_table("subtitle_settings", schema):
        _debug("table_exists=true skip_create=true")
    else:
        _debug("table_exists=false skip_create=false")
        op.create_table(
            "subtitle_settings",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("semantic_split_default_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("subtitle_split_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("subtitle_split_target_words", sa.Integer(), nullable=False, server_default="18"),
            sa.Column("subtitle_split_max_words", sa.Integer(), nullable=False, server_default="28"),
            sa.Column("semantic_split_max_words_threshold", sa.Integer(), nullable=False, server_default="24"),
            sa.Column("semantic_split_timeout_seconds", sa.Integer(), nullable=False, server_default="40"),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
            sa.CheckConstraint("subtitle_split_target_words > 0", name="ck_subtitle_split_target_words_positive"),
            sa.CheckConstraint("subtitle_split_max_words > 0", name="ck_subtitle_split_max_words_positive"),
            sa.CheckConstraint("semantic_split_max_words_threshold > 0", name="ck_semantic_split_threshold_positive"),
            sa.CheckConstraint("semantic_split_timeout_seconds > 0", name="ck_semantic_split_timeout_positive"),
            sa.ForeignKeyConstraint(["updated_by_user_id"], [f"{APP_SCHEMA}.users.id" if schema else "users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            schema=schema,
        )
        _debug("table_created=true")

    _ensure_default_row(schema)


def downgrade() -> None:
    schema = _schema_name()
    if _has_table("subtitle_settings", schema):
        op.drop_table("subtitle_settings", schema=schema)
        _debug("table_dropped=true")
    else:
        _debug("table_exists=false skip_drop=true")
