# Phase 40: Reading Pack Completion - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Reading packs become complete learning assets with four capabilities: structured vocabulary explanation panel, wordbook collection from pack, history reopen with difficulty badges, and explicit next-step actions. This phase finishes the carryover from v2.8 Phase 37.

This phase does NOT modify the reading pipeline itself (Phase 35-36), multi-modal inputs (Phase 39), or implement quiz/dictation generation (Phase 41/43) — it only adds placeholder entry points for those downstream phases.

</domain>

<decisions>
## Implementation Decisions

### Vocabulary Explanation Panel (PACK-01)
- **D-01:** Create a new `VocabExplainPanel` component, independent from `AnalysisPanel.jsx`. AnalysisPanel retains its existing CEFR distribution, level filters, and selection functionality. VocabExplainPanel focuses on structured vocabulary explanation display.
- **D-02:** Word definitions and contextual explanations come from LLM output generated during the rewrite pipeline stage. This phase only renders what the pipeline already produces — no new LLM API calls at display time.
- **D-03:** Two-section list layout: upper section "Worth Learning" (i+1 preserved words with contextual definition + CEFR level color tag), lower section "Simplified Expressions" (original → simplified word mappings from rewrite).
- **D-04:** Fixed right sidebar, side-by-side with reading pack content area, independently scrollable. Same layout position as AnalysisPanel but a different component shown in pack mode.

### Wordbook Collection (PACK-02)
- **D-05:** Collection entry points live in `VocabExplainPanel`: each word row has a "+" button for one-click collection, panel header has "Add All" batch button for bulk collection.
- **D-06:** Collected entries include: word + LLM-generated contextual definition + original sentence from reading pack content (extracted from pipeline output). This enriches wordbook entries beyond just the word itself.
- **D-07:** Collection success feedback uses scale (200ms) + green border flash (350ms) animation, consistent with Phase 25 wordbook success animation pattern.

### History Reopen & Badges (PACK-03)
- **D-08:** Difficulty badge displays the overall CEFR level from `diagnosticSnapshot` (e.g., "B1" with CEFR color tag), shown next to existing status badges in the history list. Compact layout — level label + color dot.
- **D-09:** History reopen restores complete pack state from IndexedDB — loads the full `rewriteRecord` including VocabExplainPanel data (validI1Words, validAboveI1Words, removedWords, wordLevels, pipeline output with definitions). User returns to the same pack view they left.
- **D-10:** Existing status badges preserved: "Reading Pack" (green) / "Interrupted" (amber) / "Pending" (gray). New CEFR difficulty badge appears alongside these, not replacing them.

### Next-Step Actions (PACK-04)
- **D-11:** Horizontal action button bar below pack content area. Buttons: "Continue Reading" / "Compare Original" / "Collect Vocabulary" / "Generate Quiz" / "Generate Dictation".
- **D-12:** "Generate Quiz" and "Generate Dictation" are placeholder entries — visible but disabled with "Coming Soon" tooltip. Phase 41 (Quiz) and Phase 43 (Dictation) will enable them when implemented.
- **D-13:** Action bar only appears when `flowStatus === "generated"` (pack fully generated). During pipeline or diagnostic stages, the bar is hidden.

### Claude's Discretion
- History badge exact styling (size, position relative to status badge)
- VocabExplainPanel internal scroll behavior and section collapse/expand
- "Continue Reading" and "Compare Original" button behavior (scroll-to-content vs view mode switch)
- "Collect Vocabulary" button behavior (open VocabExplainPanel with focus, or trigger batch add directly)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Reading Pack Completion — PACK-01, PACK-02, PACK-03, PACK-04 define acceptance criteria

### Existing Reading Pack Components (core integration points)
- `frontend/src/features/reading/ReadingPackPanel.jsx` — Pack display with original/rewritten/comparison tabs (132 lines)
- `frontend/src/features/reading/AnalysisPanel.jsx` — Right sidebar with CEFR distribution, level filters, selected word list (321 lines, NOT replaced — VocabExplainPanel is separate)
- `frontend/src/features/reading/ReadingPage.jsx` — Main orchestrator, mode state machine, layout routing (601 lines)
- `frontend/src/features/reading/readingRewriteDB.js` — IndexedDB persistence, rewriteRecord schema with validI1Words/validAboveI1Words/removedWords/wordLevels (240 lines)
- `frontend/src/features/reading/HistoryPanel.jsx` — History list with status badges, saveHistoryRecord, reading_history DB (298 lines)

### Wordbook Integration
- `frontend/src/features/wordbook/WordbookPanel.jsx` — Wordbook management, `/api/wordbook/collect` endpoint usage (858 lines)
- `frontend/src/features/wordbook/TranslationDialog.jsx` — Inline translation dialog
- `frontend/src/features/reading/ReadingPage.jsx` lines 213-258 — Existing `handleAddAllToWordbook` function pattern

### CEFR Utilities
- `frontend/src/utils/vocabAnalyzer.js` — VocabAnalyzer class, CEFR level lookup, i+1 extraction (747 lines)

### Animation Reference
- Phase 25 CONTEXT: wordbook success animation = scale (200ms) + green border flash (350ms) — D-07 reuses this pattern

### Prior Phase Context
- `.planning/phases/38-brand-rename/38-CONTEXT.md` — Brand is "Unlock"
- `.planning/phases/39-multi-modal-input-pipeline/39-CONTEXT.md` — sourceMetadata schema in IndexedDB, HistoryPanel source labels

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AnalysisPanel.jsx`: CEFR level filter chips, difficulty distribution bar — VocabExplainPanel can reference same color tokens
- `readingRewriteDB.js`: Already stores `validI1Words`, `validAboveI1Words`, `removedWords`, `wordLevels` — VocabExplainPanel data source
- `handleAddAllToWordbook` in ReadingPage.jsx: Batch wordbook collection pattern — extend for VocabExplainPanel single-word + batch
- `deriveFlowStatus()`: Existing status derivation — use to gate action bar visibility
- Phase 25 animation: scale + border flash pattern already implemented in wordbook — reuse for D-07

### Established Patterns
- State management: Zustand stores + React local state
- Styling: TailwindCSS utilities + CSS custom properties
- UI components: Radix-based (Tabs, Button, etc.) from `@/components/ui/`
- CEFR colors: Already established in immersive display (Phase 25) — reuse `computeCefrClassName`
- IndexedDB: `readingRewriteDB.js` handles all reading persistence — extend schema if needed

### Integration Points
- `ReadingPage.jsx` mode === "pack": Currently renders `ReadingPackPanel` + `AnalysisPanel` — add `VocabExplainPanel` as alternative/additional right sidebar
- `HistoryPanel.jsx` badge rendering: Add CEFR level badge alongside existing status badges
- `readingRewriteDB.js` record loading: History reopen loads full record — ensure VocabExplainPanel data is included
- `app/static/` sync required per Web Delivery Contract

</code_context>

<specifics>
## Specific Ideas

- VocabExplainPanel upper section "Worth Learning" should show i+1 preserved words with their LLM-generated contextual definition and CEFR color tag — user wants these to be immediately learnable without extra clicks.
- LLM definitions are pipeline-time output, not on-demand — this means the rewrite pipeline may need to be extended to output structured word definitions. Researcher should investigate current pipeline output format.
- Collection success animation must match Phase 25 exactly (scale 200ms + green border flash 350ms) for consistency.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 40-reading-pack-completion*
*Context gathered: 2026-04-10*
