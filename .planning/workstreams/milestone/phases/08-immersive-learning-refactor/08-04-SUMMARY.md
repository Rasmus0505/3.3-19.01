---
phase: 08-immersive-learning-refactor
plan: "04"
subsystem: testing
tags: [pytest, contracts, e2e, app-static]
requires:
  - phase: 08-01
    provides: Immersive reducer/controller source contract
  - phase: 08-02
    provides: Loop and fixed-rate controls
  - phase: 08-03
    provides: Previous-sentence speaker and fullscreen reset guardrail
provides:
  - Dedicated immersive contract regression suite
  - Verified `app/static` bundle containing the new immersive controls
affects: [phase-09, app/static, tests]
tech-stack:
  added: []
  patterns: [source-contract-tests, static-bundle-string-verification]
key-files:
  created:
    - tests/contracts/test_learning_immersive_contract.py
  modified:
    - tests/e2e/test_e2e_key_flows.py
    - app/static/index.html
    - app/static/assets/ImmersiveLessonPage-2x_1EEVH.js
    - app/static/assets/ImmersiveLessonPage-DygDAMfm.css
key-decisions:
  - "Phase 08 verification stays source-contract-first because the repo does not have a dedicated frontend unit test runner."
  - "Static bundle verification is required alongside source tests so web delivery regressions surface immediately."
patterns-established:
  - "Immersive feature work must update both `frontend/src` and `app/static` before the phase is considered done."
  - "Contract tests assert both required strings and forbidden reset logic."
requirements-completed: [IMM-01, IMM-02, IMM-03, IMM-04, IMM-05]
duration: 7 min
completed: 2026-03-28
---

# Phase 08 Plan 04: Regression Lock Summary

**Phase 08 now has dedicated immersive contract coverage, refreshed lesson-progress smoke assertions, and a synced `app/static` bundle containing the new loop, rate, and previous-sentence controls**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-28T22:00:00+08:00
- **Completed:** 2026-03-28T22:07:52+08:00
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added a source-level contract test that locks the reducer events, loop preference, fullscreen reset guardrail, fixed-rate controls, and previous-sentence speaker label.
- Extended the existing lesson practice/progress e2e smoke to assert the persisted progress payload still survives the immersive refactor.
- Rebuilt and synced `frontend/dist` into `app/static`, then verified the emitted bundle contains `单句循环`, `0.75x`, `0.90x`, and `播放上一句`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add dedicated immersive contract regression tests** - `0d88d4cc` (feat)
2. **Task 2: Re-run practice smoke coverage and sync the web bundle to app/static** - `0d88d4cc` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `tests/contracts/test_learning_immersive_contract.py` - Source-string regression contract for Phase 08.
- `tests/e2e/test_e2e_key_flows.py` - Practice progress smoke assertions kept aligned with the immersive changes.
- `app/static/index.html` - Synced web entry output.
- `app/static/assets/ImmersiveLessonPage-2x_1EEVH.js` - Built immersive behavior bundle.
- `app/static/assets/ImmersiveLessonPage-DygDAMfm.css` - Built immersive answer-board and previous-sentence styling bundle.

## Decisions Made

- Used the existing Python contract/e2e test stack rather than adding a new frontend test runner inside Phase 08.
- Verified the static bundle by emitted-string match so the shipped asset cannot silently miss the new UI copy.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 08 behavior is locked by automated source checks, practice smoke coverage, and static bundle verification.
- Phase 09 can build on the immersive changes without reopening the playback-control contract.

---
*Phase: 08-immersive-learning-refactor*
*Completed: 2026-03-28*
