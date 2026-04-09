# CONCERNS

## Technical Debt

### Phase Directory Mismatch

- **Issue:** ROADMAP.md and `.planning/STATE.md` reference phases that don't exist on disk, and vice versa
- **Severity:** MEDIUM
- **Files:** `.planning/STATE.md`, `.planning/ROADMAP.md`, `*/` directories

### Stale Desktop Client References

- **Issue:** Legacy desktop client routes still in `main.py` (`desktop-client-version.json`, `DESKTOP_CLIENT_*` env vars)
- **Severity:** LOW — legacy, may still be in use

### TODO Comment

```python
# app/api/routers/lessons/cloud_transcribe.py
# from app.api.routers.local_asr_assets import router as local_asr_assets_router  # TODO: 创建缺失模块
```
- **Severity:** LOW — incomplete feature flag

## Known Issues

### Database Migration Dependency

- **Issue:** App returns 503 `DB_MIGRATION_REQUIRED` if Alembic migrations not run
- **Severity:** HIGH — blocks all API requests in production after schema changes
- **Workaround:** Run `alembic upgrade head` before deploying

### Production SQLite Restriction

- **Issue:** `main.py` enforces `DATABASE_URL` pointing to PostgreSQL/MySQL in production
- **Severity:** MEDIUM — easy to misconfigure
- **Check:** `_database_policy_status()` in `main.py`

### Redeem Code Export Guard

- **Issue:** Production requires `REDEEM_CODE_EXPORT_CONFIRM_TEXT` to be non-weak
- **Severity:** MEDIUM — blocks redeem code export in production
- **Check:** `_export_guard_policy_status()` in `main.py`

### FFmpeg Dependency

- **Issue:** Media pipeline requires `ffmpeg` and `ffprobe` on PATH
- **Severity:** MEDIUM — media processing fails if missing
- **Check:** `get_media_runtime_status()` at startup

### DashScope API Key Required

- **Issue:** ASR endpoints fail without `DASHSCOPE_API_KEY`
- **Severity:** MEDIUM — transcription unusable
- **Check:** `dashscope_configured` in `RuntimeStatus`

## Fragile Areas

### Media Upload Pipeline

```
URL → yt-dlp download → DashScope ASR → Qwen MT → DB storage → DashScope Storage
```
- **Risk:** Any step failure breaks the entire pipeline
- **Retry logic:** Not visible in codebase

### Spaced Repetition Scheduler

- **File:** `app/services/wordbook_review_scheduler.py`
- **Risk:** No visible heartbeat/cron; relies on user activity triggers

### JWT Secret in Memory

- **Files:** `app/security.py`, `app/api/deps/auth.py`
- **Risk:** No token refresh mechanism visible; long-lived tokens

## Security Considerations

### Admin SQL Console

- **File:** `app/api/routers/admin_sql_console.py`
- **Risk:** Direct SQL execution — audit logging only
- **Note:** Separate auth gate, still requires admin JWT

### LLM Usage Tracking

- **Files:** `app/services/llm_usage_service.py`, `app/models/llm_usage.py`
- **Risk:** Tokens stored in DB; no visible cost caps

### Media File Storage

- **Module:** `app/infra/dashscope_storage.py`
- **Risk:** No visible cleanup for orphaned files

## Performance Concerns

### N+1 Query Risk

- **Likely locations:** `app/repositories/lesson.py`, `app/repositories/progress.py`
- **Note:** Not confirmed; code review recommended for large lesson sets

### Sync Media Status Check

- **File:** `app/services/media.py` → `get_media_runtime_status()`
- **Called:** Every `/health/ready` request
- **Risk:** FFprobe call on each health check in production

## Info

### State File Phase Mismatch

`STATE.md` references phase 32, but disk has phases 02, 20-31, 33-34. This is a planning inconsistency, not a code bug.

### Admin Bootstrap on Every Startup

- **File:** `app/services/admin_bootstrap.py` → `ensure_admin_users()`
- **Called:** On every startup (when DB is ready)
- **Risk:** LOW — idempotent operation
