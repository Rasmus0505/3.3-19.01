"""billing rates: add parallel config and remove paraformer

Revision ID: 20260306_0005
Revises: 20260306_0004
Create Date: 2026-03-06 18:25:00
"""

from __future__ import annotations

from datetime import datetime

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260306_0005"
down_revision = "20260306_0004"
branch_labels = None
depends_on = None


QWEN_MODEL = "qwen3-asr-flash-filetrans"
PARAFORMER_MODEL = "paraformer-v2"


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _qualified_table(table_name: str, schema: str | None) -> str:
    return f"{schema}.{table_name}" if schema else table_name


def upgrade() -> None:
    schema = _schema_name()

    with op.batch_alter_table("billing_model_rates", schema=schema) as batch_op:
        batch_op.add_column(sa.Column("parallel_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("parallel_threshold_seconds", sa.Integer(), nullable=False, server_default="600"))
        batch_op.add_column(sa.Column("segment_seconds", sa.Integer(), nullable=False, server_default="300"))
        batch_op.add_column(sa.Column("max_concurrency", sa.Integer(), nullable=False, server_default="4"))

    table_name = _qualified_table("billing_model_rates", schema)
    bind = op.get_bind()

    bind.execute(
        sa.text(
            f"""
            UPDATE {table_name}
            SET
                parallel_enabled = :parallel_enabled,
                parallel_threshold_seconds = :parallel_threshold_seconds,
                segment_seconds = :segment_seconds,
                max_concurrency = :max_concurrency
            WHERE model_name = :model_name
            """
        ),
        {
            "parallel_enabled": True,
            "parallel_threshold_seconds": 600,
            "segment_seconds": 300,
            "max_concurrency": 4,
            "model_name": QWEN_MODEL,
        },
    )

    bind.execute(
        sa.text(
            f"""
            DELETE FROM {table_name}
            WHERE model_name = :model_name
            """
        ),
        {"model_name": PARAFORMER_MODEL},
    )

    qwen_exists = bind.execute(
        sa.text(f"SELECT 1 FROM {table_name} WHERE model_name = :model_name LIMIT 1"),
        {"model_name": QWEN_MODEL},
    ).scalar()
    if not qwen_exists:
        bind.execute(
            sa.text(
                f"""
                INSERT INTO {table_name}
                    (model_name, points_per_minute, is_active, parallel_enabled, parallel_threshold_seconds, segment_seconds, max_concurrency, updated_at, updated_by_user_id)
                VALUES
                    (:model_name, :points_per_minute, :is_active, :parallel_enabled, :parallel_threshold_seconds, :segment_seconds, :max_concurrency, :updated_at, NULL)
                """
            ),
            {
                "model_name": QWEN_MODEL,
                "points_per_minute": 130,
                "is_active": True,
                "parallel_enabled": True,
                "parallel_threshold_seconds": 600,
                "segment_seconds": 300,
                "max_concurrency": 4,
                "updated_at": datetime.utcnow(),
            },
        )


def downgrade() -> None:
    schema = _schema_name()
    table_name = _qualified_table("billing_model_rates", schema)
    bind = op.get_bind()

    para_exists = bind.execute(
        sa.text(f"SELECT 1 FROM {table_name} WHERE model_name = :model_name LIMIT 1"),
        {"model_name": PARAFORMER_MODEL},
    ).scalar()
    if not para_exists:
        bind.execute(
            sa.text(
                f"""
                INSERT INTO {table_name}
                    (model_name, points_per_minute, is_active, parallel_enabled, parallel_threshold_seconds, segment_seconds, max_concurrency, updated_at, updated_by_user_id)
                VALUES
                    (:model_name, :points_per_minute, :is_active, :parallel_enabled, :parallel_threshold_seconds, :segment_seconds, :max_concurrency, :updated_at, NULL)
                """
            ),
            {
                "model_name": PARAFORMER_MODEL,
                "points_per_minute": 100,
                "is_active": True,
                "parallel_enabled": False,
                "parallel_threshold_seconds": 600,
                "segment_seconds": 300,
                "max_concurrency": 2,
                "updated_at": datetime.utcnow(),
            },
        )

    with op.batch_alter_table("billing_model_rates", schema=schema) as batch_op:
        batch_op.drop_column("max_concurrency")
        batch_op.drop_column("segment_seconds")
        batch_op.drop_column("parallel_threshold_seconds")
        batch_op.drop_column("parallel_enabled")
