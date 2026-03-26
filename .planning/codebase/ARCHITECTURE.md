# Architecture

## High-Level Shape

This repository is a multi-surface application:

- FastAPI backend in `app/`
- React/Vite web UI in `frontend/`
- Electron desktop shell in `desktop-client/`
- Alembic migrations in `migrations/`
- automated verification in `tests/`

The web and desktop products share most product flows and API contracts. The desktop client wraps the existing frontend rather than re-implementing it.

## Backend Layers

The backend follows a pragmatic layered structure rather than a strict framework-generated layout.

### Entry / App Composition

- `app/main.py` creates the FastAPI app, mounts static files, exposes `/health` and `/health/ready`, registers middleware, and includes routers.

### API Layer

- `app/api/routers/*` contains route handlers for auth, billing, lessons, media, practice, wallet, admin, and transcription.
- There is evidence of both flat router files and nested router packages, for example `app/api/routers/auth.py` alongside `app/api/routers/auth/router.py`, and `app/api/routers/admin.py` alongside `app/api/routers/admin/router.py`.

### Service Layer

- `app/services/*` contains business workflows and orchestration.
- Representative services: `lesson_command_service.py`, `lesson_query_service.py`, `lesson_task_manager.py`, `billing.py`, `billing_service.py`, `transcription_service.py`.
- The lesson domain is split into command/query responsibilities rather than keeping all logic inside routers.

### Repository / Persistence Layer

- `app/repositories/*` encapsulates database reads/writes.
- Models live in `app/models/*`.
- Pydantic-style response/request schemas live in `app/schemas/*`.

### Infra / Adapters

- `app/infra/*` wraps external providers and local runtime utilities.
- Examples: `app/infra/asr/dashscope.py`, `app/infra/translation/qwen_mt.py`, `app/infra/media_ffmpeg.py`, `app/infra/runtime_tools.py`.

## Request and Data Flow

Typical API flow:

1. Router validates and normalizes request input.
2. Router resolves auth/db dependencies.
3. Service layer performs orchestration and billing/task decisions.
4. Repository/model layer persists or reads state.
5. Serializer/schema layer shapes response payloads.

Examples:

- Auth: `app/api/routers/auth/router.py` -> `app/security.py` + `app/services.billing_service.get_or_create_wallet_account`
- Lesson upload: `app/api/routers/lessons/router.py` -> `app/services.lesson_command_service.py` / `app/services.lesson_service.py`
- Readiness: `app/main.py` -> DB inspection + admin bootstrap + media/runtime probes

## Web Frontend Architecture

- Application entry: `frontend/src/main.jsx`
- Root app: `frontend/src/App.jsx`
- Shared shell: `frontend/src/app/LearningShell.jsx`
- Shared API client: `frontend/src/shared/api/client.js`
- Global state: `frontend/src/store/` with Zustand slices
- Feature folders under `frontend/src/features/` cover auth, upload, lessons, immersive learning, wallet, wordbook, and multiple admin workspaces

Desktop-aware behavior is injected in the shared API client and entrypoint:

- `frontend/src/main.jsx` switches `BrowserRouter` vs `HashRouter`
- `frontend/src/shared/api/client.js` uses `window.desktopRuntime.requestCloudApi(...)` when the app runs inside Electron

## Desktop Architecture

Electron follows a standard main/preload/renderer split:

- Main process: `desktop-client/electron/main.mjs`
- Preload bridge: `desktop-client/electron/preload.cjs`
- Runtime config: `desktop-client/electron/runtime-config.mjs`
- Helper/runtime packaging logic: `desktop-client/electron/helper-runtime.mjs`
- Model update logic: `desktop-client/electron/model-updater.mjs`

The renderer is the shared frontend build. Local-only capabilities are exposed through the preload bridge instead of direct Node access.

## Health and Safety Gates

`app/main.py` is more than a thin bootstrap file. It enforces:

- production DB policy
- export confirmation guard policy
- runtime readiness checks for ffmpeg/ffprobe and upload-capable ASR
- API request blocking when the database is not ready
- static SPA fallback behavior
