# Project Research Summary

**Project:** Bottle English Learning v2.4 — CEFR Vocabulary Level Analysis
**Domain:** English language learning app — vocabulary difficulty visualization
**Researched:** 2026-04-03
**Confidence:** HIGH (existing codebase + validated vocabulary data)

## Executive Summary

The v2.4 milestone adds CEFR vocabulary level analysis as a visual overlay to an existing immersive learning system. The core insight: this is **not** a new feature requiring new architecture — it's a data pipeline that layers on top of existing components (ImmersiveLessonPage, AccountPanel, LessonList). The existing React 18.3.1 + Zustand 5 + Tailwind 4 stack is fully capable with only CSS token extensions for CEFR colors. The 50K-word COCA-derived vocabulary dataset (`cefr_vocab.json`) and analysis engine (`vocabAnalyzer.js`) already exist, reducing the work to integration and display only.

The recommended approach is **client-side batch analysis with localStorage caching**. All vocabulary lookup happens in the browser, keyed by lesson ID, with results cached for instant reloads. The user's CEFR level (stored in profile, default B1) drives the i+1 color calculation — green for words one level above user, yellow for words 2+ levels above. This approach avoids server load, works offline, and provides instant feedback on return visits.

The critical risk is **visual layer conflicts**: the existing letter-state system (green=correct, red=wrong, yellow=hint) and the new CEFR system must coexist without ambiguity. The plan allocates phase 1 to defining this visual contract before any rendering code is written.

## Key Findings

### Recommended Stack

The existing stack requires no new runtime dependencies. All requirements are satisfied by existing libraries:

**Core technologies:**
- **React 18.3.1** — sufficient for component-based word rendering, no changes needed
- **Zustand 5.0.11** — `persist` middleware handles localStorage-backed user CEFR level storage with `partialize` to store only `userILevel`
- **Tailwind CSS 4.2.1** — CSS `@theme` directive for CEFR color tokens (teal for i+1, orange for beyond)
- **Radix UI 1.x** — accessible component primitives for CEFR level picker dropdown
- **cefr_vocab.json (50K words)** — already embedded, COCA frequency-derived, loads once to sessionStorage

**Supporting patterns:**
- localStorage caching with version key (`cefr_analysis_v1:{lessonId}`) — simple and sufficient for <5MB per domain
- CSS `transform: scale()` for word selection animation — spring-like overshoot via `cubic-bezier(0.34, 1.56, 0.64, 1)`

### Expected Features

**Must have (table stakes):**
- **Batch vocabulary preprocessing** — On video open, iterate all subtitle sentences, lookup each word in cefr_vocab.json, tag with CEFR level, cache result in localStorage keyed by lessonId. Unknown words default to "SUPER" level.
- **User CEFR level setting in Personal Center** — 6-level selector (A1-C2), default B1, Duolingo-style Chinese descriptions per level, persist to user profile/backend.
- **i+1 color calculation** — Given user level, compute each word's display color: green = word level is exactly one level above user level; yellow = word level is 2+ levels above user level; neutral = at or below user level.
- **Previous sentence CEFR display** — Show color blocks over words in the previous sentence based on computed i+1 color. Only affects previous sentence (not current typing sentence).

**Should have (differentiators):**
- **Scale animation on word selection** — When user taps a word in previous sentence to add to wordbook, apply CSS scale transform (1.0 → 1.08) with spring overshoot over 200ms
- **Lesson-level CEFR badges in history** — At-a-glance lesson difficulty helps learners choose appropriate content

**Defer (v2.4.x+):**
- Sentence-level CEFR breakdown tooltip
- Adaptive level suggestion based on word coverage
- CEFR display in current sentence post-answer reveal

### Architecture Approach

Four pipelines layer on existing architecture without modifying the session state machine:

1. **Analysis Pipeline** — Triggered on video open. Check localStorage → if miss, load cefr_vocab.json → batch analyze all sentences → cache to localStorage. Uses chunked processing with `setTimeout(0)` yields to avoid UI blocking.

2. **Display Pipeline** — Reads cached analysis + user level → renders color blocks on previous sentence tokens. CEFR state lives in React component state (not session reducer), keeping session machine focused on playback/typing.

3. **Settings Pipeline** — Personal Center CEFR selector → PATCH profile API → update Zustand store → propagate to all listeners via `LEARNING_SETTINGS_UPDATED_EVENT`.

4. **History Pipeline** — LessonList reads from same localStorage cache used by analysis. No backend migration needed for v2.4.

### Critical Pitfalls

1. **Color conflict between letter states and CEFR levels** — Yellow means both "revealed by hint" and "CEFR level is hard". Mitigation: use distinct palettes (teal/blue for i+1, orange for beyond), never reuse existing letter-state colors.

2. **Batch analysis blocking initial lesson load** — Synchronous for-loop over 500+ sentences blocks UI for 2-5 seconds. Mitigation: chunked processing with `requestIdleCallback`, progress indicator, graceful degradation showing lesson without CEFR badges until analysis completes.

3. **Cache invalidation failures** — User changes CEFR level but old cached lessons still show stale difficulty badges. Mitigation: include user level and vocab version in cache key, implement cache TTL (30 days), clear analysis cache on level change.

4. **Scale animation conflicting with wordbook click handlers** — CSS transforms create new stacking context and can intercept pointer events. Mitigation: use `pointer-events: none` on animated pseudo-elements, or animate a wrapper not the click target.

5. **CEFR level setting not persisting or propagating** — Setting stored with different key than existing settings, or no update event dispatched. Mitigation: follow `learningSettings.js` pattern exactly, add to same settings object, dispatch `LEARNING_SETTINGS_UPDATED_EVENT`.

## Implications for Roadmap

Based on research, suggested phase structure (adapted to v2.4's 2-phase scope):

### Phase 1: CEFR Analysis Infrastructure + Personal Center Setting
**Rationale:** User level setting is the prerequisite input for all CEFR display. Analysis pipeline must exist before display can render anything. Both are foundation-layer work.

**Delivers:**
- `useVocabAnalysis` hook encapsulating analysis lifecycle
- localStorage caching with version-based keys
- User CEFR level selector in Personal Center
- Zustand store extension with `persist` middleware

**Implements:**
- Batch preprocessing pipeline with chunked processing
- CEFR level picker (Radix UI Select or button group)
- Cache invalidation on level change

**Avoids:** Pitfall #2 (cache invalidation), Pitfall #5 (persistence)

### Phase 2: CEFR Display in Immersive Mode + History Badges
**Rationale:** Display builds on analysis data. Previous sentence CEFR coloring is the core feature. History badges use the same cached data and can be added in parallel.

**Delivers:**
- CEFR color overlay on previous sentence word tokens
- Reusable `CEFRBadge` component
- Lesson list CEFR badges from localStorage cache
- Scale animation on wordbook selection

**Avoids:** Pitfall #1 (color conflicts — requires UI-SPEC.md first), Pitfall #3 (blocking — chunked processing in phase 1), Pitfall #4 (animation conflicts)

### Phase Ordering Rationale

1. **Settings before display** — User level drives color calculation. Without settings, display has no meaning.
2. **Analysis before display** — Cached analysis is the data source. Display degrades gracefully if analysis is pending.
3. **UI-SPEC before phase 2 coding** — Color conflicts are irreversible once coded into components. Visual contract must be defined first.
4. **Animation last in phase 2** — It layers on top of existing wordbook selection and doesn't affect core functionality.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** CEFR display component — requires UI-SPEC.md to define visual contract and avoid color conflicts. Use `gsd-ui-phase` skill.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Batch analysis and caching — well-documented localStorage patterns, chunked processing is standard React pattern
- **Phase 1:** Personal Center CEFR setting — follow existing `learningSettings.js` pattern exactly

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All libraries confirmed in package.json; Zustand persist official docs |
| Features | HIGH | Based on existing codebase + established CEFR methodology |
| Architecture | HIGH | Pipeline patterns well-understood; session machine isolation sound |
| Pitfalls | HIGH | Based on existing codebase analysis + CSS/React edge cases |

**Overall confidence:** HIGH

### Gaps to Address

- **CEFR color palette finalization:** STACK.md suggests teal/orange, but design system may prefer different hues. Validate with UI-SPEC.md during phase 2 planning.
- **Backend profile API contract:** AccountPanel PATCH endpoint schema not verified. Confirm `cefr_level` field is accepted or needs backend change.
- **vocabAnalyzer.js integration:** Analysis engine exists but integration points with ImmersiveLessonPage not verified. Confirm `analyzeVideo()` API signature.

## Sources

### Primary (HIGH confidence)
- Zustand persist middleware: https://zustand.docs.pmnd.rs/middleware/persist
- Tailwind CSS 4 theme customization: https://tailwindcss.com/docs/theme
- Existing codebase: `cefr_vocab.json`, `vocabAnalyzer.js`, `ImmersiveLessonPage.jsx`, `learningSettings.js`
- CEFR Word Level Methodology: https://cefrlookup.com/methodology

### Secondary (MEDIUM confidence)
- InfinLume n+1 color-coded learning: https://www.infinlume.com/
- Duolingo CEFR Level Alignment: https://duolingoguides.com/duolingo-language-levels-test-scores-cefr-proficiency-scale/
- Promova AI-driven vocabulary adaptation: https://goodereader.com/blog/digital-publishing/personalized-english-learning-how-promova-uses-ai-to-adapt-reading-and-vocabulary-training

### Tertiary (LOW confidence)
- localStorage best practices: WebSearch 2026 — general web guidance, no canonical source

---

*Research completed: 2026-04-03*
*Ready for roadmap: yes*
