# Integrations

## External Services

### DashScope

Used for cloud ASR and translation-compatible calls.

Relevant files:

- `app/services/asr_dashscope.py`
- `app/infra/asr/dashscope.py`
- `app/api/routers/dashscope_upload.py`
- `app/api/routers/lessons/cloud_transcribe.py`
- `app/infra/translation_qwen_mt.py`
- `README.md`

Observed integration points:

- Upload/file transcription endpoint: `POST /api/transcribe/file`
- Lesson generation flow from saved DashScope file IDs in `app/api/routers/lessons/router.py`
- Translation requests through the OpenAI SDK configured with `MT_BASE_URL` in `app/infra/translation_qwen_mt.py`

### Database

The app uses SQLAlchemy sessions from `app/db/session.py` and Alembic migrations from `migrations/`.

Production path:

- PostgreSQL expected in `README.md`, `scripts/run_prod_migration.py`, and readiness checks in `app/main.py`
- SQLite remains supported for local/dev/test paths via `resolve_database_url()` and schema translation helpers in `app/db/base.py`

### Zeabur

Deployment and service assumptions are defined in:

- `Dockerfile`
- `zeabur-template.yaml`
- `README.md`

Integration assumptions:

- `web` service on port `8080`
- `postgresql` companion service
- persistent volume mounted at `/data`

## Local System Tools

### ffmpeg / ffprobe

Media extraction and readiness checks depend on ffmpeg binaries.

Relevant files:

- `app/infra/media_ffmpeg.py`
- `app/services/media.py`
- `app/main.py`
- `tools/ffmpeg/bin/ffmpeg.exe`
- `tools/ffmpeg/bin/ffprobe.exe`

### yt-dlp

Local/public media ingestion and desktop packaging include `yt-dlp`.

Relevant files:

- `tools/yt-dlp/yt-dlp.exe`
- `desktop-client/package.json`
- `tests/unit/test_desktop_local_asr.py`

## Desktop Runtime Bridge

Electron adds a cloud/local bridge instead of reimplementing business APIs in the renderer.

Relevant files:

- `desktop-client/electron/main.mjs`
- `desktop-client/electron/preload.cjs`
- `frontend/src/shared/api/client.js`
- `frontend/src/hooks/useOfflineMode.js`

Bridge responsibilities:

- `window.desktopRuntime.requestCloudApi(...)` proxies cloud API requests through the Electron main process
- auth session cache/restore in desktop user data
- local helper requests for offline/local ASR tasks
- update checks for the client and local models

## Static Asset Integration

- Web build output is copied into `app/static/` by the root `Dockerfile`.
- Admin web has a separate static build in `frontend/dist-admin/` and nginx image path in `admin-web/`.
- Desktop build reuses the main frontend by copying `frontend/dist/` into `desktop-client/.cache/frontend-dist/`.

## Authentication / Security Integrations

- JWT token creation and verification in `app/security.py`
- Admin bootstrap and admin role enforcement in `app/services/admin_bootstrap.py` and admin routers
- Export protection guard based on `REDEEM_CODE_EXPORT_CONFIRM_TEXT` in `app/core/config.py` and readiness checks in `app/main.py`
