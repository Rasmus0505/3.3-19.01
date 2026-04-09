# ARCHITECTURE

## Overall Pattern

**Full-stack SPA with monolithic backend.** The frontend is a React SPA served by FastAPI (static file mount). The backend exposes a REST API consumed exclusively by the SPA.

```
Browser (React SPA)
    │
    │  HTTP / WebSocket
    ▼
FastAPI Backend (Python)
    ├── API Routers (app/api/routers/)
    ├── Domain Services (app/services/)
    ├── Repositories (app/repositories/)
    ├── Infrastructure (app/infra/)
    └── Models / DB (app/models/, SQLAlchemy)
```

## Layers

### 1. API Routers (`app/api/routers/`)

Thin HTTP layer. Each router:
- Validates request with Pydantic schemas (`app/schemas/`)
- Delegates to domain services
- Returns JSON responses

Key routers:
- `auth/` — Login, JWT issuance
- `lessons/` — Lesson CRUD, cloud transcription
- `practice/` — Practice session logic
- `wordbook/` — Vocabulary entries, spaced repetition
- `billing/` — Wallet, billing rates
- `admin/` — Admin operations
- `media/` — Media asset management
- `tts/` — Text-to-speech
- `voice_cloning/` — Voice cloning

### 2. Domain Services (`app/services/`)

Business logic. Stateless. Use repositories for data access.

Key services:
- `asr_dashscope.py` — DashScope ASR orchestration
- `transcription_service.py` — Transcription pipeline
- `practice_service.py` — Practice session logic
- `wordbook_service.py` — Wordbook + spaced repetition scheduler
- `billing_service.py` — Billing rate management
- `media.py` — Media file operations
- `llm_usage_service.py` — LLM call tracking

### 3. Repositories (`app/repositories/`)

Data access abstraction. Each repository wraps SQLAlchemy queries for a domain.

Key repositories:
- `lesson.py` / `lessons.py` — Lesson and sentence data
- `progress.py` — User progress tracking
- `wordbook.py` — Vocabulary entries
- `wallet.py` / `wallet_ledger.py` — Wallet and ledger
- `billing.py` / `billing_rates.py` — Billing
- `media_assets.py` — Media asset metadata
- `admin.py` / `admin_console.py` — Admin queries

### 4. Infrastructure (`app/infra/`)

External service wrappers (not business logic):

- `dashscope_storage.py` — DashScope object storage
- `asr/` — ASR base class
- `tts/` — TTS base + DashScope implementation
- `translation/` — Translation base + Qwen MT
- `tencent_soe.py` — Tencent SOE client
- `llm/deepseek.py` — DeepSeek LLM wrapper
- `media_ffmpeg.py` — FFmpeg wrapper
- `translation_qwen_mt.py` — Qwen MT wrapper

### 5. Models (`app/models/`)

SQLAlchemy ORM models. `Base` from `app/db/base.py`.

### 6. Database (`app/db/`)

- `base.py` — Declarative base, schema config
- `session.py` — `SessionLocal` factory, `engine`
- `init.py` — DB initialization
- `migration_bootstrap.py` — Migration utilities

## Data Flow

### Lesson Generation Pipeline

```
User uploads video URL
  → /api/dashscope_upload (router)
  → asr_dashscope.py (service)
  → yt-dlp (download)
  → DashScope Paraformer (ASR)
  → Qwen MT (translation, optional)
  → lesson stored in DB
  → media stored in DashScope storage
```

### Authentication

```
Login request → /api/auth
  → verify credentials against DB
  → issue JWT (PyJWT)
  → subsequent requests: JWT in Authorization header
  → get_current_user dependency decodes & validates
```

## Frontend Architecture

**State Management:** Zustand stores in `frontend/src/store/index.js`

**Key stores:**
- `useAuthStore` — Auth state
- `localMediaStore` — Offline media
- `localSubtitleStore` — Offline subtitles
- `localTaskStore` — Offline task state

**API Client:** `frontend/src/shared/api/client.js`

**Admin Client:** `frontend/src/shared/api/adminClient.js`

**Bootstrap Flow:**
1. `main.jsx` → `App.jsx` → `LearningShell.jsx`
2. Auth gate checks JWT → redirects to login if invalid

## Entry Points

| Entry | File |
|-------|------|
| Backend | `app/main.py` → `create_app()` |
| Frontend App | `frontend/src/main.jsx` |
| Frontend Admin | `frontend/src/main-admin.jsx` |
| Desktop Client | `frontend/src/main.jsx` (shared) |

## Security

- JWT Bearer tokens for API auth
- Admin routes protected by `get_admin_user` dependency
- `app/security.py` — Password hashing (bcrypt)
- CORS configured in FastAPI (if needed)
- Admin SQL console is a separate router with additional auth
