---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Unlock Anything
status: planning
last_updated: "2026-04-10T12:00:00.000Z"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# State: Unlock — v3.0

**Current Milestone:** v3.0 Unlock Anything
**Started:** 2026-04-10

## Project Reference

**Core Value:** Users can unlock any English material into personalized i+1 learning packs — reading, vocabulary, comprehension, and dictation — powered by AI across the full pipeline.

**Current Focus:** Defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-10 — Milestone v3.0 started

## Milestone Progress

| Phase | Name | Status | Plans |
|-------|------|--------|-------|
| TBD | — | — | — |

## Performance Metrics

**Milestone v3.0:**

- Total phases: TBD
- Total requirements: TBD
- Completed: 0
- Progress: 0%

**Project-wide:**

- Total phases completed: 36
- Total milestones shipped: 7 (v2.0-v2.7), v2.8 partial (Phase 35-36 complete)

## Accumulated Context

### Key Technical Context

- Existing reading workflow already includes local CEFR analysis, original/rewrite toggles, history, analysis panels, and IndexedDB persistence in the reading feature.
- `reading_rewrites_v3` now persists pipeline snapshots, reading-pack assets, comparison cards, and pack-view mode without introducing a second store.
- `ReadingPage.jsx` now supports `input -> diagnostic -> pipeline -> pack`, with history reopen routing interrupted work to pipeline mode and finished work to pack mode.
- `ReadingPackPanel.jsx` and `ReadingPipelinePanel.jsx` establish the new Phase 36 result and generation surfaces while keeping `ArticlePanel.jsx` as the original/i+1 renderer.
- OpenMAIC is the reference for stage-based generation UX, progress storytelling, session recovery, and assetized outputs, not for multi-agent classroom scope.
- Product renamed from Bottle to Unlock in v3.0; all user-visible brand surfaces need updating.

### Key Product Context

- v3.0 is the "Unlock Anything" milestone: any material input -> AI full pipeline -> complete learning pack + growth visualization.
- Competition demo and product completeness are parallel priorities.
- Learning pack = reading pack + comprehension quiz + vocabulary cards (with AI scene images) + dictation course.
- Multi-modal input: webpage links, PDF, subtitle files (.srt/.vtt), image OCR.
- Learning dashboard: CEFR progress, learning heatmap, unlock statistics.
- AI conversation practice deferred to next milestone.

### Key Decisions for v3.0

| Decision | Rationale |
|----------|-----------|
| Product renamed from Bottle to Unlock | "Unlock Anything" is the core narrative — brand name should directly express the value proposition |
| Learning pack = reading + quiz + vocab cards + dictation | Four outputs cover read/test/memorize/write learning dimensions |
| Multi-modal input: URL/PDF/SRT/OCR | Strengthens the "Anything" concept |
| AI scene images for vocabulary cards only | Scoped image generation to highest-impact use case |
| AI conversation practice deferred to post-v3.0 | v3.0 scope is already large; conversation needs full ASR+SOE+TTS+LLM chain |

### Blockers

None currently.

## Session Continuity

**Last session:** 2026-04-10

**Next action:** Define requirements for v3.0 milestone

---

*Last updated: 2026-04-10*
