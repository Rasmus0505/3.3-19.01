"""subtitle translation batch chars and flash-only mt rates

Revision ID: 20260309_0009
Revises: 20260309_0008
Create Date: 2026-03-09 19:45:00
"""

from __future__ import annotations

from datetime import datetime

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260309_0009"
down_revision = "20260309_0008"
branch_labels = None
depends_on = None


FLASH_MT_MODEL = "qwen-mt-flash"
LEGACY_MT_MODELS = ("qwen-mt-plus", "qwen-mt-lite", "qwen-mt-turbo")
DEFAULT_MT_POINTS_PER_1K_TOKENS = 15
MT_MODEL_LIKE_PATTERN = "qwen-mt-%"


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
    _upgrade_subtitle_settings(schema)
    _upgrade_billing_model_rates(schema)


def _upgrade_subtitle_settings(schema: str | None) -> None:
    if not _has_table("subtitle_settings", schema):
        return

    columns = _column_names("subtitle_settings", schema)
    checks = _check_constraints("subtitle_settings", schema)
    normalized_range = _normalize_sql("translation_batch_max_chars > 0 AND translation_batch_max_chars <= 12000")

    needs_batch = (
        "translation_batch_max_chars" not in columns
        or checks.get("ck_translation_batch_chars_range") != normalized_range
    )
    if needs_batch:
        with op.batch_alter_table("subtitle_settings", schema=schema) as batch_op:
            if "translation_batch_max_chars" not in columns:
                batch_op.add_column(sa.Column("translation_batch_max_chars", sa.Integer(), nullable=False, server_default="2600"))
            if checks.get("ck_translation_batch_chars_range") != normalized_range:
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
            SET translation_batch_max_chars = 2600
            WHERE translation_batch_max_chars IS NULL
               OR translation_batch_max_chars <= 0
               OR translation_batch_max_chars > 12000
            """
        )
    )


def _upgrade_billing_model_rates(schema: str | None) -> None:
    if not _has_table("billing_model_rates", schema):
        return

    bind = op.get_bind()
    table_name = _qualified_table("billing_model_rates", schema)

    bind.execute(
        sa.text(
            f"""
            DELETE FROM {table_name}
            WHERE model_name LIKE :mt_model_like
              AND model_name <> :flash_model
            """
        ),
        {"mt_model_like": MT_MODEL_LIKE_PATTERN, "flash_model": FLASH_MT_MODEL},
    )

    exists = bind.execute(
        sa.text(f"SELECT 1 FROM {table_name} WHERE model_name = :model_name LIMIT 1"),
        {"model_name": FLASH_MT_MODEL},
    ).scalar()
    if exists:
        return

    bind.execute(
        sa.text(
            f"""
            INSERT INTO {table_name}
                (model_name, points_per_minute, points_per_1k_tokens, billing_unit, is_active,
                 parallel_enabled, parallel_threshold_seconds, segment_seconds, max_concurrency, updated_at, updated_by_user_id)
            VALUES
                (:model_name, :points_per_minute, :points_per_1k_tokens, :billing_unit, :is_active,
                 :parallel_enabled, :parallel_threshold_seconds, :segment_seconds, :max_concurrency, :updated_at, NULL)
            """
        ),
        {
            "model_name": FLASH_MT_MODEL,
            "points_per_minute": 0,
            "points_per_1k_tokens": DEFAULT_MT_POINTS_PER_1K_TOKENS,
            "billing_unit": "1k_tokens",
            "is_active": True,
            "parallel_enabled": False,
            "parallel_threshold_seconds": 600,
            "segment_seconds": 300,
            "max_concurrency": 1,
            "updated_at": datetime.utcnow(),
        },
    )


def downgrade() -> None:
    schema = _schema_name()
    _downgrade_billing_model_rates(schema)
    _downgrade_subtitle_settings(schema)


def _downgrade_billing_model_rates(schema: str | None) -> None:
    if not _has_table("billing_model_rates", schema):
        return

    bind = op.get_bind()
    table_name = _qualified_table("billing_model_rates", schema)

    for model_name in LEGACY_MT_MODELS:
        exists = bind.execute(
            sa.text(f"SELECT 1 FROM {table_name} WHERE model_name = :model_name LIMIT 1"),
            {"model_name": model_name},
        ).scalar()
        if exists:
            continue
        bind.execute(
            sa.text(
                f"""
                INSERT INTO {table_name}
                    (model_name, points_per_minute, points_per_1k_tokens, billing_unit, is_active,
                     parallel_enabled, parallel_threshold_seconds, segment_seconds, max_concurrency, updated_at, updated_by_user_id)
                VALUES
                    (:model_name, :points_per_minute, :points_per_1k_tokens, :billing_unit, :is_active,
                     :parallel_enabled, :parallel_threshold_seconds, :segment_seconds, :max_concurrency, :updated_at, NULL)
                """
            ),
            {
                "model_name": model_name,
                "points_per_minute": 0,
                "points_per_1k_tokens": DEFAULT_MT_POINTS_PER_1K_TOKENS,
                "billing_unit": "1k_tokens",
                "is_active": True,
                "parallel_enabled": False,
                "parallel_threshold_seconds": 600,
                "segment_seconds": 300,
                "max_concurrency": 1,
                "updated_at": datetime.utcnow(),
            },
        )


def _downgrade_subtitle_settings(schema: str | None) -> None:
    if not _has_table("subtitle_settings", schema):
        return

    columns = _column_names("subtitle_settings", schema)
    checks = _check_constraints("subtitle_settings", schema)
    if "translation_batch_max_chars" not in columns:
        return

    with op.batch_alter_table("subtitle_settings", schema=schema) as batch_op:
        if "ck_translation_batch_chars_range" in checks:
            batch_op.drop_constraint("ck_translation_batch_chars_range", type_="check")
        batch_op.drop_column("translation_batch_max_chars")
