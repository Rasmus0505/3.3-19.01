---
phase: 07-competitive-research-and-product-specs
plan: "01"
subsystem: product-spec
tags: [benchmark, positioning, copy, monetization]
requires: []
provides:
  - official-source competitor matrix for Phase 7
  - canonical Bottle 1.0 and Bottle 2.0 positioning spec
  - benchmark-backed monetization guidance for downstream CTA work
affects: [07-02, phase-8, phase-9, phase-10, phase-11, web-copy, admin-copy]
tech-stack:
  added: []
  patterns:
    - official benchmark docs as reusable product contract
    - Bottle-first naming with technical labels demoted to secondary copy
key-files:
  created:
    - .planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-COMPETITOR-MATRIX.md
    - .planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-PRODUCT-POSITIONING-SPEC.md
  modified: []
key-decisions:
  - "Use official product/help pages as the only acceptable benchmark source for Phase 7."
  - "Fix Bottle 2.0 as the fast web-safe default and Bottle 1.0 as the desktop-only high-value path."
patterns-established:
  - "Product copy starts from user task quality, not ASR implementation labels."
  - "Monetization guidance stays inside scenario-based CTA and pay-per-use recovery."
requirements-completed: [WEB-01, GROW-02]
duration: 5 min
completed: 2026-03-28
---

# Phase 7 Plan 01 Summary

**Official competitor matrix and Bottle positioning spec that lock the v2.1 naming, boundary, and monetization narrative**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-28T19:48:00+08:00
- **Completed:** 2026-03-28T19:53:27+08:00
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Produced an official-source competitor matrix covering direct language products, immersion tools, content-driven products, and an adjacent retention reference.
- Fixed the canonical Bottle 1.0 / Bottle 2.0 positioning, naming migration, product boundary, and monetization language for v2.1.
- Mapped the positioning contract to the real downstream surfaces that will consume it in later implementation phases.

## Task Commits

Each task was committed atomically:

1. **Task 1: 产出官方来源竞品矩阵并锁定四类参考口径** - `0dbcdcf8` (docs)
2. **Task 2: 固定 Bottle 1.0 / 2.0 标准定位、主命名和盈利结论** - `01a47809` (docs)

**Plan metadata:** pending docs commit at summary creation time

## Files Created/Modified

- `.planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-COMPETITOR-MATRIX.md` - official benchmark matrix with pricing, platform, recovery, and source links
- `.planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-PRODUCT-POSITIONING-SPEC.md` - canonical Bottle naming, boundary, monetization, and downstream consumption contract

## Decisions Made

- Added an adjacent-reference benchmark row instead of limiting the matrix to direct language products so retention and import patterns remain visible during later CTA work.
- Standardized Bottle copy around “选择学习素材质量” and Bottle-first naming rather than exposing `本机识别 / 云端识别` as the primary user decision.
- Kept v2.1 monetization inside pay-per-use copy, recharge recovery, and desktop-download CTA guidance rather than introducing subscription language.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `07-02` can now derive concrete CTA rules and copy deck examples directly from the benchmark and positioning contract.
- No blockers remain for the next wave.

---
*Phase: 07-competitive-research-and-product-specs*
*Completed: 2026-03-28*
