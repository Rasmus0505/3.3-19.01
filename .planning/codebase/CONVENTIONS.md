# Conventions

## Backend Conventions

### Configuration First

- Runtime configuration is centralized in `app/core/config.py`.
- Environment parsing helpers such as `_get_env_bool`, `_get_env_int`, and `resolve_database_url()` are reused instead of ad hoc environment reads scattered across routers.

### Standard Error Payloads

- Routers commonly return `error_response(...)` from `app/core/errors.py`.
- Business error mapping helpers exist for media and billing errors.
- API responses use explicit error codes like `INVALID_MODEL`, `REQUEST_TIMEOUT`, `INVALID_CREDENTIALS`.

### Service / Repository Split

- Route handlers generally call service modules rather than embedding heavy business logic directly.
- Read/write concerns are frequently split, for example `lesson_command_service.py` vs `lesson_query_service.py`.
- Repository modules under `app/repositories/` hold reusable persistence operations.

### Security and Auth

- Passwords are hashed with PBKDF2 in `app/security.py`.
- JWT access/refresh tokens are created in the same module.
- Admin rights are data-driven via `users.is_admin`, matching the README and readiness checks.

### Operational Readiness Checks

- `app/main.py` uses explicit readiness probes and can block `/api/*` when DB readiness fails.
- `scripts/start.sh` logs startup decisions and gates auto-migration with `AUTO_MIGRATE_ON_START`.

## Frontend Conventions

### Feature-Oriented Organization

- Product behavior is grouped by feature under `frontend/src/features/`.
- Shared abstractions live under `frontend/src/shared/`, `frontend/src/components/ui/`, and `frontend/src/store/`.

### Desktop-Aware Shared Frontend

- Web and desktop use the same renderer source.
- `frontend/src/main.jsx` chooses router mode based on `VITE_DESKTOP_RENDERER_BUILD`.
- `frontend/src/shared/api/client.js` hides whether requests go through browser fetch or Electron bridge.

### State and Utilities

- Zustand slices are stored under `frontend/src/store/slices/`.
- Utility formatting and domain helpers live under `frontend/src/shared/lib/` and `frontend/src/lib/utils.js`.

## Testing Conventions

- Test suite is intentionally layered: unit, integration, e2e, contracts.
- Tests often construct SQLite databases with `create_database_engine(...)` for isolated verification.
- Contract tests assert important file-level invariants in desktop and frontend integration code.

## Naming and File Patterns

- Python backend uses snake_case file names.
- React components largely use PascalCase file names.
- Electron uses `.mjs` for main/runtime modules and `.cjs` for preload compatibility.

## Inconsistencies Worth Knowing

- There are both flat and nested router module shapes in `app/api/routers/`.
- There are mixed JS/TS files in the frontend (`.jsx`, `.js`, `.ts`, `.tsx`).
- Generated artifacts are committed next to source in several directories, so directory contents do not strictly imply hand-written source only.
