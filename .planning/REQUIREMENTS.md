# Requirements: Bottle English Learning v2.4

**Defined:** 2026-04-03
**Core Value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### CEFR Analysis

- [ ] **CEFR-01**: User can preprocess all subtitle text when opening a lesson — each word is tagged with its CEFR level (A1/B1/B2/C1/C2/SUPER) via local vocabAnalyzer lookup
- [ ] **CEFR-02**: Preprocessing results are cached in localStorage keyed by lessonId with version prefix (`cefr_analysis_v1:{lessonId}`) — subsequent opens skip re-analysis
- [ ] **CEFR-03**: Batch analysis runs in chunked mode (`setTimeout(0)` or `requestIdleCallback`) to avoid blocking the UI thread during long videos
- [ ] **CEFR-04**: Unknown words (not in cefr_vocab.json) default to SUPER level so they always appear as "hard"

### CEFR Display — Immersive Learning

- [ ] **CEFR-05**: Immersive answer board displays both current sentence and previous sentence — each word has a CEFR level badge overlay
- [ ] **CEFR-06**: CEFR badge colors are distinct from existing letter-state colors: teal/blue for i+1 (within reach), amber/orange for above i+1 (too hard) — NO overlap with green/red/yellow letter states
- [ ] **CEFR-07**: CEFR badge is a word-level overlay (covers entire word) — does NOT override letter colors (green=correct, red=wrong, yellow=hint remain visible)
- [ ] **CEFR-08**: CEFR color calculation: green badge when word level == user_i_level + 1; yellow badge when word level >= user_i_level + 2; no badge for words at or below user_i_level
- [ ] **CEFR-09**: CEFR display contract (exact colors, badge shape, z-index layering) is defined in UI-SPEC.md before any rendering code

### CEFR Display — History & Badges

- [ ] **CEFR-10**: Lesson history list shows a CEFR badge on each lesson card — color block + level text (e.g., B1, B2) — read from cached analysis results
- [ ] **CEFR-11**: Lesson-level CEFR distribution is calculated as aggregate from preprocessed word levels (e.g., "B1: 45%, B2: 30%, C1: 15%, Other: 10%")

### Personal Center — i Level Setting

- [ ] **CEFR-12**: Personal center exposes a CEFR level selector — user sets their i level (default B1, options: A1/A2/B1/B2/C1/C2)
- [ ] **CEFR-13**: Level selector includes Duolingo-style Chinese descriptions for each level (e.g., "A1: 能理解和使用熟悉的日常表达和非常简单的句子")
- [ ] **CEFR-14**: i level is stored in user profile (PATCH /api/users/me or equivalent) so it persists across devices
- [ ] **CEFR-15**: i level is also cached locally (Zustand persist) for offline use — synced with server on next online

### Wordbook Selection Interaction

- [ ] **CEFR-16**: Tapping/selecting a word from the previous sentence to add to wordbook triggers a smooth scale-up animation (1.0 → 1.08, 200ms ease-out) as the primary feedback signal
- [ ] **CEFR-17**: After a word is added to wordbook, its feedback distinguishes "selected for wordbook" from "CEFR difficulty color" — use scale + border/badging, NOT background color change (which now conflicts with CEFR display)
- [ ] **CEFR-18**: Hover state on selectable words in previous sentence shows subtle scale + cursor hint

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Adaptive Learning

- **CEFR-21**: Track per-word review accuracy and suggest i level adjustments based on performance
- **CEFR-22**: Automatic CEFR level detection via short placement test (deferred — self-assessment with guidance preferred over test)

### Advanced Analysis

- **CEFR-23**: Paragraph-level CEFR distribution visualization in lesson detail view
- **CEFR-24**: Per-sentence CEFR breakdown in video scrubber (shows difficulty at each segment)

### Social

- **CEFR-25**: Share lesson CEFR profile (e.g., "This video is B2 — 70% known words")
- **CEFR-26**: Community CEFR rating (aggregate user reports for lessons without pre-analysis)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Server-side CEFR analysis on every request | Conflicts with goal of zero server load for vocabulary processing |
| Dynamic CEFR reassessment based on user performance | Statistical noise from small samples; user manually updates level instead |
| Per-word CEFR color in the current (typing) sentence | Visual clutter competes with typing task; previous sentence is sufficient |
| Separate CEFR vocabulary database | 50K COCA-derived wordlist already exists in codebase |
| Automatic CEFR level detection via test | Self-assessment with Duolingo-style descriptions is more reliable and lower friction |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CEFR-01 | Phase 24 | Pending |
| CEFR-02 | Phase 24 | Pending |
| CEFR-03 | Phase 24 | Pending |
| CEFR-04 | Phase 24 | Pending |
| CEFR-05 | Phase 25 | Pending |
| CEFR-06 | Phase 25 | Pending |
| CEFR-07 | Phase 25 | Pending |
| CEFR-08 | Phase 25 | Pending |
| CEFR-09 | Phase 25 | UI-SPEC ✅ |
| CEFR-10 | Phase 25 | Pending |
| CEFR-11 | Phase 25 | Pending |
| CEFR-12 | Phase 24 | Pending |
| CEFR-13 | Phase 24 | Pending |
| CEFR-14 | Phase 24 | Pending |
| CEFR-15 | Phase 24 | Pending |
| CEFR-16 | Phase 25 | Pending |
| CEFR-17 | Phase 25 | Pending |
| CEFR-18 | Phase 25 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-03 after roadmap creation (Phase 24/25)*
