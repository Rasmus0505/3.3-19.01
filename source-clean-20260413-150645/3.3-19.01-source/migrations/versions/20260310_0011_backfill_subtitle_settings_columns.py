"""backfill subtitle_settings legacy columns

Revision ID: 20260310_0011
Revises: 20260310_0010
Create Date: 2026-03-10 14:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260310_0011"
down_revision = "20260310_0010"
branch_labels = None
depends_on = None


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


def _check_constraints(table_name: str, schema: str | None) -> dict[str, str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        return {}
    items: dict[str, str] = {}
    for row in inspector.get_check_constraints(table_name, schema=schema):
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        items[name] = _normalize_sql(str(row.get("sqltext") or ""))
    return items


def _normalize_sql(text: str) -> str:
    return " ".join((text or "").lower().replace('"', "").replace("'", "").split())


def upgrade() -> None:
    schema = _schema_name()
    if not _has_table("subtitle_settings", schema):
        return

    columns = _column_names("subtitle_settings", schema)
    checks = _check_constraints("subtitle_settings", schema)
    timeout_check = _normalize_sql("semantic_split_timeout_seconds > 0")
    batch_chars_check = _normalize_sql("translation_batch_max_chars > 0 AND translation_batch_max_chars <= 12000")

    needs_timeout = (
        "semantic_split_timeout_seconds" not in columns
        or checks.get("ck_semantic_split_timeout_positive") != timeout_check
    )
    needs_batch_chars = (
        "translation_batch_max_chars" not in columns
        or checks.get("ck_translation_batch_chars_range") != batch_chars_check
    )

    if needs_timeout or needs_batch_chars:
        with op.batch_alter_table("subtitle_settings", schema=schema) as batch_op:
            if "semantic_split_timeout_seconds" not in columns:
                batch_op.add_column(sa.Column("semantic_split_timeout_seconds", sa.Integer(), nullable=False, server_default="40"))
            if "translation_batch_max_chars" not in columns:
                batch_op.add_column(sa.Column("translation_batch_max_chars", sa.Integer(), nullable=False, server_default="2600"))
            if checks.get("ck_semantic_split_timeout_positive") != timeout_check:
                if "ck_semantic_split_timeout_positive" in checks:
                    batch_op.drop_constraint("ck_semantic_split_timeout_positive", type_="check")
                batch_op.create_check_constraint(
                    "ck_semantic_split_timeout_positive",
                    "semantic_split_timeout_seconds > 0",
                )
            if checks.get("ck_translation_batch_chars_range") != batch_chars_check:
                if "ck_translation_batch_chars_range" in checks:
                    batch_op.drop_constraint("ck_translation_batch_chars_range", type_="check")
                batch_op.create_check_constraint(
                    "ck_translation_batch_chars_range",
                    "translation_batch_max_chars > 0 AND translation_batch_max_chars <= 12000",
                )

    table_name = _qualified_table("subtitle_settings", schema)
    bind = op.get_bind()
    bind.execute(
        sa.text(
            f"""
            UPDATE {table_name}
            SET semantic_split_timeout_seconds = 40
            WHERE semantic_split_timeout_seconds IS NULL
               OR semantic_split_timeout_seconds <= 0
            """
        )
    )
    bind.execute(
        sa.text(
            f"""
            UPDATE {table_name}
            SET translation_batch_max_chars = 2600
            WHERE translation_batch_max_chars IS NULL
               OR translation_batch_max_chars <= 0
               OR translation_batch_max_chars > 12000
            """
        )
    )


def downgrade() -> None:
    return
