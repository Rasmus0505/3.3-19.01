from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest
import requests
from sqlalchemy import inspect

from app.db import APP_SCHEMA, BUSINESS_TABLES, create_database_engine


REPO_ROOT = Path(__file__).resolve().parents[1]
START_SCRIPT_PATH = REPO_ROOT / "scripts" / "start.sh"


def _pick_free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _require_postgres_database_url() -> str:
    database_url = os.getenv("START_SCRIPT_SMOKE_DATABASE_URL", "").strip()
    if not database_url:
        pytest.skip("START_SCRIPT_SMOKE_DATABASE_URL not set")
    if database_url.lower().startswith("sqlite"):
        pytest.skip("START_SCRIPT_SMOKE_DATABASE_URL must point to PostgreSQL")
    return database_url


def _build_runtime_env(database_url: str, port: int, tmp_work_dir: Path, *, auto_migrate: bool = True) -> dict[str, str]:
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": database_url,
            "JWT_SECRET": env.get("JWT_SECRET", "ci-start-script-secret"),
            "ADMIN_EMAILS": "",
            "DASHSCOPE_API_KEY": "",
            "TMP_WORK_DIR": str(tmp_work_dir),
            "PORT": str(port),
            "AUTO_MIGRATE_ON_START": "1" if auto_migrate else "0",
            "AUTO_MIGRATE_CONTINUE_ON_FAILURE": "0",
            "AUTO_MIGRATE_LOCK_TIMEOUT_SECONDS": "20",
        }
    )
    return env


def _reset_postgres_database(database_url: str) -> None:
    engine = create_database_engine(database_url, isolation_level="AUTOCOMMIT")
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql(f"DROP SCHEMA IF EXISTS {APP_SCHEMA} CASCADE")
            connection.exec_driver_sql(f"CREATE SCHEMA {APP_SCHEMA}")
            connection.exec_driver_sql("DROP TABLE IF EXISTS public.alembic_version")
    finally:
        engine.dispose()


def _run_manual_migration(database_url: str) -> None:
    env = os.environ.copy()
    env["DATABASE_URL"] = database_url
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", "head"],
        cwd=str(REPO_ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise AssertionError(f"manual migration failed with {result.returncode}\n{result.stdout}")


def _start_process(env: dict[str, str]) -> subprocess.Popen[str]:
    return subprocess.Popen(
        ["sh", str(START_SCRIPT_PATH)],
        cwd=str(REPO_ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )


def _wait_for_status(process: subprocess.Popen[str], port: int, ready_status_code: int) -> tuple[dict, dict]:
    health_payload = None
    ready_payload = None
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if process.poll() is not None:
            break
        try:
            health_resp = requests.get(f"http://127.0.0.1:{port}/health", timeout=2)
            if health_resp.status_code == 200:
                health_payload = health_resp.json()
                ready_resp = requests.get(f"http://127.0.0.1:{port}/health/ready", timeout=2)
                if ready_resp.status_code == ready_status_code:
                    ready_payload = ready_resp.json()
                    break
        except requests.RequestException:
            time.sleep(1)
            continue
        time.sleep(1)
    if health_payload is None or ready_payload is None:
        raise AssertionError(f"service did not reach /health=200 and /health/ready={ready_status_code} within timeout")
    return health_payload, ready_payload


def _stop_process(process: subprocess.Popen[str]) -> str:
    if process.poll() is None:
        process.terminate()
        try:
            logs, _ = process.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            logs, _ = process.communicate(timeout=10)
    else:
        logs, _ = process.communicate(timeout=10)
    return logs


@pytest.mark.skipif(shutil.which("sh") is None, reason="requires sh")
def test_start_script_boots_without_running_migrations(tmp_path):
    database_url = _require_postgres_database_url()
    _reset_postgres_database(database_url)

    port = _pick_free_port()
    tmp_work_dir = tmp_path / "runtime"
    tmp_work_dir.mkdir(parents=True, exist_ok=True)
    process = _start_process(_build_runtime_env(database_url, port, tmp_work_dir, auto_migrate=False))
    try:
        health_payload, ready_payload = _wait_for_status(process, port, 503)
        assert health_payload["ok"] is True
        assert health_payload["ready"] is False
        assert ready_payload["ok"] is False
        assert ready_payload["status"]["db_ready"] is False
    finally:
        logs = _stop_process(process)

    if process.returncode not in (0, -15):
        raise AssertionError(f"start script exited with {process.returncode}\n{logs}")
    assert "automatic alembic migration disabled" in logs


@pytest.mark.skipif(shutil.which("sh") is None, reason="requires sh")
def test_start_script_ready_after_manual_migration(tmp_path):
    database_url = _require_postgres_database_url()
    _reset_postgres_database(database_url)
    _run_manual_migration(database_url)

    port = _pick_free_port()
    tmp_work_dir = tmp_path / "runtime-ready"
    tmp_work_dir.mkdir(parents=True, exist_ok=True)

    process = _start_process(_build_runtime_env(database_url, port, tmp_work_dir, auto_migrate=False))
    try:
        health_payload, ready_payload = _wait_for_status(process, port, 200)
        assert health_payload["ok"] is True
        assert ready_payload["ok"] is True

        engine = create_database_engine(database_url)
        try:
            inspector = inspect(engine)
            tables = set(inspector.get_table_names(schema=APP_SCHEMA))
        finally:
            engine.dispose()

        assert set(BUSINESS_TABLES).issubset(tables)
    finally:
        logs = _stop_process(process)

    if process.returncode not in (0, -15):
        raise AssertionError(f"start script exited with {process.returncode}\n{logs}")


@pytest.mark.skipif(shutil.which("sh") is None, reason="requires sh")
def test_start_script_runs_auto_migration_before_boot(tmp_path):
    database_url = _require_postgres_database_url()
    _reset_postgres_database(database_url)

    port = _pick_free_port()
    tmp_work_dir = tmp_path / "runtime-auto"
    tmp_work_dir.mkdir(parents=True, exist_ok=True)

    process = _start_process(_build_runtime_env(database_url, port, tmp_work_dir, auto_migrate=True))
    try:
        health_payload, ready_payload = _wait_for_status(process, port, 200)
        assert health_payload["ok"] is True
        assert health_payload["ready"] is True
        assert ready_payload["ok"] is True
    finally:
        logs = _stop_process(process)

    if process.returncode not in (0, -15):
        raise AssertionError(f"start script exited with {process.returncode}\n{logs}")
    assert "[DEBUG] boot.migrate success=true" in logs
