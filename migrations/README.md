# Database migrations

Use Alembic to manage schema changes.

## Common commands

```bash
python -m alembic -c alembic.ini upgrade head
python -m alembic -c alembic.ini downgrade -1
python -m alembic -c alembic.ini revision -m "your change"
```

The application no longer creates schema automatically at startup.
Run Alembic manually before expecting `GET /health/ready` to return `200`.
