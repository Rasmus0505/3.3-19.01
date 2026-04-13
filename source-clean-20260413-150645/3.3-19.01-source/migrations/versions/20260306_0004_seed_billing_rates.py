"""seed default billing model rates

Revision ID: 20260306_0004
Revises: 20260304_0003
Create Date: 2026-03-06 13:40:00
"""

from __future__ import annotations

from datetime import datetime

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260306_0004"
down_revision = "20260304_0003"
branch_labels = None
depends_on = None

DEFAULT_MODEL_RATES = (
    ("paraformer-v2", 100),
    ("qwen3-asr-flash-filetrans", 130),
)


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _qualified_table(table_name: str, schema: str | None) -> str:
    return f"{schema}.{table_name}" if schema else table_name


def upgrade() -> None:
    schema = _schema_name()
    table_name = _qualified_table("billing_model_rates", schema)
    bind = op.get_bind()

    for model_name, points_per_minute in DEFAULT_MODEL_RATES:
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
                    (model_name, points_per_minute, is_active, updated_at, updated_by_user_id)
                VALUES
                    (:model_name, :points_per_minute, :is_active, :updated_at, NULL)
                """
            ),
            {
                "model_name": model_name,
                "points_per_minute": points_per_minute,
                "is_active": True,
                "updated_at": datetime.utcnow(),
            },
        )


def downgrade() -> None:
    schema = _schema_name()
    table_name = _qualified_table("billing_model_rates", schema)
    bind = op.get_bind()

    bind.execute(
        sa.text(
            f"""
            DELETE FROM {table_name}
            WHERE model_name IN :model_names
            """
        ).bindparams(sa.bindparam("model_names", expanding=True)),
        {"model_names": [item[0] for item in DEFAULT_MODEL_RATES]},
    )
