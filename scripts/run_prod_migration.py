from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ALEMBIC_CONFIG = "alembic.ini"


def resolve_database_url() -> tuple[str, str]:
    prod_database_url = os.getenv("PROD_DATABASE_URL", "").strip()
    if prod_database_url:
        return prod_database_url, "PROD_DATABASE_URL"

    database_url = os.getenv("DATABASE_URL", "").strip()
    if database_url:
        return database_url, "DATABASE_URL"

    raise RuntimeError("Missing PROD_DATABASE_URL or DATABASE_URL")


def ensure_postgres_database_url(database_url: str) -> None:
    normalized_url = str(database_url or "").strip().lower()
    if normalized_url.startswith("postgresql://") or normalized_url.startswith("postgresql+"):
        return
    raise RuntimeError("Production migration requires a PostgreSQL DATABASE_URL")


def build_alembic_command(alembic_config: str, *args: str) -> list[str]:
    return [sys.executable, "-m", "alembic", "-c", alembic_config, *args]


def run_alembic_command(
    command_args: list[str],
    *,
    repo_root: Path,
    env: dict[str, str],
) -> None:
    command = build_alembic_command(env.get("ALEMBIC_CONFIG", DEFAULT_ALEMBIC_CONFIG), *command_args)
    print(f"[prod-migrate] running: {' '.join(command)}", flush=True)
    result = subprocess.run(command, cwd=str(repo_root), env=env, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed with exit code {result.returncode}: {' '.join(command)}")


def run_production_migration(*, alembic_config: str = DEFAULT_ALEMBIC_CONFIG, check_only: bool = False) -> None:
    database_url, source_name = resolve_database_url()
    ensure_postgres_database_url(database_url)

    env = os.environ.copy()
    env["DATABASE_URL"] = database_url
    env["ALEMBIC_CONFIG"] = alembic_config

    print(f"[prod-migrate] repo_root={REPO_ROOT}", flush=True)
    print(f"[prod-migrate] database_url_source={source_name}", flush=True)
    if source_name != "PROD_DATABASE_URL":
        print("[prod-migrate] warning: using DATABASE_URL fallback; PROD_DATABASE_URL is recommended", flush=True)

    run_alembic_command(["current"], repo_root=REPO_ROOT, env=env)
    if check_only:
        return
    run_alembic_command(["upgrade", "head"], repo_root=REPO_ROOT, env=env)
    run_alembic_command(["current"], repo_root=REPO_ROOT, env=env)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run production Alembic migrations from the local machine.")
    parser.add_argument("--alembic-config", default=DEFAULT_ALEMBIC_CONFIG, help="Alembic config path relative to repo root.")
    parser.add_argument("--check-only", action="store_true", help="Only print the current Alembic revision without upgrading.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    run_production_migration(alembic_config=str(args.alembic_config or DEFAULT_ALEMBIC_CONFIG), check_only=bool(args.check_only))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
