#!/usr/bin/env sh
set -eu

AUTO_MIGRATE_ON_START="${AUTO_MIGRATE_ON_START:-true}"
ALEMBIC_CONFIG="${ALEMBIC_CONFIG:-alembic.ini}"

if [ "$AUTO_MIGRATE_ON_START" = "true" ]; then
  echo "[boot] running alembic upgrade head"
  python -m alembic -c "$ALEMBIC_CONFIG" upgrade head
else
  echo "[boot] skipping alembic migration (AUTO_MIGRATE_ON_START=$AUTO_MIGRATE_ON_START)"
fi

echo "[boot] starting uvicorn"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
