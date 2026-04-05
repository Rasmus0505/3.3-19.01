# State: Bottle English Learning — v2.7

**Current Milestone:** v2.7 阅读板块重写增强
**Started:** 2026-04-06

## Project Reference

**Core Value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.

**Current Focus:** Phase 32: Rewrite Persistence

## Current Position

**Milestone:** v2.7
**Phase:** 32 (starting)
**Plan:** Not started
**Status:** Not started

## Milestone Progress

| Phase | Name | Status | Plans |
|-------|------|--------|-------|
| 32 | Rewrite Persistence | Not started | 0/? |
| 33 | Rewrite UI Enhancement | Not started | 0/? |
| 34 | Prompt Optimization | Not started | 0/? |

## Performance Metrics

**Milestone v2.7:**
- Total phases: 3
- Total requirements: 13
- Completed: 0
- Progress: 0%

**Project-wide:**
- Total phases completed: 31 (up to v2.6)
- Total milestones shipped: 6 (v2.0–v2.6)

## Accumulated Context

### Key Technical Context

- IndexedDB `reading_rewrites` store already exists (Phase 29) — needs articleId extension
- IndexedDB `reading_history` store already exists (Phase 29) — needs rewrite indicator
- CEFR vocabulary (fixed-v1) already complete — used to identify which words to simplify
- Current rewrite_mappings already support 1:1 word mapping
- Backend: `app/api/routers/llm.py` has rewrite endpoint, system prompts at lines 260-283
- Frontend: `frontend/src/features/reading/ArticlePanel.jsx` renders per-word CEFR + rewrite highlights
- CSS: `frontend/src/features/reading/reading.css` has rewrite-highlight CSS + CEFR underline CSS

### Key Decisions for v2.7

| Decision | Rationale |
|----------|-----------|
| Rewrite persistence via IndexedDB (not server) | Local-first constraint: CEFR analysis, rewrite results all execute in browser |
| Yellow highlight blocks replace CEFR underlines | Rewordify reference: color blocks are more visible than underlines |
| Prompt redesign with sentence-level JSON output | Reduce token consumption while maintaining quality |
| Phase 34 is independent (backend-only) | Can run in parallel with Phase 32 if team capacity allows |

### Blockers

None currently.

## Session Continuity

**Last session:** 2026-04-06 — v2.6 milestone completed, v2.7 started

**Next action:** `/gsd-plan-phase 32` to create execution plan for Phase 32 (Rewrite Persistence)

---

*Last updated: 2026-04-06*
