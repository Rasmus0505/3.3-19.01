---
phase: 16-02
plan: admin-announcement-ui
subsystem: admin-ui
tags: [react, fastapi, shadcn, admin, crud, announcement]

requires:
  - phase: 16-01
    provides: Announcement SQLAlchemy model and Pydantic schemas

provides:
  - Backend: GET/POST/PUT/DELETE /api/admin/announcements CRUD endpoints
  - Frontend: AdminAnnouncementsPage with left list + right editor panel
  - Nav: "公告管理" tab entry in admin sidebar

affects:
  - phase: 16-03 (user-facing announcement display — needs this API)

tech-stack:
  added: []
  patterns:
    - FastAPI admin CRUD with SQLAlchemy ORM and get_admin_user dependency
    - Two-panel admin UI: ScrollArea list + inline editor
    - AlertDialog confirm-before-delete pattern
    - Sonner toast on CRUD success

key-files:
  created:
    - app/api/routers/admin/announcements.py
    - frontend/src/features/admin-pages/AdminAnnouncementsPage.jsx
  modified:
    - app/api/routers/__init__.py
    - app/main.py
    - app/schemas/announcement.py
    - frontend/src/AdminApp.jsx
    - frontend/src/shared/lib/adminSearchParams.js

key-decisions:
  - "AnnouncementListResponse extended with page/page_size/total for pagination consistency"
  - "Backend API created inline since 16-01 only added model/schemas, no API routes"
  - "Sidebar renders ADMIN_NAV_ITEMS without icons — Bell icon noted but not applied to sidebar"

requirements-completed: [ANNC-01, ANNC-02, ANNC-03, ANNC-04]

# Metrics
duration: ~20min
completed: 2026-04-01
---

# Phase 16 Wave 2: Admin 公告管理页面 Summary

**Admin announcement CRUD — two-panel list+editor UI backed by FastAPI CRUD endpoints, fully Chinese UI**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 tasks committed (3 commits total)
- **Files modified:** 7 files (4 backend, 3 frontend)

## Accomplishments

- Admin announcements CRUD API with GET/POST/PUT/DELETE at `/api/admin/announcements`
- Two-panel admin page: left ScrollArea list with type/status badges, right inline editor
- AlertDialog confirm-before-delete with destructive styling
- Sonner toast on create/update/delete success
- "公告管理" nav item registered in admin sidebar via `ADMIN_NAV_ITEMS`
- All copy in Chinese, type badges follow UI-SPEC.md color contract

## Task Commits

1. **Task 1 (backend API):** `e8ba0178` — feat: add admin announcements CRUD API
2. **Task 1 (frontend component):** `95b47187` — feat: create AdminAnnouncementsPage with full CRUD UI
3. **Task 2 (nav registration):** `4a5d2e7f` — feat: register announcements route and nav item

## Files Created/Modified

- `app/api/routers/admin/announcements.py` — GET list, POST create, PUT update, DELETE endpoints
- `app/schemas/announcement.py` — Added page/page_size/total to AnnouncementListResponse
- `app/api/routers/__init__.py` — Registered admin_announcements router
- `app/main.py` — Added admin_announcements import and include_router call
- `frontend/src/features/admin-pages/AdminAnnouncementsPage.jsx` — Two-panel CRUD UI component
- `frontend/src/AdminApp.jsx` — Added /admin/announcements route
- `frontend/src/shared/lib/adminSearchParams.js` — Added announcements nav item

## Decisions Made

- 16-01 only created the SQLAlchemy model + Pydantic schemas — no API routes existed. Created full CRUD API inline to support the frontend plan.
- AnnouncementListResponse schema extended with `page`, `page_size`, `total` fields to match existing admin list endpoint conventions.
- `is_pinned` sort applied as primary sort key (desc), `created_at` as secondary (desc), so pinned announcements always appear at top.

## Deviations from Plan

**None - plan executed exactly as written.**

Deviations from plan covered inline:
- Backend API was not present in 16-01; created as Rule 3 (blocking issue) to enable frontend development.

---

*Phase: 16-02*
*Completed: 2026-04-01*
