# Stack

## Runtime Layers

- Backend: Python 3.11 container running FastAPI from `app/main.py` via `uvicorn` in `scripts/start.sh`.
- Frontend: React 18 + Vite 7 app in `frontend/` with Tailwind CSS 4 and Radix UI components.
- Desktop client: Electron 35 shell in `desktop-client/` that hosts the same frontend and adds a local helper/runtime bridge.
- Database: SQLAlchemy 2 + Alembic migrations in `migrations/`; production target is PostgreSQL, development commonly uses SQLite.

## Python Dependencies

Primary runtime dependencies from `requirements.txt`:

- Web/API: `fastapi`, `uvicorn`, `python-multipart`
- Data: `sqlalchemy`, `psycopg2-binary`, `alembic`
- Auth/security: `PyJWT`, `passlib[bcrypt]`
- AI/media: `dashscope`, `faster-whisper`, `spacy`, `yt-dlp`, `requests`
- Translation client: `openai` SDK is used in `app/infra/translation_qwen_mt.py` against a compatible base URL

Development extras from `requirements-dev.txt`:

- `pytest`, `httpx`, `pyinstaller`

## Frontend Dependencies

Key packages from `frontend/package.json`:

- `react`, `react-dom`, `react-router-dom`
- UI primitives: `@radix-ui/*`, `lucide-react`, `sonner`
- Styling: `tailwindcss`, `@tailwindcss/vite`, `class-variance-authority`, `tailwind-merge`
- Charts/state: `recharts`, `zustand`

## Desktop Dependencies

Key packages from `desktop-client/package.json`:

- `electron`
- `electron-builder`

Packaged desktop resources include:

- `desktop-client/electron/**/*`
- `desktop-client/.cache/frontend-dist/**/*`
- `tools/ffmpeg/bin/*`
- `tools/yt-dlp/yt-dlp.exe`
- `asr-test/models/faster-distil-small.en/*`

## Configuration and Environment

Backend configuration is centralized in `app/core/config.py`.

Important environment variables surfaced by code and README:

- `APP_ENV`, `PORT`, `DATABASE_URL`
- `JWT_SECRET`
- `DASHSCOPE_API_KEY`
- `ADMIN_EMAILS`, `ADMIN_BOOTSTRAP_PASSWORD`
- `REDEEM_CODE_EXPORT_CONFIRM_TEXT`
- `AUTO_MIGRATE_ON_START`
- `PERSISTENT_DATA_DIR`, `ASR_BUNDLE_ROOT_DIR`
- `MT_BASE_URL`, `MT_MODEL`

## Build and Packaging

- Root `Dockerfile` performs a multi-stage build: Vite frontend -> Python runtime image -> copies built assets into `app/static/`.
- `admin-web/Dockerfile` builds a separate admin static site behind nginx.
- `frontend/vite.config.js` switches base path to `/static/` for web and `./` for desktop renderer builds.
- `desktop-client/scripts/build.mjs` rebuilds the frontend with desktop flags and copies output into `desktop-client/.cache/frontend-dist/`.
