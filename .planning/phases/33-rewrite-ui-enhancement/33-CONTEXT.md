# Phase 33: Rewrite UI Enhancement - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Rewrite the UI for the rewritten-text view in the Reading module: rewritten words/phrases display with yellow background blocks, original-text view preserves CEFR underlines unchanged. This is a frontend-only UI phase — no backend changes.

</domain>

<decisions>
## Implementation Decisions

### Yellow Highlight Style (rewrite-highlight)
- **D-01:** Yellow highlight uses `background-color` (full block), not underline
- **D-02:** Padding: `4px 8px` (top/bottom 4px, left/right 8px)
- **D-03:** Border-radius: `4px` (slightly rounded, modern feel)
- **D-04:** Color: `oklch(0.93 0.16 85)` — warm yellow that doesn't clash with existing teal/amber CEFR colors
- **D-05:** In the rewritten-text view, rewritten words no longer show `cefr-i-plus-one` or `cefr-above-i-plus-one` underlines — the yellow block replaces the CEFR underline visually

### Tooltip (rewrite-tooltip)
- **D-06:** Trigger: Hover — tooltip appears on mouse enter within 200ms, disappears on mouse leave
- **D-07:** Content: Show only the original word/phrase — format: "原文: {original}"
- **D-08:** No CEFR level shown in tooltip

### Selection + Rewrite Conflict
- **D-09:** When a word is both "rewritten" (has rewriteOriginal) AND "user-selected", yellow background takes priority as the base layer; blue selected highlight (`article-word--selected`) is applied on top as an inner accent — blue overlay on top of yellow background

### Original Text View (viewMode === "original")
- **D-10:** Words that have been rewritten (exist in rewriteMappings) do NOT show CEFR underlines in the original view — they get no CEFR styling, only the yellow block marks them as i+1
- **D-11:** Only non-rewritten words that are i+1 (CEFR level == userLevel + 1) show the teal CEFR underline (`cefr-i-plus-one`)
- **D-12:** Non-rewritten words that are above i+1 (CEFR level >= userLevel + 2) show the amber CEFR underline (`cefr-above-i-plus-one`)
- **D-13:** In original view, a tooltip is NOT needed for rewritten words — user can switch to rewritten view to see the original word

### CSS Specifics
- **D-14:** `.rewrite-highlight` replaces `cefr-i-plus-one` / `cefr-above-i-plus-one` in the class list (exclusive, not additive for underlines)
- **D-15:** `.rewrite-highlight` is ADDITIVE with `article-word--selected` (both classes applied when both conditions are true)
- **D-16:** The tooltip element (`.rewrite-tooltip`) uses `opacity: 0 → 1` transition on hover

### Desktop + Web Consistency
- **D-17:** All CSS uses oklch color values so that Electron desktop and web app render identically

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Reading Module
- `frontend/src/features/reading/ArticlePanel.jsx` — ArticleWord component, rewriteMappings handling, computeCefrClassName
- `frontend/src/features/reading/reading.css` — Existing `.rewrite-highlight`, `.rewrite-tooltip`, CEFR underline classes
- `frontend/src/features/reading/ReadingPage.jsx` — viewMode state, rewriteMappings prop flow
- `frontend/src/hooks/useReadingRewrite.js` — rewriteMappings structure: `Array<{original: string, rewritten: string}>`

### Prior Phase Context
- `.planning/ROADMAP.md` §Phase 33 — Success Criteria (UI-01 through UI-05) defining the yellow block requirements

</canonical_refs>

<codebase_context>
## Existing Code Insights

### Reusable Assets
- `ArticleWord` component in `ArticlePanel.jsx` — already has `isRewritten`, `rewriteOriginal`, `rewrite-tooltip` rendering
- `.rewrite-highlight` CSS class already exists — needs modification from underline to background-color
- `.rewrite-tooltip` CSS already exists — needs adjustment (content is already correct: "原文: {rewriteOriginal}")

### Established Patterns
- CEFR underline classes: `cefr-i-plus-one`, `cefr-above-i-plus-one`, `cefr-mastered` — these drive the `computeCefrClassName` function
- Selection animation: `article-word--selected` + `article-word--success` keyframe animation
- All colors use oklch system — Phase 33 yellow must also use oklch

### Integration Points
- `ArticleWord` in `ArticlePanel.jsx` — `rewriteOriginal` prop drives highlight; `isSelected` drives blue overlay
- `rewriteMappings` is passed from `ReadingPage` → `LeftPanel` → `ArticlePanel` → `ArticleWord`
- `viewMode` from `useReadingRewrite` controls which text is shown ("original" vs "rewritten")
- `rewriteMappings` prop in `ArticlePanel` is used to build `rewrittenSet` and `rewrittenToOriginal` maps in `useMemo`

</codebase_context>

<specifics>
## Specific Ideas

- "Yellow background block takes visual priority" — the yellow block replaces CEFR underlines for rewritten words, not stacks on top
- "CEFR underlines give way to the highlight" in rewritten view — underline CSS is overridden by rewrite-highlight
- "Original view shows CEFR underlines without regression" — original view has CEFR underlines only on non-rewritten words

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 33-rewrite-ui-enhancement*
*Context gathered: 2026-04-06*
