---
phase: 01-shared-cloud-generation
plan: 02
subsystem: ui
tags: [react, upload, desktop, bottle2, contract-tests]
requires:
  - phase: 01-shared-cloud-generation
    provides: canonical direct-upload request-url and dashscope_file_id task contract
provides:
  - Bottle 2.0 cloud stage model aligned around upload, submit cloud task, transcribing, generating lesson, and completed
  - desktop guidance dialog for desktop-only or high-risk Bottle 2.0 scenarios
  - contract tests whose names match the phase verification selectors
affects: [upload-panel, desktop-runtime-bridge, phase-01-03]
tech-stack:
  added: []
  patterns:
    - Bottle 2.0 cloud UX uses a frontend-only stage model layered over backend task stages
    - desktop guidance uses runtime client update URLs when available and env fallbacks otherwise
key-files:
  created:
    - .planning/phases/01-shared-cloud-generation/01-02-SUMMARY.md
  modified:
    - frontend/src/features/upload/UploadPanel.jsx
    - tests/contracts/test_desktop_runtime_contract.py
key-decisions:
  - "Map backend task stages into a Bottle 2.0-specific UI stage model instead of exposing convert_audio/build_lesson internals directly."
  - "Use a modal desktop CTA for large or desktop-only scenarios rather than falling back to server-side processing."
patterns-established:
  - "Wave verification selectors must match concrete contract test names such as requestCloudApi and uploadWithProgress."
  - "Bottle 2.0 guidance copy keeps the 2 GB / 12 小时 provider ceiling visible while still recommending desktop for reliability-risky uploads."
requirements-completed: [WEB-01, WEB-02, WEB-03, DESK-02]
duration: 29 min
completed: 2026-03-26
---

# Phase 01 Plan 02: Shared Cloud UX Summary

**Bottle 2.0 now presents a shared cloud stage model and explicit desktop guidance instead of leaking backend stage names or silent web fallbacks**

## Performance

- **Duration:** 29 min
- **Started:** 2026-03-26T21:10:32+08:00
- **Completed:** 2026-03-26T21:39:23+08:00
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added a Bottle 2.0-specific stage model in `UploadPanel.jsx` so the shared cloud flow reads as upload, submit cloud task, transcribing, generating lesson, and completed.
- Replaced the generic web-side link dialog with desktop guidance that gives users a bottom-right desktop CTA and soft large-file guidance instead of server fallback.
- Renamed and extended desktop contract tests so the phase verification selector actually executes the intended shared-bridge coverage.

## Task Commits

Each task was committed atomically:

1. **Task 1: Canonicalize the Bottle 2.0 stage model in the shared upload flow** - `20fb585e` (feat)
2. **Task 2: Add desktop-only guidance with a bottom-right CTA and soft large-file guidance** - `3ff6e87f` (feat)

**Plan metadata:** Pending

## Files Created/Modified
- `.planning/phases/01-shared-cloud-generation/01-02-SUMMARY.md` - Plan outcome summary and phase handoff metadata
- `frontend/src/features/upload/UploadPanel.jsx` - Bottle 2.0 stage mapping, desktop guidance dialog, and soft large-file recommendation path
- `tests/contracts/test_desktop_runtime_contract.py` - Selector-stable contract checks for `requestCloudApi`, `uploadWithProgress`, and desktop guidance copy

## Decisions Made

- Keep the backend task stages unchanged and translate them into a user-facing Bottle 2.0 cloud vocabulary in the frontend.
- Route desktop guidance through the desktop client update URL when available, with env-based fallback text when no direct download link exists yet.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The plan verification command originally selected zero tests because the matching contract tests did not include `requestCloudApi` or `uploadWithProgress` in their names. Renaming those tests fixed the false-negative verification path.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 01-03 can assume the shared cloud flow already exposes user-facing Bottle 2.0 stages and a desktop recommendation path.
- The remaining phase work can focus on auth, balance, and recovery behavior without reworking the core upload UX.

---
*Phase: 01-shared-cloud-generation*
*Completed: 2026-03-26*
