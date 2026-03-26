---
phase: 01-shared-cloud-generation
plan: 01
subsystem: api
tags: [dashscope, upload, qwen3, task-api, testing]
requires: []
provides:
  - canonical DashScope upload-policy response fields for Bottle 2.0 direct upload
  - persisted dashscope_file_id task artifacts for the shared cloud generation path
  - selector-stable regression coverage for direct-upload task creation
affects: [frontend-upload, lesson-task-flow, phase-01-02]
tech-stack:
  added: []
  patterns:
    - canonical cloud object keys flow from request-url to task creation unchanged
    - phase verification selectors target named regression coverage instead of broad file execution
key-files:
  created:
    - .planning/phases/01-shared-cloud-generation/01-01-SUMMARY.md
  modified:
    - tests/unit/test_dashscope_upload_router.py
    - tests/integration/test_regression_api.py
key-decisions:
  - "Treat dashscope_file_id as the canonical cloud object key across request-url responses, task artifacts, and generation entrypoints."
  - "Name the direct-upload regression test with dashscope_file_id so the plan verification selector exercises the intended path."
patterns-established:
  - "Cloud upload contract tests assert key, x-oss-content-type, and success_action_status for both nested and flat policy payloads."
  - "Task-path regression tests verify persisted task artifacts instead of relying on temporary workspace files surviving cleanup."
requirements-completed: [WEB-01, WEB-03, DESK-02]
duration: 20 min
completed: 2026-03-26
---

# Phase 01 Plan 01: Shared Cloud Upload Contract Summary

**Bottle 2.0 direct upload now has locked request-url contract coverage and a regression-tested dashscope_file_id task path**

## Performance

- **Duration:** 20 min
- **Started:** 2026-03-26T20:50:00+08:00
- **Completed:** 2026-03-26T21:10:32+08:00
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extended the upload-policy unit coverage so nested policy payloads also assert the canonical `key`, `x-oss-content-type`, and `success_action_status` fields.
- Updated the direct-upload task regression path to verify that `dashscope_file_id` is forwarded into lesson generation and persisted in task artifacts.
- Restored the plan's own verification command by giving the integration test a selector-stable `dashscope_file_id` name.

## Task Commits

Each task was committed atomically:

1. **Task 1: Normalize the Bottle 2.0 upload-policy contract** - `70a3f167` (test)
2. **Task 2: Harden dashscope_file_id task creation and signed-URL generation regression coverage** - `67c61e00` (test)

**Plan metadata:** Pending

## Files Created/Modified
- `.planning/phases/01-shared-cloud-generation/01-01-SUMMARY.md` - Plan outcome summary and machine-readable metadata
- `tests/unit/test_dashscope_upload_router.py` - Canonical upload-policy assertions for nested DashScope policy payloads
- `tests/integration/test_regression_api.py` - Direct-upload task regression coverage for persisted `dashscope_file_id` artifacts

## Decisions Made

- Keep the backend contract canonical around the cloud object key instead of reconstructing it later from temporary state.
- Verify artifact persistence via database-backed task metadata because the temp workspace is expected to be cleaned up after task completion.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The plan's integration verification selector matched no tests because the direct-upload regression test name did not include `dashscope_file_id`, `request_url`, or `qwen3`. Renaming and tightening the test resolved the false negative without changing backend behavior.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 01-02 can assume the request-url contract and `/api/lessons/tasks` cloud-file entrypoint are locked by targeted regression coverage.
- No blockers identified for the next wave.

---
*Phase: 01-shared-cloud-generation*
*Completed: 2026-03-26*
