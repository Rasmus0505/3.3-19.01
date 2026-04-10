---
phase: 38
plan: "02"
subsystem: frontend
tags: [brand-rename, upload, admin, strings]
dependency_graph:
  requires: []
  provides: [BRAND-01-upload-strings, BRAND-01-admin-strings]
  affects: [upload-panel, cloud-upload, asr-models, admin-rates, admin-system, admin-monitoring]
tech_stack:
  added: []
  patterns: [string-literal-replacement]
key_files:
  created: []
  modified:
    - frontend/src/features/upload/uploadConstants.js
    - frontend/src/shared/lib/asrModels.js
    - frontend/src/features/upload/asrStrategy.js
    - frontend/src/features/upload/CloudUploadPanel.tsx
    - frontend/src/features/upload/components/DesktopGuidanceDialog.tsx
    - frontend/src/features/upload/UploadPanel.jsx
    - frontend/src/features/admin-rates/AdminRatesTab.jsx
    - frontend/src/features/admin-system/AdminSystemTab.jsx
    - frontend/src/features/admin-workspaces/AdminMonitoringWorkspace.jsx
    - frontend/src/features/upload/uploadTaskViewModel.js
decisions:
  - "Developer-only JSDoc block comments in CloudUploadPanel.tsx (e.g. /* Bottle 2.0 Cloud Upload Panel */) were intentionally preserved per plan directive"
  - "uploadTaskViewModel.js sanitizeUserFacingText replacement target updated from Bottle 1.0 to Unlock 本地 (deviation Rule 1: bug fix — user-facing text was still surfacing old brand)"
metrics:
  duration: "~25 minutes"
  completed_date: "2026-04-10"
  tasks_completed: 8
  files_changed: 10
---

# Phase 38 Plan 02: 字符串替换（上传界面 + 管理界面）Summary

**One-liner:** Replaced all user-visible "Bottle 1.0"/"Bottle 2.0" strings across upload and admin surfaces with "Unlock 本地"/"Unlock 云端", including model titles, error messages, sort keys, and admin descriptions.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 38-02-01 | Update uploadConstants.js model titles and desktop-only message | b006b97 |
| 38-02-02 | Update asrModels.js display_name and note | 92ec8d9 |
| 38-02-03 | Update asrStrategy.js error messages (6 occurrences) | 65730f4 |
| 38-02-04 | Update CloudUploadPanel.tsx login error and flow label | b632fe0 |
| 38-02-05 | Update DesktopGuidanceDialog.tsx and UploadPanel.jsx (8 strings) | 9bca348 |
| 38-02-06 | Update AdminRatesTab.jsx sort keys and CardDescription | f2b7c7f |
| 38-02-07 | Update AdminSystemTab.jsx and AdminMonitoringWorkspace.jsx | e7452eb |
| 38-02-08 | Final grep verification — all acceptance criteria passed | b8e73f0 |

## Verification Results

All acceptance criteria from the plan passed:

- `grep "title: \"Bottle" uploadConstants.js` — 0 lines
- `grep "Bottle" asrModels.js` — 0 lines
- `grep "Bottle" asrStrategy.js` — 0 lines
- `grep "Bottle 2.0 网页流程|请先登录后再使用 Bottle" CloudUploadPanel.tsx` — 0 lines
- `grep "Bottle" DesktopGuidanceDialog.tsx` — 0 lines
- User-visible Bottle strings in UploadPanel.jsx — 0 lines (excluding internal var names and // comments)
- `grep "Bottle" AdminRatesTab.jsx` — 0 lines
- `grep "Bottle" AdminSystemTab.jsx` — 0 lines
- `grep "Bottle" AdminMonitoringWorkspace.jsx` — 0 lines
- `grep -r "\"Bottle 1.0\"|\"Bottle 2.0\"" ... | grep -v "//"` — 0 lines

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Bottle 1.0 replacement target in sanitizeUserFacingText**
- **Found during:** Task 38-02-08 (final grep verification)
- **Issue:** `uploadTaskViewModel.js` line 22 had `.replace(/本地 Bottle 1\.0/g, "Bottle 1.0")` — the replacement target string `"Bottle 1.0"` would be surfaced to users if this normalization code path triggered, displaying the old brand name
- **Fix:** Changed replacement value from `"Bottle 1.0"` to `"Unlock 本地"`
- **Files modified:** `frontend/src/features/upload/uploadTaskViewModel.js`
- **Commit:** b8e73f0

### Intentional Non-Changes

- JSDoc block comment `/* Bottle 2.0 Cloud Upload Panel (Browser / Web) */` in CloudUploadPanel.tsx line 2 was preserved per explicit plan directive (developer-internal, not user-visible)
- Internal variable names (`isBottle2CloudFlow`, `BOTTLE1_DESKTOP_ONLY_MESSAGE`, `BOTTLE2_CLOUD_DESKTOP_RECOMMEND_SIZE_BYTES`, etc.) were not modified per plan directive

## Known Stubs

None. All changes are complete string replacements; no placeholder or partial data.

## Threat Flags

No new security-relevant surface introduced. Changes are pure string literal replacements with no logic modifications.

## Self-Check: PASSED

All modified files verified to exist. All commits verified in git log.
