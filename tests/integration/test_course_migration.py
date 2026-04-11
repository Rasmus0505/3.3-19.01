from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import inspect

from app.db import APP_SCHEMA, create_database_engine


REPO_ROOT = Path(__file__).resolve().parents[2]


def _require_postgres_database_url() -> str:
    database_url = os.getenv("START_SCRIPT_SMOKE_DATABASE_URL", "").strip()
    if not database_url:
        pytest.skip("START_SCRIPT_SMOKE_DATABASE_URL not set")
    if database_url.lower().startswith("sqlite"):
        pytest.skip("START_SCRIPT_SMOKE_DATABASE_URL must point to PostgreSQL")
    return database_url


def _reset_postgres_database(database_url: str) -> None:
    engine = create_database_engine(database_url, isolation_level="AUTOCOMMIT")
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql(f"DROP SCHEMA IF EXISTS {APP_SCHEMA} CASCADE")
            connection.exec_driver_sql(f"CREATE SCHEMA {APP_SCHEMA}")
            connection.exec_driver_sql("DROP TABLE IF EXISTS public.alembic_version")
    finally:
        engine.dispose()


def test_head_migration_creates_course_tables():
    database_url = _require_postgres_database_url()
    _reset_postgres_database(database_url)

    env = os.environ.copy()
    env["DATABASE_URL"] = database_url

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", "head"],
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, (
        f"alembic upgrade head failed\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )

    engine = create_database_engine(database_url)
    try:
        inspector = inspect(engine)
        tables = set(inspector.get_table_names(schema=APP_SCHEMA))
        assert {"courses", "course_scenes"}.issubset(tables)

        course_columns = {column["name"] for column in inspector.get_columns("courses", schema=APP_SCHEMA)}
        scene_columns = {column["name"] for column in inspector.get_columns("course_scenes", schema=APP_SCHEMA)}

        assert {"user_id", "title", "outline_json", "models_used_json"}.issubset(course_columns)
        assert {"course_id", "idx", "scene_type", "lesson_id", "models_used_json"}.issubset(scene_columns)
    finally:
        engine.dispose()
