# Database migrations

Use Alembic to manage schema changes.

## Common commands

```bash
alembic upgrade head
alembic downgrade -1
alembic revision -m "your change"
```

`DB_INIT_MODE` defaults to `auto`:
- sqlite: fallback to `create_all`
- non-sqlite: expects migrations to be applied
