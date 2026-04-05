# Roadmap: v2.7 阅读板块重写增强

**Milestone:** v2.7
**Created:** 2026-04-06
**Granularity:** Standard (3-5 phases)

## Phases

- [ ] **Phase 32: Rewrite Persistence** — IndexedDB storage, auto-load on reopen, per-article toggle, history indicators
- [ ] **Phase 33: Rewrite UI Enhancement** — Yellow highlight blocks, tooltips, CEFR underline priority
- [x] **Phase 34: Prompt Optimization** — New structured prompts, token estimation, quality testing ✅ COMPLETE (2026-04-06)

---

## Phase Details

### Phase 32: Rewrite Persistence

**Goal:** Rewrite results persist in IndexedDB with auto-load and per-article toggle; history list shows rewrite status

**Depends on:** None (first phase of v2.7)

**Requirements:** RP-01, RP-02, RP-03, RP-04

**Success Criteria** (what must be TRUE):

1. User can unlock a rewrite and the result (original + rewritten + mappings + articleId) is saved to IndexedDB `reading_rewrites` store — user sees no data loss on page refresh
2. When reopening a previously-read article, the saved rewrite loads automatically without calling the API — content appears immediately
3. User can toggle between "original" and "rewritten" views at any time; the selected view persists per article and survives browser restart
4. History list displays a visual indicator (e.g., badge) on articles that have saved rewrites; user can clear a saved rewrite and the indicator disappears

**Plans:** TBD

---

### Phase 33: Rewrite UI Enhancement

**Goal:** Rewritten words display with yellow highlight blocks; CEFR underlines give way to the highlight; original view shows CEFR underlines without regression

**Depends on:** Phase 32 (needs rewrite storage to determine which words are rewritten)

**Requirements:** UI-01, UI-02, UI-03, UI-04, UI-05

**Success Criteria** (what must be TRUE):

1. Rewritten words/phrases are visually wrapped in yellow background blocks — distinct from CEFR underlines, clearly visible on both desktop and web
2. Hovering over a yellow highlight shows a tooltip displaying the original word or phrase — tooltip appears within 200ms, disappears on mouse leave
3. Words that have been rewritten no longer show i+1 (green) or above-i+1 (red) CEFR underlines — the yellow block takes visual priority
4. Yellow highlight is visually consistent between desktop client and web app — same color values, same padding/margin, no platform-specific differences
5. In "original text" view, CEFR underlines continue to display exactly as they did before this phase — no visual regression for non-rewritten content

**Plans:** TBD

**UI hint:** yes

---

### Phase 34: Prompt Optimization

**Goal:** Rewrite prompt redesigned to return simplified words only (per-order array); token cost displayed before rewrite; quality verified

**Depends on:** None (backend-only phase, can run in parallel with Phase 32 if needed)

**Requirements:** PO-01, PO-02, PO-03, PO-04

**Schema (simplified, per-order array):**

User sends:
```
原文：I used to loathe and eschew perusing English.
需要简化的词：loathe, eschew, perusing
```

Model returns:
```json
["hate", "avoid", "carefully reading"]
```
→ Frontend matches by order: `["loathe", "eschew", "perusing"]` → `["hate", "avoid", "carefully reading"]`

**Success Criteria** (what must be TRUE):

1. The new rewrite prompt returns a JSON array of simplified words/phrases — one entry per input word, in the same order, no mapping objects, no freeform text
2. Model responses preserve original sentence structure (only vocabulary replacement, minimal sentence restructuring) — verified by human review of 3+ sample outputs
3. Before confirming a rewrite, the UI displays estimated token consumption and approximate cost — user can make an informed decision
4. The new prompt is tested with at least 3 texts of varying difficulty and length; results show token savings of at least 20% compared to the original prompt while maintaining rewrite quality

**Plans:** 1 plan — PLANNED
- [ ] 34-01-PLAN.md — 新 /simplify-words endpoint + Token 估算 API + 前端集成

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 32. Rewrite Persistence | 0/? | Not started | — |
| 33. Rewrite UI Enhancement | 0/? | Not started | — |
| 34. Prompt Optimization | 1/1 | Complete | 2026-04-06 |

---

## Requirement Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| RP-01 | Phase 32 | Pending |
| RP-02 | Phase 32 | Pending |
| RP-03 | Phase 32 | Pending |
| RP-04 | Phase 32 | Pending |
| UI-01 | Phase 33 | Pending |
| UI-02 | Phase 33 | Pending |
| UI-03 | Phase 33 | Pending |
| UI-04 | Phase 33 | Pending |
| UI-05 | Phase 33 | Pending |
| PO-01 | Phase 34 | Done |
| PO-02 | Phase 34 | Done |
| PO-03 | Phase 34 | Done |
| PO-04 | Phase 34 | Pending |

**Coverage:** 13/13 v1 requirements mapped

---

## Phase Dependencies

```
Phase 32 (Rewrite Persistence)
       │
       ├──► Phase 33 (Rewrite UI Enhancement)
       │
Phase 34 (Prompt Optimization) — independent, backend-only
```

**Notes:**
- Phase 33 depends on Phase 32 because UI needs rewrite storage to know which words are rewritten
- Phase 34 is independent because it only changes backend prompts, not frontend storage or UI
- Phases 32 and 34 can run in parallel if needed (no mutual dependencies)

---

*Last updated: 2026-04-06*
