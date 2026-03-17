#!/usr/bin/env sh
set -eu

env_flag_is_true() {
  raw_value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  default_value="${2:-1}"

  case "$raw_value" in
    1|true|yes|on)
      return 0
      ;;
    0|false|no|off)
      return 1
      ;;
    "")
      [ "$default_value" = "1" ]
      return
      ;;
    *)
      [ "$default_value" = "1" ]
      return
      ;;
  esac
}

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[DEBUG] boot.env DATABASE_URL=present"
else
  echo "[DEBUG] boot.env DATABASE_URL=missing"
fi

if [ -n "${DASHSCOPE_API_KEY:-}" ]; then
  echo "[DEBUG] boot.env DASHSCOPE_API_KEY=present"
else
  echo "[DEBUG] boot.env DASHSCOPE_API_KEY=missing"
fi

auto_migrate_raw="${AUTO_MIGRATE_ON_START:-1}"

if env_flag_is_true "$auto_migrate_raw" 1; then
  echo "[DEBUG] boot.migrate mode=auto raw=${auto_migrate_raw}"
  python -m app.db.migration_bootstrap
else
  echo "[DEBUG] boot.migrate mode=manual_only raw=${auto_migrate_raw}"
  echo "[boot] automatic alembic migration disabled; run 'python -m alembic -c alembic.ini upgrade head' manually before expecting /health/ready=200"
fi

echo "[boot] starting uvicorn"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8080}"
