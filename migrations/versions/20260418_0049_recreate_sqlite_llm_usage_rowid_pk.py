"""recreate sqlite llm usage rowid primary key

Revision ID: 20260418_0049
Revises: 20260418_0048
Create Date: 2026-04-18 23:59:30
"""

from __future__ import annotations

from alembic import op

from app.db import APP_SCHEMA


revision = "20260418_0049"
down_revision = "20260418_0048"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def upgrade() -> None:
    if _schema_name() is not None:
        return
    bind = op.get_bind()
    table_exists = bind.exec_driver_sql(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='llm_usage_logs'"
    ).fetchone()
    if not table_exists:
        return
    table_sql = str(
        bind.exec_driver_sql("SELECT sql FROM sqlite_master WHERE type='table' AND name='llm_usage_logs'").scalar()
        or ""
    )
    if "ID INTEGER PRIMARY KEY" in table_sql.upper():
        return

    bind.exec_driver_sql("PRAGMA foreign_keys=OFF")
    bind.exec_driver_sql("ALTER TABLE llm_usage_logs RENAME TO llm_usage_logs__old_pk")
    bind.exec_driver_sql(
        """
        CREATE TABLE llm_usage_logs (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            trace_id VARCHAR(64) NOT NULL,
            category VARCHAR(16) NOT NULL,
            model_name VARCHAR(100) NOT NULL,
            prompt_tokens INTEGER DEFAULT 0 NOT NULL,
            completion_tokens INTEGER DEFAULT 0 NOT NULL,
            reasoning_tokens INTEGER DEFAULT 0 NOT NULL,
            total_tokens INTEGER DEFAULT 0 NOT NULL,
            input_cost_cents BIGINT DEFAULT 0 NOT NULL,
            charge_cents BIGINT DEFAULT 0 NOT NULL,
            gross_profit_cents BIGINT DEFAULT 0 NOT NULL,
            enable_thinking BOOLEAN DEFAULT 0 NOT NULL,
            input_text_preview VARCHAR(300) DEFAULT '' NOT NULL,
            lesson_id INTEGER,
            created_at DATETIME NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY(lesson_id) REFERENCES lessons (id) ON DELETE SET NULL
        )
        """
    )
    bind.exec_driver_sql(
        """
        INSERT INTO llm_usage_logs (
            id, user_id, trace_id, category, model_name, prompt_tokens, completion_tokens,
            reasoning_tokens, total_tokens, input_cost_cents, charge_cents, gross_profit_cents,
            enable_thinking, input_text_preview, lesson_id, created_at
        )
        SELECT
            id, user_id, trace_id, category, model_name, prompt_tokens, completion_tokens,
            reasoning_tokens, total_tokens, input_cost_cents, charge_cents, gross_profit_cents,
            enable_thinking, input_text_preview, lesson_id, created_at
        FROM llm_usage_logs__old_pk
        WHERE id IS NOT NULL
        """
    )
    bind.exec_driver_sql("DROP TABLE llm_usage_logs__old_pk")
    bind.exec_driver_sql("CREATE INDEX ix_llm_usage_user_id ON llm_usage_logs (user_id)")
    bind.exec_driver_sql("CREATE INDEX ix_llm_usage_trace_id ON llm_usage_logs (trace_id)")
    bind.exec_driver_sql("CREATE INDEX ix_llm_usage_category ON llm_usage_logs (category)")
    bind.exec_driver_sql("CREATE INDEX ix_llm_usage_model_name ON llm_usage_logs (model_name)")
    bind.exec_driver_sql("CREATE INDEX ix_llm_usage_lesson_id ON llm_usage_logs (lesson_id)")
    bind.exec_driver_sql("CREATE INDEX ix_llm_usage_created_at ON llm_usage_logs (created_at)")
    bind.exec_driver_sql("PRAGMA foreign_keys=ON")


def downgrade() -> None:
    if _schema_name() is not None:
        return
