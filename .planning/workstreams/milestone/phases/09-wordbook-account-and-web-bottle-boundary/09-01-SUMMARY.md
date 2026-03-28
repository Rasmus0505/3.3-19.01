---
phase: 09-wordbook-account-and-web-bottle-boundary
plan: "01"
subsystem: backend
tags: [fastapi, auth, profile, migration]
requires: []
provides:
  - Unique username identity fields on users
  - Canonical `/api/auth/me` and `/api/auth/profile` endpoints
affects: [frontend/auth, learning-shell/account, phase-09-02]
tech-stack:
  added: []
  patterns: [username-normalization, current-user-api]
key-files:
  created:
    - migrations/versions/20260328_0030_usernames_and_profile_api.py
  modified:
    - app/models/user.py
    - app/repositories/user.py
    - app/schemas/auth.py
    - app/api/routers/auth/router.py
    - tests/contracts/test_auth_contract.py
key-decisions:
  - "Username stores both display value and normalized unique key so nickname-style names stay flexible without turning into login credentials."
  - "Frontend-facing user hydration should use the same `UserResponse` shape for register, login, refresh, and `/me`."
requirements-completed: [ACC-01, ACC-02, ACC-03]
duration: 26 min
completed: 2026-03-28
---

# Phase 09 Plan 01 Summary

Backend auth now supports unique usernames, current-user retrieval, and lightweight rename without changing the email-password login contract.

## Accomplishments

- Added `username` and `username_normalized` to the canonical user model plus a migration that backfills existing users.
- Introduced central username canonicalization and uniqueness lookup helpers in the user repository.
- Added `GET /api/auth/me` and `PATCH /api/auth/profile`, and expanded `UserResponse` so auth flows share the same user payload.
- Updated auth fixtures and contract tests to validate `/me`, rename, and the continued email-only login behavior.

## Task Commits

1. `848bb3bd` — `feat(phase-09): add username identity and profile api`

## Verification

- `pytest tests/contracts/test_auth_contract.py -q`

