from __future__ import annotations

import subprocess

import pytest

from scripts import run_prod_migration


def test_resolve_database_url_prefers_prod_database_url(monkeypatch):
    monkeypatch.setenv("PROD_DATABASE_URL", "postgresql://prod-user:secret@47.108.142.28:30835/app")
    monkeypatch.setenv("DATABASE_URL", "postgresql://dev-user:secret@127.0.0.1:5432/dev")

    database_url, source_name = run_prod_migration.resolve_database_url()

    assert database_url == "postgresql://prod-user:secret@47.108.142.28:30835/app"
    assert source_name == "PROD_DATABASE_URL"


def test_resolve_database_url_falls_back_to_database_url(monkeypatch):
    monkeypatch.delenv("PROD_DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://dev-user:secret@127.0.0.1:5432/dev")

    database_url, source_name = run_prod_migration.resolve_database_url()

    assert database_url == "postgresql://dev-user:secret@127.0.0.1:5432/dev"
    assert source_name == "DATABASE_URL"


def test_resolve_database_url_requires_environment_variable(monkeypatch):
    monkeypatch.delenv("PROD_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(RuntimeError, match="Missing PROD_DATABASE_URL or DATABASE_URL"):
        run_prod_migration.resolve_database_url()


def test_ensure_postgres_database_url_rejects_non_postgres():
    with pytest.raises(RuntimeError, match="requires a PostgreSQL DATABASE_URL"):
        run_prod_migration.ensure_postgres_database_url("sqlite:///./app.db")


def test_run_production_migration_runs_current_upgrade_current(monkeypatch):
    executed_commands: list[list[str]] = []

    def fake_run(command, cwd, env, check):
        executed_commands.append(list(command))
        assert cwd == str(run_prod_migration.REPO_ROOT)
        assert env["DATABASE_URL"] == "postgresql://prod-user:secret@47.108.142.28:30835/app"
        assert env["ALEMBIC_CONFIG"] == "alembic.ini"
        assert check is False
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setenv("PROD_DATABASE_URL", "postgresql://prod-user:secret@47.108.142.28:30835/app")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(run_prod_migration.subprocess, "run", fake_run)

    run_prod_migration.run_production_migration()

    assert executed_commands == [
        [run_prod_migration.sys.executable, "-m", "alembic", "-c", "alembic.ini", "current"],
        [run_prod_migration.sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", "head"],
        [run_prod_migration.sys.executable, "-m", "alembic", "-c", "alembic.ini", "current"],
    ]


def test_run_production_migration_check_only_skips_upgrade(monkeypatch):
    executed_commands: list[list[str]] = []

    def fake_run(command, cwd, env, check):
        executed_commands.append(list(command))
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setenv("PROD_DATABASE_URL", "postgresql://prod-user:secret@47.108.142.28:30835/app")
    monkeypatch.setattr(run_prod_migration.subprocess, "run", fake_run)

    run_prod_migration.run_production_migration(check_only=True)

    assert executed_commands == [
        [run_prod_migration.sys.executable, "-m", "alembic", "-c", "alembic.ini", "current"],
    ]
