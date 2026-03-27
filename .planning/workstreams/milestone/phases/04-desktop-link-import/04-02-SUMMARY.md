---
phase: 04-desktop-link-import
plan: "02"
subsystem: learning-handoff
tags: [desktop, lessons, learning, history, title-propagation]

# Dependency graph
requires:
  - phase: 04-01
    provides: Desktop link-import task lifecycle, prepared media handoff, and imported-link UI state
provides:
  - Imported-link lessons renamed through the canonical lesson record
  - Direct learning navigation after imported lesson creation
  - Regression coverage for title propagation and canonical progress continuity
affects:
  - Phase 04 verification
  - Phase 05 billing/admin polish expectations around canonical lesson history

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Imported-link title propagation happens through the existing lesson rename endpoint
    - Direct learning entry reuses the existing learning-shell lesson-detail loader

key-files:
  created:
    - .planning/workstreams/milestone/phases/04-desktop-link-import/04-02-SUMMARY.md
  modified:
    - frontend/src/features/upload/UploadPanel.jsx
    - frontend/src/app/learning-shell/LearningShellContainer.jsx
    - tests/contracts/test_desktop_runtime_contract.py
    - tests/integration/test_regression_api.py
    - tests/e2e/test_e2e_key_flows.py

key-decisions:
  - "Imported-link title propagation should reuse PATCH /api/lessons/{id} so history and learning keep one canonical lesson identity"
  - "Direct learning navigation should reuse loadLessonDetail(autoEnterImmersive=true) instead of inventing a separate imported-link learner route"

patterns-established:
  - "Imported desktop links disappear into the same canonical lesson/history/progress flow as every other lesson source after creation"

requirements-completed:
  - DESK-04

# Metrics
duration: 15min
completed: 2026-03-27
---

# Phase 04 Plan 02: Canonical Link Handoff Summary

**Completed the imported-link handoff by renaming imported lessons through the canonical lesson record and entering learning directly through the existing learning shell.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-27T15:45:00Z
- **Completed:** 2026-03-27T16:00:12.1324019Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Updated `frontend/src/features/upload/UploadPanel.jsx` so imported-link successes now rename the final lesson through the canonical lesson PATCH endpoint, preserve the actual source filename, and auto-enter learning after lesson creation
- Updated `frontend/src/app/learning-shell/LearningShellContainer.jsx` so generated-lesson navigation now reuses `loadLessonDetail(..., { autoEnterImmersive: true })` instead of stopping on the history panel
- Added regression coverage in `tests/integration/test_regression_api.py`, `tests/e2e/test_e2e_key_flows.py`, and `tests/contracts/test_desktop_runtime_contract.py` for canonical title propagation, progress continuity, and the direct-learning navigation contract

## Task Commits

1. **Task 1: Connect link-import success to the canonical lesson and direct-learning flow** - `a25c2f6a` (`feat`)
2. **Task 2: Keep post-import history and learner flow source-agnostic** - `00029211` (`feat`)
3. **Task 3: Add regression coverage for title propagation, direct learning navigation, and canonical handoff** - `16a07bc2` (`test`)

## Verification

- `pytest tests/integration/test_regression_api.py -k "local_generated_lesson_title_rename_keeps_canonical_history_and_progress" -q` → 1 passed
- `pytest tests/e2e/test_e2e_key_flows.py -k "login_create_lesson_practice_progress" -q` → 1 passed
- `pytest tests/contracts/test_desktop_runtime_contract.py -k "phase04_link_import_copy_and_fallback_contract" -q` → 1 passed
- `npm --prefix frontend run build` → passed
- `rg -n 'onNavigateToLesson|title|desktopLink|lesson.title|loadLessonDetail|setCurrentLesson' frontend/src/features/upload/UploadPanel.jsx frontend/src/store/slices/lessonSlice.ts frontend/src/app/learning-shell/LearningShellContainer.jsx` → canonical lesson hydration hooks confirmed
- `rg -n '本地课程|云端课程|imported|link import|desktop link' frontend/src/features/lessons/LessonList.jsx frontend/src/app/learning-shell/LearningShellContainer.jsx` → no source-specific learner badges/flows found

## Issues Encountered

- The broader `tests/integration/test_regression_api.py -k "lesson or workspace or progress"` sweep is not green in this repo baseline; multiple unrelated failures predate this Wave 2 delta, so verification was scoped to the new imported-link title/progress path plus the updated direct-learning contract

## Next Phase Readiness

- Phase 04 now satisfies both halves of the desktop link-import goal: desktop-local link ingestion and canonical lesson/history/learning handoff
- Ready for phase-level verification and roadmap completion

---
*Phase: 04-desktop-link-import*
*Completed: 2026-03-27*
