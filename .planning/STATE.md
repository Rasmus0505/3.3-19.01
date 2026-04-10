---
gsd_state_version: 1.0
milestone: v2.8
milestone_name: 阅读生成流水线
status: planning
last_updated: "2026-04-10T09:02:46.624Z"
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 4
  completed_plans: 4
  percent: 67
---

# State: Bottle English Learning — v2.8

**Current Milestone:** v2.8 阅读生成流水线
**Started:** 2026-04-10

## Project Reference

**Core Value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.

**Current Focus:** Phase 37: Learning Handoff & Pack Library — READY TO PLAN

## Current Position

**Milestone:** v2.8
**Phase:** 37
**Plan:** Not started
**Status:** Ready to plan

## Milestone Progress

| Phase | Name | Status | Plans |
|-------|------|--------|-------|
| 35 | Material Intake & Diagnostic Card | Complete | 1/1 |
| 36 | Pipeline Orchestrator & Reading Pack | Complete | 3/3 |
| 37 | Learning Handoff & Pack Library | Not started | 0/? |

## Performance Metrics

**Milestone v2.8:**

- Total phases: 3
- Total requirements: 13
- Completed: 9
- Progress: 69%

**Project-wide:**

- Total phases completed: 36
- Total milestones shipped: 7 (v2.0-v2.7)

## Accumulated Context

### Key Technical Context

- Existing reading workflow already includes local CEFR analysis, original/rewrite toggles, history, analysis panels, and IndexedDB persistence in the reading feature.
- `reading_rewrites_v3` now persists pipeline snapshots, reading-pack assets, comparison cards, and pack-view mode without introducing a second store.
- `ReadingPage.jsx` now supports `input -> diagnostic -> pipeline -> pack`, with history reopen routing interrupted work to pipeline mode and finished work to pack mode.
- `ReadingPackPanel.jsx` and `ReadingPipelinePanel.jsx` establish the new Phase 36 result and generation surfaces while keeping `ArticlePanel.jsx` as the original/i+1 renderer.
- OpenMAIC is the reference for stage-based generation UX, progress storytelling, session recovery, and assetized outputs, not for multi-agent classroom scope.

### Key Product Context

- v2.8 is competition-oriented: the primary demo story is "bring any English material, get a personalized i+1 reading pack".
- The milestone should emphasize transformation clarity: before generation, during generation, and after generation must all be legible to judges and users.
- The reading result must become a reusable learning asset with explicit next steps, not a one-off rewrite string.
- Phase 36 now delivers the explicit stage flow, persistent reading-pack asset, and sentence-card comparison mode; the remaining milestone scope is learning handoff and pack-library surfacing.

### Key Decisions for v2.8

| Decision | Rationale |
|----------|-----------|
| Reading milestone narrative is "material -> i+1 reading pack" | Stronger demo story than "reading rewrite enhancement" |
| Generation must expose explicit stages before showing final output | Competition demos benefit from visible orchestration rather than black-box loading |
| OpenMAIC reference informs UX choreography, not classroom feature scope | Keeps Bottle focused on reading pedagogy instead of drifting into another product category |
| Reading pack becomes the persistent unit of value | History, comparison, and learning handoff all work better when output is treated as an asset |

### Blockers

None currently.

## Session Continuity

**Last session:** 2026-04-10T09:02:46.624Z

**Next action:** `/gsd-discuss-phase 37` to define learning handoff and pack-library scope before planning

---

*Last updated: 2026-04-10*
