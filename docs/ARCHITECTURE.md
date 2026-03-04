# Architecture Constraints

## Dependency direction

- `api` -> `services` -> `repositories` -> `models/db`
- `services` can call `infra` and `domain`
- `domain` must not import `fastapi`, `sqlalchemy`, or web frameworks
- `core` is shared by all layers but cannot import `api`

## Layer responsibilities

- `app/main.py`: app assembly, lifespan, router registration only
- `app/api`: HTTP concerns only (validation, auth dependency, response mapping)
- `app/services`: use-case orchestration and transaction boundaries
- `app/repositories`: data access and query composition
- `app/infra`: external providers and process adapters (ASR/MT/ffmpeg)
- `app/models`: ORM entities only
- `app/schemas`: request/response DTO only

## Rules for new code

1. Do not put business orchestration back into routers.
2. Do not query database directly from routers when repository exists.
3. Do not add cross-domain imports through `app/main.py`.
4. Keep external API paths and fields backward compatible unless explicitly versioned.
5. All schema changes must be added via Alembic migration files.
