# Local Agent Production Migration

Use this workflow when Zeabur startup migration is unreliable and you want the local agent to run production migrations directly from your machine.

## 1. Zeabur settings

Set the `web` service environment variable:

```text
AUTO_MIGRATE_ON_START=0
```

This keeps the app startup independent from Alembic and avoids failed cold starts caused by automatic migration attempts.

## 2. Local machine environment

Prefer storing the production connection string in `PROD_DATABASE_URL`.

PowerShell example:

```powershell
$env:PROD_DATABASE_URL="postgresql://<user>:<password>@47.108.142.28:30835/<database>"
```

`DATABASE_URL` is still supported as a fallback, but `PROD_DATABASE_URL` is the recommended source so local development and production do not share the same variable by accident.

## 3. Local agent command

Check the current revision only:

```powershell
python scripts/run_prod_migration.py --check-only
```

Upgrade production to the latest revision:

```powershell
python scripts/run_prod_migration.py
```

The script will:

1. Resolve `PROD_DATABASE_URL`, then fall back to `DATABASE_URL`
2. Reject non-PostgreSQL URLs
3. Run `alembic current`
4. Run `alembic upgrade head`
5. Run `alembic current` again

## 4. Expected local-agent behavior

When you later ask the local agent to run production migrations, it should execute exactly:

```powershell
python scripts/run_prod_migration.py
```

If the environment variable is missing, the agent should stop and report that `PROD_DATABASE_URL` or `DATABASE_URL` is not set.

## 5. Post-migration verification

After the script succeeds:

1. Redeploy or restart the Zeabur `web` service if needed
2. Check `GET /health`
3. Check `GET /health/ready`
4. Confirm the affected admin or upload flows work against the migrated schema
