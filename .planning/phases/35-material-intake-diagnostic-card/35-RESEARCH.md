# Phase 35: Material Intake & Diagnostic Card - Research

**Researched:** 2026-04-10
**Status:** Ready for planning

## Objective

Research how to turn the current reading workspace from “submit and immediately auto-rewrite” into a resumable pre-generation diagnostic stage that still reuses the existing local-first CEFR pipeline, history system, and rewrite persistence.

## Key Findings

### 1. The current reading flow hard-codes auto-rewrite at submit time

- `frontend/src/features/reading/ReadingPage.jsx` currently calls `handleRewrite()` directly inside `handleArticleSubmit()`.
- The page switches from `input` straight to `reading`, so there is no intermediate stage for diagnosis, target-level confirmation, or resume-before-generation behavior.

Implication:
- Phase 35 must break this single transition into `input -> diagnosing/diagnostic -> generation confirmation -> reading`.
- The submit button can no longer mean “start rewrite now”; it has to mean “analyze this material first”.

### 2. The repo already has most of the diagnostic data locally

- `frontend/src/utils/vocabAnalyzer.js` already exposes `analyzeVideo()`, `checkFit()`, and CEFR extraction helpers.
- The analyzer already computes:
  - overall material level
  - per-level counts
  - user fit / suitability messaging
  - token-level CEFR distribution

Implication:
- Phase 35 does not need backend diagnosis endpoints.
- Material difficulty, user level comparison, and impact scoreboard can remain local-first and instant once the vocab table is loaded.

### 3. The existing rewrite DB is flexible enough to carry a diagnostic snapshot

- `frontend/src/features/reading/readingRewriteDB.js` persists arbitrary record objects in IndexedDB keyed by `articleId`.
- Existing records already store `originalText`, `rewrittenText`, `validI1Words`, `validAboveI1Words`, `wordLevels`, and `viewMode`.
- IndexedDB object stores in this repo are not schema-enforced per field, so adding fields such as `diagnosticSnapshot`, `flowStatus`, `selectedTargetLevel`, and `diagnosedAt` is low-risk.

Implication:
- The cleanest Phase 35 persistence model is to evolve the current rewrite record into a broader “reading generation draft” record rather than create a second local database.
- Resume behavior can key off `flowStatus` plus the presence of `diagnosticSnapshot` vs `rewrittenText`.

### 4. The current UI already has reusable building blocks for a scoreboard-style diagnostic stage

- `AnalysisPanel.jsx` already renders segmented CEFR bars, count labels, and compact stat modules.
- `HistoryPanel.jsx` already surfaces local draft/history entries and can be extended with state badges.
- `reading.css` already contains a two-column reading layout and sticky right-column behavior.

Implication:
- Phase 35 should add a dedicated diagnostic dashboard component, but it can borrow visual primitives and layout rhythm from the current reading module instead of introducing a new page framework.
- A segmented CEFR bar is a better fit than adding charting-library complexity for this phase.

### 5. Target-level override requires a small but important rewrite-hook contract change

- `useReadingRewrite.js` currently derives `targetLevel` internally from `userLevel + 1`.
- That behavior conflicts with the locked Phase 35 decision that users may choose any target level from `A1` to `C2`.

Implication:
- `handleRewrite()` must accept a target-level override from the diagnostic stage.
- The diagnostic stage and the rewrite stage must share the same persisted selected target so the confirmed generation matches what the user saw.

## Recommended Approach

1. Add a pure diagnostic helper module that turns CEFR report data into:
   - material difficulty
   - recommended target level
   - selected-target impact metrics
   - segmented bar data
   - estimated simplification percentage / counts
2. Extend the current rewrite record to persist:
   - `flowStatus`
   - `diagnosticSnapshot`
   - `selectedTargetLevel`
   - `recommendedTargetLevel`
   - `diagnosedAt`
3. Replace the submit-time auto-rewrite path with a diagnostic stage rendered inside `ReadingPage`.
4. Keep the existing reading/history shell, but let history items reopen into the diagnostic stage when a draft is diagnosed but not yet generated.
5. Only trigger `handleRewrite()` after explicit confirmation from the diagnostic dashboard.

## Risks & Constraints

- Existing records from pre-Phase-35 history may not contain diagnostic data; reopening them should still be handled gracefully by running diagnosis on demand.
- The `ReadingPage.jsx` file already mixes multiple responsibilities and currently has a declaration-order bug risk (`wordStats` references `wordLevels` before the hook destructure). Refactor carefully to avoid introducing more instability.
- The project constraint requires web-facing route changes to sync `app/static`, so final verification must include a frontend build plus `build:app-static`.

## Validation Strategy

Phase 35 should verify three things:

1. **Flow gating**
   - submitting text no longer auto-rewrites
   - the user always lands on a diagnostic stage first
2. **Resume contract**
   - a diagnosed-but-not-generated draft reopens directly into the diagnostic stage
   - history labels reflect pending vs generated state
3. **Target fidelity**
   - changing the target level updates persisted diagnostic data
   - confirmed generation uses the selected target, not a hidden `userLevel + 1` fallback

## Sources

### Planning Inputs
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/phases/35-material-intake-diagnostic-card/35-CONTEXT.md`
- `.planning/phases/35-material-intake-diagnostic-card/35-UI-SPEC.md`

### Codebase
- `frontend/src/features/reading/ReadingPage.jsx`
- `frontend/src/features/reading/LeftPanel.jsx`
- `frontend/src/features/reading/AnalysisPanel.jsx`
- `frontend/src/features/reading/HistoryPanel.jsx`
- `frontend/src/features/reading/ArticlePanel.jsx`
- `frontend/src/features/reading/readingRewriteDB.js`
- `frontend/src/hooks/useReadingRewrite.js`
- `frontend/src/utils/vocabAnalyzer.js`
