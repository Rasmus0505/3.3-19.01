# State: Bottle English Learning — v2.8

**Current Milestone:** v2.8 阅读生成流水线
**Started:** 2026-04-10

## Project Reference

**Core Value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.

**Current Focus:** Phase 35: Material Intake & Diagnostic Card — NOT STARTED

## Current Position

**Milestone:** v2.8
**Phase:** Not started
**Plan:** —
**Status:** Milestone drafted; ready for Phase 35 discussion/planning

## Milestone Progress

| Phase | Name | Status | Plans |
|-------|------|--------|-------|
| 35 | Material Intake & Diagnostic Card | Not started | 0/? |
| 36 | Pipeline Orchestrator & Reading Pack | Not started | 0/? |
| 37 | Learning Handoff & Pack Library | Not started | 0/? |

## Performance Metrics

**Milestone v2.8:**
- Total phases: 3
- Total requirements: 13
- Completed: 0
- Progress: 0%

**Project-wide:**
- Total phases completed: 34
- Total milestones shipped: 7 (v2.0-v2.7)

## Accumulated Context

### Key Technical Context

- Existing reading workflow already includes local CEFR analysis, original/rewrite toggles, history, analysis panels, and IndexedDB persistence in the reading feature.
- `reading_rewrites_v3` already stores originalText, rewrittenText, mappings, validI1Words, validAboveI1Words, removedWords, wordLevels, and viewMode; v2.8 should evolve this into a reading-pack asset instead of replacing it.
- `ReadingPage.jsx`, `useVocabularyFilter.js`, and `ArticlePanel.jsx` already contain the core pedagogical logic for distinguishing i+1 from above-i+1; the main gap is product orchestration and presentation.
- OpenMAIC is the reference for stage-based generation UX, progress storytelling, session recovery, and assetized outputs, not for multi-agent classroom scope.

### Key Product Context

- v2.8 is competition-oriented: the primary demo story is "bring any English material, get a personalized i+1 reading pack".
- The milestone should emphasize transformation clarity: before generation, during generation, and after generation must all be legible to judges and users.
- The reading result must become a reusable learning asset with explicit next steps, not a one-off rewrite string.

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

**Last session:** 2026-04-10 — milestone scope refined from "reading rewrite" to "reading generation pipeline"

**Next action:** `/gsd-discuss-phase 35` to clarify the diagnostic-card and intake UX before planning

---

*Last updated: 2026-04-10*
