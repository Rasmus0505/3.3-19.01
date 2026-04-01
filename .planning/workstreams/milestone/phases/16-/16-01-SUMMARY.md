---
phase: 16-01
plan: announcement-backend
subsystem: api
tags: [fastapi, sqlalchemy, pydantic, announcement, admin-api]

# Dependency graph
requires: []
provides:
  - Announcement SQLAlchemy model with announcements table
  - Pydantic schemas for CRUD operations and list responses
  - Repository layer with all CRUD + active-only queries
  - Admin API: CRUD on /api/admin/announcements (auth required)
  - Public API: active announcements at /api/announcements/active (no auth)
affects: [16-02, 16-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - SQLAlchemy declarative model with timezone-aware timestamps (now_shanghai_naive)
    - Pydantic v2 with from_attributes and model_validate
    - Repository pattern separating DB access from API logic
    - Router grouping: admin prefix + nested sub-router for modularity

key-files:
  created:
    - app/models/announcement.py
    - app/schemas/announcement.py
    - app/repositories/announcement.py
    - app/api/routers/admin/announcements.py
    - app/api/routers/announcement_public.py
  modified:
    - app/models/__init__.py
    - app/schemas/__init__.py
    - app/repositories/__init__.py
    - app/api/routers/__init__.py
    - app/api/routers/admin.py
    - app/main.py

key-decisions:
  - Admin CRUD routed via admin.py include_router (prefix /api/admin), keeping admin endpoints centralized
  - Public endpoint at /api/announcements/active has no auth (frontend decides whether to call based on login state)
  - Uses now_shanghai_naive for timestamps (same as other models in the project)
  - type field uses String(20) not Enum in DB (Enum enforcement done in Pydantic schema)

patterns-established:
  - Model: mapped_column with timezone-aware default using now_shanghai_naive
  - Schema: Base + Create/Update/Item + ListResponse pattern consistent with other schemas
  - Repository: standalone functions with Session parameter (not class-based)
  - Router: get_admin_user dependency on all admin endpoints

requirements-completed: [ANNC-01, ANNC-02, ANNC-03, ANNC-04, ANNC-05]

# Metrics
duration: 10min
completed: 2026-04-01
---

# Phase 16 Plan 01: Announcement Backend Summary

**Announcement CRUD API with SQLAlchemy model, Pydantic schemas, repository layer, admin protected endpoints (/api/admin/announcements), and public active endpoint (/api/announcements/active)**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-01T18:33:18Z
- **Completed:** 2026-04-01T18:43:00Z
- **Tasks:** 5
- **Files modified:** 12 (3 created, 9 modified)

## Accomplishments

- Announcement SQLAlchemy model with all required fields (title, content, type, is_active, is_pinned, timestamps)
- Pydantic schemas covering all CRUD operations and list response
- Repository layer with full CRUD + active-only filtered query, ordered by pinned + created_at desc
- Admin protected API endpoints (GET list, POST create, GET one, PUT update, DELETE) at /api/admin/announcements
- Public endpoint at /api/announcements/active returning all is_active=True announcements

## Task Commits

Each task was committed atomically:

1. **Task 1: Announcement data model** - `ae05fe99` (feat)
2. **Task 2: Announcement Pydantic schemas** - `25a54391` (feat)
3. **Task 3: Announcement repository layer** - `3091137d` (feat)
4. **Task 4: Admin announcement API** - `e8ba0178` (feat)
5. **Task 5: Public announcement API** - `6143b673` (feat)

**Plan metadata:** `6143b673` (feat: register announcement routers in app)

## Files Created/Modified

- `app/models/announcement.py` - SQLAlchemy model with announcements table, fields: id, title, content, type, is_active, is_pinned, created_at, updated_at
- `app/models/__init__.py` - Export Announcement
- `app/schemas/announcement.py` - AnnouncementType enum, AnnouncementBase/Create/Update/Item/ListResponse schemas
- `app/schemas/__init__.py` - Export all announcement schemas
- `app/repositories/announcement.py` - list_announcements, get_announcement, create_announcement, update_announcement, delete_announcement, list_active_announcements
- `app/repositories/__init__.py` - Export all repository functions
- `app/api/routers/admin/announcements.py` - Admin CRUD endpoints with get_admin_user auth
- `app/api/routers/admin.py` - Include announcement_router as admin sub-router
- `app/api/routers/announcement_public.py` - Public GET /api/announcements/active (no auth)
- `app/api/routers/__init__.py` - Export announcement_public
- `app/main.py` - Import and register all announcement routers

## Decisions Made

- Admin CRUD endpoints use `/api/admin/announcements` prefix (nested under admin router with `/api/admin` prefix)
- Public endpoint `/api/announcements/active` is unauthenticated — frontend decides login-gated visibility
- type field stored as String(20) in DB, Pydantic enum enforces valid values at API boundary
- Timestamps use `now_shanghai_naive` consistent with other models (not bare `datetime.utcnow`)

## Deviations from Plan

**None - plan executed exactly as written.** Some files were already present from a prior partial run (app/api/routers/admin/announcements.py, app/api/routers/announcement_public.py, main.py router registrations) — the remaining work was wiring up the announcement_public export in __init__.py and verifying all imports chain cleanly.

---

*Phase: 16-01-announcement-backend*
*Completed: 2026-04-01*
