---
phase: 09-wordbook-account-and-web-bottle-boundary
plan: "02"
subsystem: frontend
tags: [react, auth, account-center, zustand]
requires: ["09-01"]
provides:
  - Tabbed login/register auth card with register-only username input
  - Top-level account panel that absorbs redeem-code recharge
affects: [learning-shell, auth-storage, wallet/redeem]
tech-stack:
  added: []
  patterns: [username-aware-auth-storage, account-panel-shell]
key-files:
  created:
    - frontend/src/features/account/AccountPanel.jsx
  modified:
    - frontend/src/features/auth/shared/SharedAuthPanel.tsx
    - frontend/src/features/auth/components/AuthPanel.jsx
    - frontend/src/store/slices/authSlice.ts
    - frontend/src/app/authStorage.js
    - frontend/src/app/learning-shell/LearningShellSidebar.jsx
    - frontend/src/app/learning-shell/LearningShellPanelContent.jsx
key-decisions:
  - "Restore flows fetch `/api/auth/me` to refresh username-aware user state instead of trusting stale local storage forever."
  - "Redeem-code recharge remains the same widget, but it now lives inside a dedicated account panel rather than a standalone navigation item."
requirements-completed: [ACC-02, ACC-04]
duration: 34 min
completed: 2026-03-28
---

# Phase 09 Plan 02 Summary

The learning shell now exposes a true personal center, and the shared auth surface clearly separates login from registration while carrying username through stored auth state.

## Accomplishments

- Reworked the shared auth card into visible `登录` / `注册` tabs, with the username field shown only for registration.
- Expanded local auth storage and the Zustand auth slice to persist `username` alongside `id`, `email`, and `is_admin`.
- Added `AccountPanel` for current-user display, username rename, and embedded redeem-code recharge.
- Moved the learning-shell navigation to `个人中心 -> 历史记录 -> 生词本 -> 上传素材`, removing the standalone redeem panel.

## Task Commits

1. `2aae161a` — `feat(phase-09): add tabbed auth and account center`

## Verification

- `npm --prefix frontend run build`

