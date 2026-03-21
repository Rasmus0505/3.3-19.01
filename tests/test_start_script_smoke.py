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
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text

from app.db import APP_SCHEMA, BUSINESS_TABLES, create_database_engine
from app.db.migration_bootstrap import _repair_redundant_linear_version_rows, run_startup_migration


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


def _build_runtime_env(
    database_url: str,
    port: int,
    tmp_work_dir: Path,
    *,
    auto_migrate: bool = True,
    auto_migrate_value: str | None = None,
) -> dict[str, str]:
    resolved_auto_migrate = auto_migrate_value if auto_migrate_value is not None else ("1" if auto_migrate else "0")
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": database_url,
            "JWT_SECRET": env.get("JWT_SECRET", "ci-start-script-secret"),
            "ADMIN_EMAILS": "",
            "DASHSCOPE_API_KEY": "",
            "TMP_WORK_DIR": str(tmp_work_dir),
            "PORT": str(port),
            "AUTO_MIGRATE_ON_START": resolved_auto_migrate,
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


def _latest_linear_revision_chain(*, limit: int) -> list[str]:
    script = ScriptDirectory.from_config(Config(str(REPO_ROOT / "alembic.ini")))
    heads = tuple(script.get_heads())
    assert len(heads) == 1
    revisions = [str(item.revision) for item in script.walk_revisions(base="base", head=heads[0]) if item.revision]
    assert len(revisions) >= limit
    return revisions[:limit]


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


def _run_migration_bootstrap_subprocess(env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "app.db.migration_bootstrap"],
        cwd=str(REPO_ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=60,
    )


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
@pytest.mark.parametrize("manual_value", ["0", "false", "no", "off"])
def test_start_script_boots_with_manual_mode_aliases(tmp_path, manual_value):
    database_url = f"sqlite:///{(tmp_path / f'manual-{manual_value}.db').as_posix()}"

    port = _pick_free_port()
    tmp_work_dir = tmp_path / f"runtime-manual-{manual_value}"
    tmp_work_dir.mkdir(parents=True, exist_ok=True)
    process = _start_process(
        _build_runtime_env(
            database_url,
            port,
            tmp_work_dir,
            auto_migrate_value=manual_value,
        )
    )
    try:
        health_payload, ready_payload = _wait_for_status(process, port, 503)
        assert health_payload["ok"] is True
        assert health_payload["ready"] is False
        assert ready_payload["ok"] is False
    finally:
        logs = _stop_process(process)

    if process.returncode not in (0, -15):
        raise AssertionError(f"start script exited with {process.returncode}\n{logs}")
    assert f"[DEBUG] boot.migrate mode=manual_only raw={manual_value}" in logs


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


@pytest.mark.parametrize("manual_value", ["0", "false", "no", "off"])
def test_migration_bootstrap_exits_zero_for_manual_mode_aliases(tmp_path, manual_value):
    database_url = f"sqlite:///{(tmp_path / f'bootstrap-{manual_value}.db').as_posix()}"
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": database_url,
            "AUTO_MIGRATE_ON_START": manual_value,
            "AUTO_MIGRATE_CONTINUE_ON_FAILURE": "0",
        }
    )

    result = _run_migration_bootstrap_subprocess(env)

    assert result.returncode == 0, result.stdout
    assert "[DEBUG] boot.migrate enabled=false mode=manual attempted=false allow_startup=true" in result.stdout


def test_migration_bootstrap_continue_on_failure_only_relaxes_attempted_failures(tmp_path):
    database_url = f"sqlite:///{(tmp_path / 'failure-continue.db').as_posix()}"
    continue_env = os.environ.copy()
    continue_env.update(
        {
            "DATABASE_URL": database_url,
            "AUTO_MIGRATE_ON_START": "1",
            "AUTO_MIGRATE_CONTINUE_ON_FAILURE": "1",
            "ALEMBIC_CONFIG": "missing-alembic.ini",
        }
    )
    block_env = dict(continue_env)
    block_env["AUTO_MIGRATE_CONTINUE_ON_FAILURE"] = "0"

    continue_result = _run_migration_bootstrap_subprocess(continue_env)
    block_result = _run_migration_bootstrap_subprocess(block_env)

    assert continue_result.returncode == 0, continue_result.stdout
    assert "[boot] automatic migration failed; continuing app startup and leaving /health/ready unavailable" in continue_result.stdout
    assert block_result.returncode != 0, block_result.stdout


def test_repair_redundant_linear_version_rows_collapses_head_and_ancestors(tmp_path):
    database_url = f"sqlite:///{(tmp_path / 'redundant_versions.db').as_posix()}"
    revisions = _latest_linear_revision_chain(limit=3)
    engine = create_database_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
            for version_num in reversed(revisions):
                connection.execute(
                    text("INSERT INTO alembic_version (version_num) VALUES (:version_num)"),
                    {"version_num": version_num},
                )

        with engine.connect() as connection:
            repaired = _repair_redundant_linear_version_rows(
                connection,
                database_url=database_url,
                repo_root=REPO_ROOT,
                alembic_config="alembic.ini",
            )
            rows = connection.execute(text("SELECT version_num FROM alembic_version")).scalars().all()
    finally:
        engine.dispose()

    assert repaired is True
    assert rows == [revisions[0]]


def test_repair_redundant_linear_version_rows_skips_when_head_missing(tmp_path):
    database_url = f"sqlite:///{(tmp_path / 'ancestor_only_versions.db').as_posix()}"
    revisions = _latest_linear_revision_chain(limit=3)
    ancestor_rows = list(reversed(revisions[1:]))
    engine = create_database_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
            for version_num in ancestor_rows:
                connection.execute(
                    text("INSERT INTO alembic_version (version_num) VALUES (:version_num)"),
                    {"version_num": version_num},
                )

        with engine.connect() as connection:
            repaired = _repair_redundant_linear_version_rows(
                connection,
                database_url=database_url,
                repo_root=REPO_ROOT,
                alembic_config="alembic.ini",
            )
            rows = connection.execute(text("SELECT version_num FROM alembic_version ORDER BY version_num")).scalars().all()
    finally:
        engine.dispose()

    assert repaired is False
    assert rows == sorted(ancestor_rows)


def test_run_startup_migration_retries_transient_failures(tmp_path, monkeypatch):
    database_url = f"sqlite:///{(tmp_path / 'retry-bootstrap.db').as_posix()}"
    attempts = {"count": 0}

    def flaky_upgrade(_repo_root, _alembic_config):
        attempts["count"] += 1
        if attempts["count"] < 3:
            raise RuntimeError("could not connect to server: Connection refused")

    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("AUTO_MIGRATE_ON_START", "1")
    monkeypatch.setenv("AUTO_MIGRATE_CONTINUE_ON_FAILURE", "0")
    monkeypatch.setenv("AUTO_MIGRATE_MAX_ATTEMPTS", "3")
    monkeypatch.setenv("AUTO_MIGRATE_RETRY_INTERVAL_SECONDS", "1")
    monkeypatch.setattr("app.db.migration_bootstrap._run_alembic_upgrade", flaky_upgrade)
    monkeypatch.setattr("app.db.migration_bootstrap.time.sleep", lambda _seconds: None)

    result = run_startup_migration()

    assert result.succeeded is True
    assert attempts["count"] == 3
