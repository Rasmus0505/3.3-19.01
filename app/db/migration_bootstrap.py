from __future__ import annotations

import logging
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text

from app.db.base import is_sqlite_url, schema_name_for_url
from app.db.session import create_database_engine


logger = logging.getLogger(__name__)

DEFAULT_LOCK_ID = 33190114
DEFAULT_LOCK_TIMEOUT_SECONDS = 180
DEFAULT_CONTINUE_ON_FAILURE = True


@dataclass(frozen=True)
class StartupMigrationResult:
    attempted: bool
    succeeded: bool
    allow_startup: bool
    reason: str


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


def _resolved_alembic_config_path(repo_root: Path, alembic_config: str) -> Path:
    config_path = Path(alembic_config.strip() or "alembic.ini")
    if not config_path.is_absolute():
        config_path = repo_root / config_path
    return config_path.resolve()


def _script_directory(repo_root: Path, alembic_config: str) -> ScriptDirectory:
    return ScriptDirectory.from_config(Config(str(_resolved_alembic_config_path(repo_root, alembic_config))))


def _reset_connection_transaction(connection) -> None:
    if connection.in_transaction():
        connection.rollback()


def _qualified_version_table_name(database_url: str) -> str:
    schema = schema_name_for_url(database_url)
    if schema:
        return f"{schema}.alembic_version"
    return "alembic_version"


def _repair_redundant_linear_version_rows(connection, *, database_url: str, repo_root: Path, alembic_config: str) -> bool:
    schema = schema_name_for_url(database_url)
    db_inspector = inspect(connection)
    if not db_inspector.has_table("alembic_version", schema=schema):
        _reset_connection_transaction(connection)
        return False

    current_rows = [
        str(version_num).strip()
        for version_num in connection.execute(
            text(f"SELECT version_num FROM {_qualified_version_table_name(database_url)} ORDER BY version_num")
        ).scalars()
        if str(version_num).strip()
    ]
    if len(current_rows) <= 1:
        _reset_connection_transaction(connection)
        return False

    script = _script_directory(repo_root, alembic_config)
    heads = tuple(str(revision).strip() for revision in script.get_heads() if str(revision).strip())
    if len(heads) != 1:
        _reset_connection_transaction(connection)
        return False
    head_revision = heads[0]

    unique_rows = tuple(dict.fromkeys(current_rows))
    if head_revision not in unique_rows:
        _reset_connection_transaction(connection)
        return False

    linear_chain = {
        str(revision.revision).strip()
        for revision in script.walk_revisions(base="base", head=head_revision)
        if getattr(revision, "revision", None)
    }
    if not linear_chain or not set(unique_rows).issubset(linear_chain):
        _reset_connection_transaction(connection)
        return False

    connection.execute(text(f"DELETE FROM {_qualified_version_table_name(database_url)}"))
    connection.execute(
        text(f"INSERT INTO {_qualified_version_table_name(database_url)} (version_num) VALUES (:version_num)"),
        {"version_num": head_revision},
    )
    connection.commit()
    _emit(
        "[DEBUG] boot.migrate version_table_repaired=true "
        f"from={','.join(unique_rows)} to={head_revision}"
    )
    return True


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
                        _repair_redundant_linear_version_rows(
                            connection,
                            database_url=database_url,
                            repo_root=_repo_root(),
                            alembic_config=_alembic_config(),
                        )
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


def run_startup_migration() -> StartupMigrationResult:
    auto_migrate = _env_bool("AUTO_MIGRATE_ON_START", True)
    if not auto_migrate:
        _emit("[DEBUG] boot.migrate enabled=false mode=manual attempted=false allow_startup=true")
        return StartupMigrationResult(attempted=False, succeeded=False, allow_startup=True, reason="manual_mode")

    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        _emit(
            "[DEBUG] boot.migrate skipped=true reason=missing_database_url attempted=false allow_startup=true",
            level="warning",
        )
        return StartupMigrationResult(attempted=False, succeeded=False, allow_startup=True, reason="missing_database_url")

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
            engine = create_database_engine(database_url)
            try:
                with engine.connect() as connection:
                    _repair_redundant_linear_version_rows(
                        connection,
                        database_url=database_url,
                        repo_root=_repo_root(),
                        alembic_config=_alembic_config(),
                    )
            finally:
                engine.dispose()
            _run_alembic_upgrade(_repo_root(), _alembic_config())
        else:
            _acquire_postgres_lock(database_url, lock_id, lock_timeout_seconds)
        _emit("[DEBUG] boot.migrate success=true")
        return StartupMigrationResult(attempted=True, succeeded=True, allow_startup=True, reason="success")
    except Exception:
        logger.exception("[DEBUG] boot.migrate failed")
        print("[DEBUG] boot.migrate failed", flush=True)
        if continue_on_failure:
            _emit(
                "[boot] automatic migration failed; continuing app startup and leaving /health/ready unavailable",
                level="warning",
            )
            return StartupMigrationResult(attempted=True, succeeded=False, allow_startup=True, reason="failed_continue")
        raise


if __name__ == "__main__":
    try:
        result = run_startup_migration()
    except Exception:
        raise
    sys.exit(0 if result.allow_startup else 1)
