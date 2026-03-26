# Structure

## Top-Level Layout

- `app/` - FastAPI application code
- `frontend/` - React/Vite source plus local build artifacts
- `desktop-client/` - Electron desktop client source plus cached packaged assets
- `migrations/` - Alembic environment and revision history
- `tests/` - unit, integration, e2e, contracts, fixtures
- `scripts/` - migration, startup, desktop backend, git hook helpers
- `tools/` - bundled local executables (`ffmpeg`, `ffprobe`, `yt-dlp`)
- `asr-test/` - isolated local ASR lab, model files, benchmark scripts, result archives
- `admin-web/` - standalone nginx-based admin static image path
- `Docx/` - collaboration/task-pool documents, not runtime code

## Backend Tree

Important backend areas:

- `app/main.py` - application assembly, health endpoints, static serving, middleware
- `app/core/` - configuration, logging, error helpers, timezone helpers
- `app/db/` - engine/session/bootstrap/schema helpers
- `app/models/` - SQLAlchemy models for users, lessons, billing
- `app/api/deps/` - auth/db dependencies
- `app/api/routers/` - route handlers and nested router packages
- `app/repositories/` - persistence-oriented data access
- `app/services/` - business logic and task orchestration
- `app/infra/` - external service and local tool adapters
- `app/domain/` - small policy/entity modules for lesson and billing concepts
- `app/schemas/` - request/response models

## Frontend Tree

Important frontend areas:

- `frontend/src/main.jsx` and `frontend/src/main-admin.jsx` - application entrypoints
- `frontend/src/app/` - shell/bootstrap composition
- `frontend/src/features/` - product feature slices
- `frontend/src/shared/` - shared API/client/media helpers
- `frontend/src/components/ui/` - reusable UI primitives
- `frontend/src/store/` - Zustand store setup and slices
- `frontend/src/pages/` - page-level composition
- `frontend/src/assets/` - onboarding images and static assets

Build output directories already present in the repo:

- `frontend/dist/`
- `frontend/dist-admin/`

## Desktop Tree

Important desktop areas:

- `desktop-client/electron/` - main/preload/runtime integration code
- `desktop-client/scripts/` - dev/build/package scripts
- `desktop-client/build/` - installer resources
- `desktop-client/.cache/frontend-dist/` - cached renderer build
- `desktop-client/.cache/helper-runtime/` - cached packaged helper runtime

## Testing Tree

- `tests/unit/` - isolated unit tests
- `tests/integration/` - API/service integration tests
- `tests/e2e/` - end-to-end workflow tests
- `tests/contracts/` - file-content and packaging contract tests
- `tests/fixtures/` - reusable db/auth/billing/lesson setup helpers

## Migration Tree

- `migrations/env.py` - Alembic environment
- `migrations/versions/*.py` - 28 timestamped revisions observed
- `migrations/README.md` - migration and production rules

## Notable Mixed-In Artifacts

The repository currently also contains non-source or generated content:

- `app.db`, `app.db-shm`, `app.db-wal`
- many `__pycache__/` directories and `*.pyc` files
- `frontend/node_modules/`
- `frontend/dist/` and `frontend/dist-admin/`
- `desktop-client/.cache/`
- ASR run/result archives under `asr-test/runs/` and `asr-test/results/`

These artifacts materially affect repository size and developer ergonomics.
