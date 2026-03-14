from __future__ import annotations

import logging
import os
import subprocess
import sys
import time
from pathlib import Path

from sqlalchemy import text

from app.db.base import is_sqlite_url
from app.db.session import create_database_engine


logger = logging.getLogger(__name__)

DEFAULT_LOCK_ID = 33190114
DEFAULT_LOCK_TIMEOUT_SECONDS = 180
DEFAULT_CONTINUE_ON_FAILURE = True


def _emit(message: str, *, level: str = "info") -> None:
    print(message, flush=True)
    log_fn = getattr(logger, level, logger.info)
    log_fn(message)


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name, "").strip()
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _run_alembic_upgrade(repo_root: Path, alembic_config: str) -> None:
    command = [sys.executable, "-m", "alembic", "-c", alembic_config, "upgrade", "head"]
    result = subprocess.run(command, cwd=str(repo_root), env=os.environ.copy(), check=False)
    if result.returncode != 0:
        raise RuntimeError(f"alembic upgrade head failed with exit code {result.returncode}")


def _acquire_postgres_lock(database_url: str, lock_id: int, timeout_seconds: int) -> None:
    engine = create_database_engine(database_url)
    deadline = time.monotonic() + max(1, timeout_seconds)
    try:
        with engine.connect() as connection:
            while True:
                acquired = bool(connection.execute(text("SELECT pg_try_advisory_lock(:lock_id)"), {"lock_id": lock_id}).scalar())
                if acquired:
                    _emit(f"[DEBUG] boot.migrate lock_acquired=true lock_id={lock_id}")
                    try:
                        _run_alembic_upgrade(_repo_root(), _alembic_config())
                    finally:
                        connection.execute(text("SELECT pg_advisory_unlock(:lock_id)"), {"lock_id": lock_id})
                        _emit(f"[DEBUG] boot.migrate lock_released=true lock_id={lock_id}")
                    return
                if time.monotonic() >= deadline:
                    raise TimeoutError(f"timed out waiting for PostgreSQL migration lock {lock_id}")
                _emit(f"[DEBUG] boot.migrate lock_waiting=true lock_id={lock_id}")
                time.sleep(2)
    finally:
        engine.dispose()


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _alembic_config() -> str:
    return os.getenv("ALEMBIC_CONFIG", "alembic.ini").strip() or "alembic.ini"


def run_startup_migration() -> bool:
    auto_migrate = _env_bool("AUTO_MIGRATE_ON_START", True)
    if not auto_migrate:
        _emit("[DEBUG] boot.migrate enabled=false mode=manual")
        return False

    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        _emit("[DEBUG] boot.migrate skipped=true reason=missing_database_url", level="warning")
        return False

    lock_id = _env_int("AUTO_MIGRATE_LOCK_ID", DEFAULT_LOCK_ID)
    lock_timeout_seconds = _env_int("AUTO_MIGRATE_LOCK_TIMEOUT_SECONDS", DEFAULT_LOCK_TIMEOUT_SECONDS)
    continue_on_failure = _env_bool("AUTO_MIGRATE_CONTINUE_ON_FAILURE", DEFAULT_CONTINUE_ON_FAILURE)

    _emit(
        "[DEBUG] boot.migrate enabled=true "
        f"continue_on_failure={str(continue_on_failure).lower()} "
        f"lock_timeout_seconds={lock_timeout_seconds}"
    )

    try:
        if is_sqlite_url(database_url):
            _run_alembic_upgrade(_repo_root(), _alembic_config())
        else:
            _acquire_postgres_lock(database_url, lock_id, lock_timeout_seconds)
        _emit("[DEBUG] boot.migrate success=true")
        return True
    except Exception:
        logger.exception("[DEBUG] boot.migrate failed")
        print("[DEBUG] boot.migrate failed", flush=True)
        if continue_on_failure:
            _emit(
                "[boot] automatic migration failed; continuing app startup and leaving /health/ready unavailable",
                level="warning",
            )
            return False
        raise


if __name__ == "__main__":
    try:
        migrated = run_startup_migration()
    except Exception:
        raise
    sys.exit(0 if migrated or _env_bool("AUTO_MIGRATE_CONTINUE_ON_FAILURE", DEFAULT_CONTINUE_ON_FAILURE) else 1)
