from __future__ import annotations

import os
import shutil
import socket
import subprocess
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


@pytest.mark.skipif(shutil.which("sh") is None, reason="requires sh")
def test_start_script_boots_clean_postgres(tmp_path):
    database_url = os.getenv("START_SCRIPT_SMOKE_DATABASE_URL", "").strip()
    if not database_url:
        pytest.skip("START_SCRIPT_SMOKE_DATABASE_URL not set")

    port = _pick_free_port()
    tmp_work_dir = tmp_path / "runtime"
    tmp_work_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": database_url,
            "JWT_SECRET": env.get("JWT_SECRET", "ci-start-script-secret"),
            "ADMIN_EMAILS": "",
            "DASHSCOPE_API_KEY": "",
            "TMP_WORK_DIR": str(tmp_work_dir),
            "PORT": str(port),
            "AUTO_MIGRATE_ON_START": "true",
            "MIGRATION_MAX_RETRIES": "1",
            "STARTUP_DB_MAX_RETRIES": "1",
        }
    )

    process = subprocess.Popen(
        ["sh", str(START_SCRIPT_PATH)],
        cwd=str(REPO_ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    logs = ""
    try:
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
                    if ready_resp.status_code == 200:
                        ready_payload = ready_resp.json()
                        break
            except requests.RequestException:
                time.sleep(1)
                continue
            time.sleep(1)

        if health_payload is None or ready_payload is None:
            raise AssertionError("service did not become healthy and ready within timeout")

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
        if process.poll() is None:
            process.terminate()
            try:
                logs, _ = process.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                logs, _ = process.communicate(timeout=10)
        else:
            logs, _ = process.communicate(timeout=10)

    if process.returncode not in (0, -15):
        raise AssertionError(f"start script exited with {process.returncode}\n{logs}")
