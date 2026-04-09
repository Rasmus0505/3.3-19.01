# INTEGRATIONS

## External APIs

### DashScope (Alibaba Cloud)

**Purpose:** ASR transcription + TTS voice synthesis

- **Config:** `DASHSCOPE_API_KEY` environment variable
- **Service:** `app/services/asr_dashscope.py`
- **Models:** Paraformer ASR (upload-capable)
- **Setup:** Called in `main.py` via `setup_dashscope()` at startup

### Tencent SOE (Speech Optimization Evaluation)

**Purpose:** Speech quality evaluation

- **Service:** `app/infra/tencent_soe.py`
- **Service Wrapper:** `app/services/tencent_soe_service.py`
- **Router:** `/api/soe` → `app/api/routers/soe.py`

### Qwen MT (Translation)

**Purpose:** Machine translation for subtitles

- **Service:** `app/infra/translation_qwen_mt.py` (base) + `app/services/translation_qwen_mt.py`
- **Router:** `/api/transcribe` (cloud translate endpoint)

### OpenAI

**Purpose:** LLM integration for various AI features

- **Usage:** LLM usage tracking (`app/services/llm_usage_service.py`), admin LLM config (`app/api/routers/llm.py`)
- **Config:** API key via environment

### yt-dlp

**Purpose:** Download videos from YouTube and other platforms

- **Constraint:** `yt-dlp>=2025.2.19,<2027` (time-versioned constraint)
- **Usage:** Media upload pipeline

## Storage

### DashScope Storage

**Purpose:** Store and retrieve media assets

- **Module:** `app/infra/dashscope_storage.py`
- **Usage:** Uploaded media files, generated assets

## Database

### PostgreSQL (Production)

- **ORM:** SQLAlchemy 2.0
- **Schema:** `app` schema for all business tables
- **Tables:** See `app/db/base.py` `BUSINESS_TABLES`

### SQLite (Development)

- **Location:** Local file (configured via `DATABASE_URL`)
- **Note:** Schema enforcement disabled for SQLite

## Authentication Providers

| Provider | Implementation |
|----------|----------------|
| Local JWT | `app/security.py`, `app/api/deps/auth.py` |
| Admin Auth | `get_admin_user` dependency |
| User Auth | `get_current_user` dependency |

## Admin Panel Integrations

- **Framework:** Radix UI + TailwindCSS SPA
- **Auth Gate:** `frontend/src/app/AdminShell/AdminAuthGate.jsx`
- **Bootstrap:** `frontend/src/app/bootstrap-admin.jsx`
- **Standalone:** `frontend/src/app/AdminShellStandalone.jsx`

## Media Pipeline

| Step | Component |
|------|-----------|
| Download | yt-dlp |
| Transcribe | DashScope ASR (`asr_dashscope.py`) |
| Translate | Qwen MT |
| Store | DashScope Storage |
| Playback | HTML5 Audio + React |

## Desktop Client

- **Distribution:** Windows installer via Feijipan (share.feijipan.com)
- **Update Check:** `/desktop/client/latest.json`
- **Channels:** `stable` (only channel)
- **Config Env:** `DESKTOP_CLIENT_*` variables
