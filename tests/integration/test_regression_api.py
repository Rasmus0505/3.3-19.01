"""Regression tests: migration, DB schema repair, and unit-level utilities.

Extracted from a larger regression file when it was split by domain.
"""
from __future__ import annotations

import os
import subprocess
import sys
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base, create_database_engine
from app.models import User
from app.services.billing_service import ensure_default_billing_rates
from app.services.lesson_builder import normalize_learning_english_text, tokenize_learning_sentence


def test_normalize_learning_english_text_spells_usd_amounts():
    assert normalize_learning_english_text("$40?") == "forty dollars?"
    assert normalize_learning_english_text("It is $1.") == "It is one dollar."
    assert normalize_learning_english_text("$0.50") == "fifty cents"
    assert normalize_learning_english_text("We spent $40.50 today.") == "We spent forty dollars and fifty cents today."
    assert normalize_learning_english_text("Room 40") == "Room 40"
    assert normalize_learning_english_text("$FOO") == "$FOO"
    assert tokenize_learning_sentence("$40?") == ["forty", "dollars"]


def test_ensure_default_billing_rates_rebuilds_legacy_sqlite_constraint(tmp_path):
    db_file = tmp_path / "legacy_billing.db"
    engine = create_database_engine(f"sqlite:///{db_file}")
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, future=True)
    User.__table__.create(bind=engine, checkfirst=True)

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE billing_model_rates (
                    model_name VARCHAR(100) NOT NULL PRIMARY KEY,
                    points_per_minute INTEGER NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_by_user_id INTEGER,
                    CONSTRAINT ck_billing_rate_positive CHECK (points_per_minute > 0)
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO billing_model_rates (model_name, points_per_minute, is_active, updated_at)
                VALUES ('qwen3-asr-flash-filetrans', 130, 1, CURRENT_TIMESTAMP)
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO billing_model_rates (model_name, points_per_minute, is_active, updated_at)
                VALUES ('qwen-mt-custom', 1, 1, CURRENT_TIMESTAMP)
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE wallet_ledger (
                    id INTEGER NOT NULL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    operator_user_id INTEGER,
                    event_type VARCHAR(32) NOT NULL,
                    delta_points BIGINT NOT NULL,
                    balance_after BIGINT NOT NULL,
                    model_name VARCHAR(100),
                    duration_ms INTEGER,
                    lesson_id INTEGER,
                    note TEXT NOT NULL DEFAULT '',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT ck_wallet_ledger_event_type CHECK (event_type IN ('reserve','consume','refund','manual_adjust'))
                )
                """
            )
        )

    seed = TestingSessionLocal()
    try:
        ensure_default_billing_rates(seed)
    finally:
        seed.close()

    with engine.connect() as conn:
        ddl = str(
            conn.execute(
                text("SELECT sql FROM sqlite_master WHERE type='table' AND name='billing_model_rates'")
            ).scalar()
            or ""
        ).lower()
        wallet_ddl = str(
            conn.execute(
                text("SELECT sql FROM sqlite_master WHERE type='table' AND name='wallet_ledger'")
            ).scalar()
            or ""
        ).lower()
        mt_rate = conn.execute(
            text(
                """
                SELECT
                    model_name,
                    points_per_minute,
                    cost_per_minute_cents,
                    price_per_minute_yuan,
                    cost_per_minute_yuan,
                    points_per_1k_tokens,
                    billing_unit
                FROM billing_model_rates
                WHERE model_name IN ('qwen-mt-flash', 'qwen3-asr-flash-filetrans')
                ORDER BY model_name ASC
                """
            )
        ).mappings().all()
        non_flash_mt_count = int(
            conn.execute(
                text(
                    """
                    SELECT COUNT(1)
                    FROM billing_model_rates
                    WHERE model_name LIKE 'qwen-mt-%'
                      AND model_name <> 'qwen-mt-flash'
                    """
                )
            ).scalar()
            or 0
        )

    assert "points_per_minute > 0" not in ddl
    assert "points_per_minute >= 0" in ddl
    assert "ck_billing_rate_token_non_negative" in ddl
    assert "consume_translate" in wallet_ddl
    assert "refund_translate" in wallet_ddl
    mt_rate_by_name = {row["model_name"]: row for row in mt_rate}
    assert mt_rate_by_name["qwen-mt-flash"]["points_per_minute"] == 0
    assert mt_rate_by_name["qwen-mt-flash"]["points_per_1k_tokens"] > 0
    assert mt_rate_by_name["qwen-mt-flash"]["billing_unit"] == "1k_tokens"
    assert Decimal(str(mt_rate_by_name["qwen3-asr-flash-filetrans"]["price_per_minute_yuan"])) == Decimal("1.3000")
    assert Decimal(str(mt_rate_by_name["qwen3-asr-flash-filetrans"]["cost_per_minute_yuan"])) == Decimal("0.0132")
    assert int(mt_rate_by_name["qwen3-asr-flash-filetrans"]["cost_per_minute_cents"]) == 2
    assert non_flash_mt_count == 0


def test_subtitle_settings_migration_idempotent_when_table_exists(tmp_path):
    repo_root = Path(__file__).resolve().parents[1]
    db_file = tmp_path / "subtitle_migration.db"
    database_url = f"sqlite:///{db_file.as_posix()}"

    env = os.environ.copy()
    env["DATABASE_URL"] = database_url

    def _upgrade(target: str) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", target],
            cwd=str(repo_root),
            env=env,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, (
            f"alembic upgrade {target} failed\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )

    _upgrade("20260306_0006")

    engine = create_database_engine(database_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE subtitle_settings (
                        id INTEGER NOT NULL PRIMARY KEY,
                        semantic_split_default_enabled BOOLEAN NOT NULL DEFAULT 0,
                        subtitle_split_enabled BOOLEAN NOT NULL DEFAULT 1,
                        subtitle_split_target_words INTEGER NOT NULL DEFAULT 18,
                        subtitle_split_max_words INTEGER NOT NULL DEFAULT 28,
                        semantic_split_max_words_threshold INTEGER NOT NULL DEFAULT 24,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_by_user_id INTEGER
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    INSERT INTO subtitle_settings (
                        id,
                        semantic_split_default_enabled,
                        subtitle_split_enabled,
                        subtitle_split_target_words,
                        subtitle_split_max_words,
                        semantic_split_max_words_threshold,
                        updated_at,
                        updated_by_user_id
                    )
                    VALUES (1, 0, 1, 18, 28, 24, CURRENT_TIMESTAMP, NULL)
                    """
                )
            )
    finally:
        engine.dispose()

    _upgrade("head")
    _upgrade("head")

    verify_engine = create_database_engine(database_url)
    try:
        with verify_engine.connect() as conn:
            version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            subtitle_row = conn.execute(
                text(
                    """
                    SELECT id, subtitle_split_enabled, semantic_split_timeout_seconds, translation_batch_max_chars
                    FROM subtitle_settings
                    WHERE id = 1
                    """
                )
            ).mappings().one_or_none()
            subtitle_columns = {
                str(row["name"])
                for row in conn.execute(text("PRAGMA table_info(subtitle_settings)")).mappings().all()
            }
            mt_models = conn.execute(
                text(
                    """
                    SELECT model_name
                    FROM billing_model_rates
                    WHERE model_name LIKE 'qwen-mt-%'
                    ORDER BY model_name
                    """
                )
            ).scalars().all()
    finally:
        verify_engine.dispose()

    assert version == "20260322_0027"
    assert subtitle_row is not None
    assert int(subtitle_row["id"]) == 1
    assert bool(subtitle_row["subtitle_split_enabled"]) is True
    assert int(subtitle_row["semantic_split_timeout_seconds"]) == 40
    assert int(subtitle_row["translation_batch_max_chars"]) == 2600
    assert "semantic_split_timeout_seconds" in subtitle_columns
    assert "translation_batch_max_chars" in subtitle_columns
    assert "semantic_split_model" not in subtitle_columns
    assert mt_models == ["qwen-mt-flash"]


def test_lesson_generation_repair_migration_recreates_missing_table(tmp_path):
    repo_root = Path(__file__).resolve().parents[1]
    db_file = tmp_path / "lesson_task_repair.db"
    database_url = f"sqlite:///{db_file.as_posix()}"

    env = os.environ.copy()
    env["DATABASE_URL"] = database_url

    def _upgrade(target: str) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", target],
            cwd=str(repo_root),
            env=env,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, (
            f"alembic upgrade {target} failed\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )

    _upgrade("20260310_0013")

    mutate_engine = create_database_engine(database_url)
    try:
        with mutate_engine.begin() as conn:
            conn.execute(text("DROP TABLE lesson_generation_tasks"))
    finally:
        mutate_engine.dispose()

    _upgrade("head")

    verify_engine = create_database_engine(database_url)
    try:
        with verify_engine.connect() as conn:
            version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            table_count = int(
                conn.execute(
                    text(
                        """
                        SELECT COUNT(1)
                        FROM sqlite_master
                        WHERE type = 'table' AND name = 'lesson_generation_tasks'
                        """
                    )
                ).scalar()
                or 0
            )
            column_names = {
                str(item["name"])
                for item in conn.execute(text("PRAGMA table_info(lesson_generation_tasks)")).mappings().all()
            }
            index_names = {
                str(item["name"])
                for item in conn.execute(text("PRAGMA index_list(lesson_generation_tasks)")).mappings().all()
            }
            translation_log_columns = {
                str(item["name"])
                for item in conn.execute(text("PRAGMA table_info(translation_request_logs)")).mappings().all()
            }
    finally:
        verify_engine.dispose()

    assert version == "20260322_0027"
    assert table_count == 1
    assert {"task_id", "owner_user_id", "failure_debug_json", "failed_at", "asr_raw_json", "raw_debug_purged_at"}.issubset(column_names)
    assert {"raw_request_text", "raw_response_text", "raw_error_text"}.issubset(translation_log_columns)
    assert {
        "ix_lesson_generation_tasks_task_id",
        "ix_lesson_generation_tasks_owner_user_id",
        "ix_lesson_generation_tasks_lesson_id",
    }.issubset(index_names)
