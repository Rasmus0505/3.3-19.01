---
phase: "02"
plan: "03"
title: "02-03: Unified error handling with model re-download guidance"
wave: 2
subsystem: desktop-local-generation
tags:
  - desktop
  - error-handling
  - user-experience
  - bottle-1.0
dependency_graph:
  depends_on:
    - 02-02
  provides:
    - DESK-01
    - DESK-03
tech_stack:
  added:
    - asrStrategy.js: isModelCorruptionError(), getModelRedownloadGuidance()
  patterns:
    - Model corruption detection with user-friendly re-download guidance
    - Silent helper restart (no IPC status events)
    - Unified failure messaging without degradation banners
key_files:
  created: []
  modified:
    - frontend/src/features/upload/asrStrategy.js
    - frontend/src/features/upload/UploadPanel.jsx
    - desktop-client/electron/main.mjs
decisions:
  - Use generic failure message "生成失败，请重试" instead of degradation explanation
  - Remove helper status from diagnostic dialog to avoid technical exposure
  - Auto-restart helper on crash without user-visible notification
metrics:
  duration_minutes: 5
  completed_date: "2026-03-27"
---

# Phase 02 Plan 03 Summary: Unified Error Handling with Model Re-download Guidance

## Objective

Implemented unified error handling for Bottle 1.0 desktop generation: model corruption triggers re-download guidance without exposing technical details, helper state is kept invisible, and failures show unified status without degradation banners.

## One-liner

Model corruption errors now guide users to re-download with generic messaging, helper status is removed from diagnostics, and failure states are unified without degradation banners.

## Completed Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add model corruption error detection | `e13c8a5f` | asrStrategy.js |
| 2 | Remove helper status and diagnostic UI | `3ad5c3ad` | UploadPanel.jsx, main.mjs |
| 3 | Ensure unified failure states | `090df964` | UploadPanel.jsx |

## Deviations from Plan

None - plan executed as written.

## Verification

### Technical Detail Exposure Checks

- `grep -i "helper.*status" frontend/src/features/upload/UploadPanel.jsx` - helper-status item removed from diagnosticsItems array
- `grep -i "本地 Helper" frontend/src/features/upload/UploadPanel.jsx` - only in unused helper diagnostic function (kept for code stability)
- `grep "sendToRenderer.*helper" desktop-client/electron/main.mjs` - helper-restarting IPC event removed

### Unified Failure State Checks

- `grep "已切换" frontend/src/features/upload/UploadPanel.jsx` - only in browser cache toast, not in failure paths
- Degraded banner message replaced with "生成失败，请重试"

## Must-Haves Verification

1. **Desktop users can prepare Bottle 1.0 without understanding models, ffmpeg, or helper internals**
   - ✅ Helper status removed from diagnostics dialog
   - ✅ No helper status indicators visible to users
   - ✅ Helper restart is silent (no IPC events)

2. **Desktop users can generate a lesson locally with Bottle 1.0**
   - ✅ Model corruption detection guides users to re-download
   - ✅ Unified stage status: transcribing → generating lesson → completed/failed

3. **Local-generation readiness failures are surfaced clearly with actionable guidance**
   - ✅ Model corruption triggers re-download guidance
   - ✅ Generic failure message "生成失败，请重试" shown
   - ✅ No degradation path explanation visible to users

## Self-Check

- [x] Files exist: asrStrategy.js, UploadPanel.jsx, main.mjs
- [x] Commits exist: e13c8a5f, 3ad5c3ad, 090df964
- [x] No degraded banners visible to users
- [x] No helper status in diagnostics dialog
- [x] Model corruption detection implemented

## Known Stubs

None.
