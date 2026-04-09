# CONVENTIONS

## Python Backend

### Imports

- Use `from __future__ import annotations` for forward refs
- Absolute imports preferred within `app/`
- Relative imports within same package

### Error Handling

- Use FastAPI's `HTTPException` for HTTP errors
- Service layer raises custom exceptions; routers catch and convert
- Structured error responses via `app/core/errors.py`

### Database

- Always use `with engine.connect()` context manager
- Session: `db = SessionLocal()` with try/finally close
- Repository methods accept `db: Session`
- All business tables in `app` schema (configured in `app/db/base.py`)

### Auth Pattern

```python
from app.api.deps.auth import get_current_user, get_admin_user

@router.get("/endpoint")
def endpoint(current_user = Depends(get_current_user)):
    ...

@router.get("/admin-only")
def admin_only(admin_user = Depends(get_admin_user)):
    ...
```

### Schemas

- Pydantic models in `app/schemas/`
- Request: `*Create`, `*Update`, `*Batch`
- Response: `*Response`, `*List`
- Use `from __future__ import annotations`

### Logging

```python
import logging
logger = logging.getLogger(__name__)

logger.info("[DEBUG] startup.begin")
logger.warning("[DEBUG] readiness.missing_tables count=%s", count)
logger.exception("[DEBUG] db.schema_error detail=%s", detail[:400])
```

## React Frontend

### File Structure

- One component per file
- Named exports preferred for utilities
- Default exports for page components

### State Management (Zustand)

```javascript
// Store pattern
export const useAuthStore = create((set) => ({
  token: null,
  user: null,
  setAuth: (token, user) => set({ token, user }),
  logout: () => set({ token: null, user: null }),
}))
```

### API Calls

- Use shared `client.js` for main API
- Use `adminClient.js` for admin endpoints
- All endpoints in `endpoints.js`

### Component Patterns

```jsx
// UI components (Radix-based)
import { Button } from '@/components/ui/button'

// Feature components
import { WordbookPanel } from '@/features/wordbook/WordbookPanel'

// Hooks
export function useOfflineMode() { ... }
```

### CSS / Styling

- TailwindCSS utility classes
- `tailwind-merge` + `clsx` for conditional classes
- CSS custom properties in `frontend/src/styles/` (if present)

## API Design

### Response Format

All API responses return JSON. Errors use structured format:

```json
{
  "code": "ERROR_CODE",
  "message": "Human readable",
  "detail": "Technical detail"
}
```

### Route Naming

| Path Pattern | Purpose |
|-------------|---------|
| `/api/auth/*` | Authentication |
| `/api/lessons/*` | Lessons |
| `/api/wordbook/*` | Vocabulary |
| `/api/billing/*` | Billing/Wallet |
| `/api/admin/*` | Admin operations |
| `/api/practice/*` | Practice sessions |
| `/api/media/*` | Media assets |
| `/api/tts/*` | Text-to-speech |
| `/api/voice_cloning/*` | Voice cloning |
| `/api/soe/*` | Speech evaluation |
| `/api/transcribe/*` | Cloud transcription |

## Testing

### Backend (pytest)

- Test files in `app/test/`
- Pattern: `test_*.py`
- Config: `pytest.ini`
- Fixtures: `conftest.py` (if present)

### Frontend (Vitest)

- Test files co-located with `*.test.js`
- Pattern: `*.test.js`
- UI tests use `@testing-library/react`
- Config: `vitest.config.js`

## Documentation

- API docs: FastAPI auto-generated at `/docs`
- Inline comments: describe *why*, not *what*
- Complex logic: add module-level docstrings

## Git Conventions

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- No committed secrets — use environment variables
- Feature branches from `main`
