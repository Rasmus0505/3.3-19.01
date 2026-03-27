---
phase: 03-lesson-output-consistency
plan: "01"
subsystem: lesson-contract
tags: [lesson, contracts, schemas, api, regression]

# Dependency graph
requires: []
provides:
  - Canonical local/cloud learner-facing lesson result metadata
  - Single authoritative LessonTaskResponse schema
  - Contract tests for lesson catalog/detail/task payloads
affects:
  - 03-02 (history and lesson-open flow)
  - 03-03 (generation-state and learner handoff)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Canonical result metadata helper in lessons router
    - Schema-first contract validation for lesson/task payloads

key-files:
  created:
    - .planning/workstreams/milestone/phases/03-lesson-output-consistency/03-01-SUMMARY.md
  modified:
    - app/api/routers/lessons/router.py
    - app/schemas/lesson.py
    - tests/contracts/test_lessons_contract.py
    - tests/integration/test_regression_api.py

key-decisions:
  - "Local completed-generation responses must fall back to lesson.task_result_meta as well as lesson.task_result_* attributes"
  - "LessonTaskResponse and LessonTaskDebugReportResponse must exist exactly once in app/schemas/lesson.py"
  - "Contract tests should validate canonical payload shape directly instead of relying on brittle fixture/API mismatches"

patterns-established:
  - "Router-level canonical result payload assembly for both task polling and local completed lesson responses"

requirements-completed:
  - LESS-01
  - LESS-03

# Metrics
duration: 20min
completed: 2026-03-27
---

# Phase 03 Plan 01: Canonical Lesson Contract Summary

**Aligned local/cloud learner-facing lesson result metadata and removed duplicate task schema declarations so Phase 03 now has one canonical lesson/task contract to build on.**

## Performance

- **Duration:** 20 min
- **Completed:** 2026-03-27
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added canonical result helpers in `app/api/routers/lessons/router.py` so local completed lesson responses now emit `completion_kind`, `result_kind`, `result_label`, `result_message`, and `partial_failure_*` consistently
- Fixed the local completed lesson path to read result metadata from either `lesson.task_result_*` fields or `lesson.task_result_meta`
- Removed duplicate `LessonTaskResponse` and `LessonTaskDebugReportResponse` declarations from `app/schemas/lesson.py`
- Rewrote `tests/contracts/test_lessons_contract.py` into direct schema contract tests for catalog, detail, and partial task payloads
- Extended `tests/integration/test_regression_api.py` assertions to lock canonical local generated result metadata and partial task result behavior

## Verification

- `python -m pytest tests/contracts/test_lessons_contract.py -q` → 3 passed
- `python -m pytest tests/integration/test_regression_api.py -k "local_generated_lesson_persists_completed_result or partial" -q` → 2 passed

## Issues Encountered

- The first regression run showed that local completed lesson responses were reading only `lesson.task_result_kind`, while the actual local generation path stores metadata in `lesson.task_result_meta`
- Fixed by making the router helper read both representations and normalize them into one payload

## Next Phase Readiness

- Phase 03 now has a stable backend/result contract for history and upload UI work
- Ready for `03-02` history / lesson-open normalization
- Ready for `03-03` shared generation-state and learner handoff alignment

---
*Phase: 03-lesson-output-consistency*
*Completed: 2026-03-27*
