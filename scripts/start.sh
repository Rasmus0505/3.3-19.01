#!/usr/bin/env sh
set -eu

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

if [ "${AUTO_MIGRATE_ON_START:-1}" = "0" ]; then
  echo "[DEBUG] boot.migrate mode=manual_only"
  echo "[boot] automatic alembic migration disabled; run 'python -m alembic -c alembic.ini upgrade head' manually before expecting /health/ready=200"
else
  echo "[DEBUG] boot.migrate mode=auto"
  python -m app.db.migration_bootstrap
fi

echo "[boot] starting uvicorn"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8080}"
