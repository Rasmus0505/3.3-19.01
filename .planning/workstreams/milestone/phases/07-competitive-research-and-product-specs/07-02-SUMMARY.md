---
phase: 07-competitive-research-and-product-specs
plan: "02"
subsystem: product-spec
tags: [cta, copy, web-boundary, admin-copy]
requires:
  - phase: 07-01
    provides: benchmark and positioning contract for Bottle naming and boundaries
provides:
  - scenario-based web CTA routing rules
  - reusable copy deck for model cards, blocked states, and admin/runtime surfaces
affects: [phase-9, phase-10, phase-11, upload-panel, admin-runtime, monetization-copy]
tech-stack:
  added: []
  patterns:
    - scenario-based CTA routing for web upload
    - reusable copy decks as implementation input for later phases
key-files:
  created:
    - .planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-WEB-CTA-SPEC.md
    - .planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-COPY-DECK.md
  modified: []
key-decisions:
  - "Primary CTA switches to desktop only for capability or risk boundaries, never for balance issues."
  - "Bottle 1.0 remains visible in web copy but never as an executable browser action."
patterns-established:
  - "Blocked-action recovery follows the current blocker: recharge for balance, desktop for boundary."
  - "Model-card, runtime, and admin copy all share the same Bottle-first naming contract."
requirements-completed: [WEB-01, WEB-02, WEB-03, GROW-01]
duration: 3 min
completed: 2026-03-28
---

# Phase 7 Plan 02 Summary

**Scenario-based CTA spec and reusable copy deck that fix Bottle web boundaries, recharge recovery, and admin/runtime naming**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-28T19:55:30+08:00
- **Completed:** 2026-03-28T19:58:48+08:00
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Converted the Phase 7 positioning contract into a concrete web CTA decision table with exact primary/secondary actions by scenario.
- Produced a reusable copy deck for model cards, blocked states, and admin/runtime naming.
- Fixed the rule that balance recovery stays on `充值后生成` while Bottle 1.0 and other boundary cases route users toward desktop.

## Task Commits

Each task was committed atomically:

1. **Task 1: 固定网页端主次 CTA 规则并映射到真实产品表面** - `713e78b0` (docs)
2. **Task 2: 产出可直接复用的模型卡、受阻场景与 admin/runtime copy deck** - `1c17a5df` (docs)

**Plan metadata:** pending docs commit at summary creation time

## Files Created/Modified

- `.planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-WEB-CTA-SPEC.md` - scenario-to-CTA routing table with downstream surface mapping
- `.planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-COPY-DECK.md` - ready-to-paste wording for upload, blocked states, and admin/runtime surfaces

## Decisions Made

- Kept the primary recharge path separate from desktop-boundary guidance so balance issues are never mislabeled as runtime capability problems.
- Made Bottle 1.0 visible in the web surface only as explanation and desktop CTA, not as a browser action.
- Packaged model-card, recovery, and admin/runtime copy into one deck so later implementation phases can reuse wording directly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 7 now has the benchmark, positioning, CTA, and copy documents required for later implementation phases.
- Ready for phase-level verification and completion.

---
*Phase: 07-competitive-research-and-product-specs*
*Completed: 2026-03-28*
