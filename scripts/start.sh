#!/usr/bin/env sh
set -eu

AUTO_MIGRATE_ON_START="${AUTO_MIGRATE_ON_START:-true}"
ALEMBIC_CONFIG="${ALEMBIC_CONFIG:-alembic.ini}"
MIGRATION_MAX_RETRIES="${MIGRATION_MAX_RETRIES:-8}"
MIGRATION_RETRY_DELAY_SECONDS="${MIGRATION_RETRY_DELAY_SECONDS:-2}"

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

if [ "$AUTO_MIGRATE_ON_START" = "true" ]; then
  echo "[boot] running alembic upgrade head"
  attempt=1
  while true; do
    echo "[DEBUG] boot.migrate attempt=${attempt}/${MIGRATION_MAX_RETRIES}"
    if python -m alembic -c "$ALEMBIC_CONFIG" upgrade head; then
      echo "[DEBUG] boot.migrate success"
      break
    fi
    if [ "$attempt" -ge "$MIGRATION_MAX_RETRIES" ]; then
      echo "[boot] alembic failed after ${MIGRATION_MAX_RETRIES} attempts"
      exit 1
    fi
    attempt=$((attempt + 1))
    echo "[boot] alembic failed, retry in ${MIGRATION_RETRY_DELAY_SECONDS}s"
    sleep "$MIGRATION_RETRY_DELAY_SECONDS"
  done
else
  echo "[boot] skipping alembic migration (AUTO_MIGRATE_ON_START=$AUTO_MIGRATE_ON_START)"
fi

echo "[boot] starting uvicorn"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
