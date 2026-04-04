# Project Retrospective

_A living document updated after each milestone. Lessons feed forward into future planning._

## Milestone: v2.1 — 优化学习体验和管理体验

**Shipped:** 2026-03-31
**Phases:** 7 | **Plans:** 22 | **Sessions:** ~10 (estimate)

### What Was Built
- Official competitor matrix and Bottle 1.0/2.0 positioning spec that lock the v2.1 naming, boundary, and monetization narrative for all downstream phases
- Memo-style desktop public-link import productized with explicit support promise, failure boundary, and release checklist
- Immersive learning refactored into reducer-driven state machine: single-sentence loop, fixed 0.75x/0.90x/1.00x playback rate, fullscreen/mask/previous-sentence all preserved as display-only preferences
- Wordbook upgraded from passive collection list to active due-review entry point with again/good grading and next-review scheduling
- Account system added unique username registration, tabbed auth UI, and personal center shell
- Admin fully Chinese-first, yuan-primary, Bottle 1.0/2.0 primary naming with technical names demoted to secondary notes
- Conversion copy locked: model cards, recharge recovery, desktop CTA, and static web bundle all finalized
- Two critical desktop link-import bugs fixed: desktopSourcePath IPC serialization loss and missing video cover from yt-dlp thumbnail
- Five frontend polish items: wordbook toast, button color, number input spinners, speed control spacing, audio-only speaker button

### What Worked
- Phase 7 product spec (naming, CTA, copy deck) was stable enough to support 6 downstream phases without requiring rework — locking specs first paid off
- Phase 07.1 inserted as urgent handled desktop Memo workflow boundary without derailing Phase 8-12
- Phase 11 fold-in of the numeric-input todo kept the phase cohesive instead of fragmenting the scope
- Immersive refactor (Phase 8) and UI polish (Phase 12) maintained the same component surface, allowing 12 to ship without structural changes

### What Was Inefficient
- Phase 12 was created and planned but only partially executed before being removed and re-created — better to reserve phase numbers before planning
- Phase 11 bug fix (desktopSourcePath + thumbnail) was embedded in Phase 11 itself as plan 04 instead of being tracked as a separate urgent item — the plan numbering (11-01 through 11-04) became confusing
- Nyquist validation was missing for Phases 10, 11, and 12 — these should be added retroactively or validated inline during execution

### Patterns Established
- Product boundary specs (Phase 7) should be completed before implementation phases start to avoid downstream rework
- Decimal phase insertion (07.1) works well for urgent scope additions between existing phases
- `app/static` sync is a required verification step for any web-facing change — never mark a feature done without it
- Inline task verification in SUMMARY.md is acceptable for small phases but full VERIFICATION.md is preferred

### Key Lessons
1. Phase 7 spec-before-implementation discipline eliminated the "build first, spec later" rework cycle seen in earlier milestones
2. Object.defineProperty fields on File objects do not survive Electron IPC JSON serialization — always use plain data fields for IPC
3. yt-dlp thumbnail field (`metadata.thumbnail`) provides the most reliable video cover source for link imports; file-extraction fallback handles cases where thumbnail is absent
4. Merging a related todo into an existing phase (numeric-input → Phase 11) is better than creating a new phase for thin scope

### Cost Observations
- Model mix: Mostly Sonnet 4, some Opus for planning/auditing
- Sessions: ~10 planning/execution sessions across 7 phases
- Notable: Phase 07.1 and Phase 11-04 both required deep Electron/Node.js IPC and yt-dlp integration work — these represented the most complex technical execution in v2.1

---

## Milestone: v2.2 — 桌面端稳定发版与词本复习 UX

**Shipped:** 2026-04-02
**Phases:** 13–18 | **Plans:** ~10

### What Was Built
- Desktop stable-only release channel with signed NSIS installer
- Model delta update system for both program and ASR model/resources
- Desktop runtime security hardening: 31 preload methods audited, renderer sandbox enforced, openExternalUrl whitelist
- Announcement system: CRUD, changelog/banner/modal delivery, admin management UI
- Wordbook review UX overhaul: due queue, mastery feedback, forgetting curve scheduling, batch ops, translation dialog
- Lightweight hint system applied across key buttons and ambiguous actions

### What Worked
- Security audit as a dedicated phase (Phase 15) kept the work focused and verifiable
- Announcement system design was simple enough to ship in one phase without scope creep
- Wordbook review flow separated cleanly into state machine (due queue, grading) and UI (feedback, batch ops)

### What Was Inefficient
- Phase 16 (Announcement) felt thin (3 plans) after Phase 15's intensive security work — could have been combined or planned more carefully

### Key Lessons
1. Electron preload audit should be done before each major desktop release, not reactively
2. Announcements via admin CRUD + in-app delivery is a low-cost feature that improves user communication significantly
3. Wordbook spaced-repetition (forgetting curve scheduling) is implementable with simple again/good grading without SM-2 complexity

---

## Milestone: v2.3 — 学习体验与导入流程优化

**Shipped:** 2026-04-03
**Phases:** 19–23 | **Plans:** 10

### What Was Built
- Immersive learning 4-bug fix: autoAdvanceGuard guard + TTS three-tier fallback + answer box yellow/green color differentiation
- Wordbook entry enhancements: independent translation block with bg-muted/20 + Web Speech API pronunciation with spinner and 2s auto-recovery
- Material import UX: default link tab, simplified copy, auto-fill title, shortcut two-row layout
- Subtitle mask position reset: prevLessonIdRef forces center on new lessonId, enabled state persists via localStorage
- Link restore enhancement: source_url check + hasLessonMedia cache check before yt-dlp re-download
- Admin user ops: username in user activity, redemption code batch Chinese status, delete+abandon+refund

### What Worked
- Small focused phases (19, 20, 21) with 1-2 plans executed quickly (10-15 min each)
- Bug fix pattern (identify → fix → verify) worked well for the immersive typing issues
- Translation block with independent background area above each entry maintained card layout without height changes

### What Was Inefficient
- Phase 21.1 (admin redemption codes) was inserted as urgent mid-sprint, fragmented the context from Phase 21 material import work
- Phase 22 (import dialog + video extraction) was planned but ultimately removed from scope — better to validate with research before planning

### Key Lessons
1. Small phases with 1-2 plans are viable for bug fixes and small UI polish tasks — execution is fast and context is tight
2. Research before planning a complex feature (Phase 22) would have caught the scope issues earlier and avoided wasted planning effort
3. prevLessonIdRef pattern for cross-lesson state isolation is simple and reliable

---

## Milestone: v2.4 — 词汇等级预处理与 CEFR 沉浸式展示

**Shipped:** 2026-04-04
**Phases:** 24–25 | **Plans:** 8

### What Was Built
- CEFR vocabulary infrastructure: vocabAnalyzer loads 250K-word COCA-derived cefr_vocab.json, analyzes sentences at lesson open, caches results in localStorage with chunked setTimeout(0) execution
- Personal center CEFR selector: A1-C2 RadioGroup with Duolingo-style Chinese descriptions, PATCH API + Zustand dual-write, persists across devices
- Immersive CEFR underlines: Every word slot in the answer box shows a colored underline from lesson start — green (i+1), red (above i+1), transparent/gray (mastered)
- Wordbook CEFR color bands + animation: Previous sentence tokens display CEFR color bands; adding to wordbook triggers scale + green border flash animation
- History list CEFR badges: Lesson cards show CEFR distribution bar + dominant level badge, with background analysis for unanalyzed lessons

### What Worked
- Phase 24 and 25 worked well as a dependency chain: infrastructure (24) → display (25), no overlap
- UI-SPEC.md written before code in Phase 25 gave clear visual contracts that avoided rework during implementation
- SMALL 250K-word vocab file committed as data asset alongside generator script (`cefr_vocab_generator.py`)

### What Was Inefficient
- "查不到→SUPER→红色" bug existed in Phase 25 code because the `|| "SUPER"` fallback was present in 25-02 but not caught during execution — caught by user feedback instead of verification
- Phase 25-04 had a build error from incorrect lessonSlice import that was auto-fixed, but the fix should have been validated by plan review before execution started

### Key Lessons
1. UI-SPEC before code (Phase 25 Plan 01) is worth the upfront time — prevents color/logic rework in Plans 02-04
2. Verify `|| "SUPER"` patterns in plan review: words not in vocab table should be gray, not treated as SUPER
3. 250K-word COCA vocabulary is MIT-licensed and committed as a data file — any future vocab improvements can come from extending this list
4. `cefr-mastered` class with higher CSS specificity than `letter-cell--revealed` is the right pattern for mastered+revealed underline gray

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 3 | 8 | Initial foundation with cloud + desktop generation |
| v1.1 | 4 | 10 | Urgent admin/lesson/link cleanup |
| v2.0 | 2 | 5 | Billing/admin simplification and polish |
| v2.1 | 7 | 22 | Full product experience overhaul (spec-first approach) |
| v2.2 | 13–18 | ~10 | Desktop stable release, wordbook review UX overhaul |
| v2.3 | 19–23 | 10 | Learning UX polish, bug fixes |
| v2.4 | 24–25 | 8 | CEFR vocabulary intelligence + immersive display |

### Cumulative Quality

| Milestone | Requirements | Verified | Audit Status |
|-----------|-------------|----------|--------------|
| v1.0 | 8 | All | passed |
| v1.1 | 6 | All | passed |
| v2.0 | 8 | All | passed |
| v2.1 | 22 | All | passed |
| v2.2 | ~10 | All | passed |
| v2.3 | 12 | All | passed |
| v2.4 | 18 | All | passed |

### Top Lessons (Verified Across Milestones)

1. Desktop-first capability split (local models/ASR on desktop, cloud on web) continues to be the right architectural call for this product's non-technical audience
2. Locking product specs before implementation (Phase 7 pattern) significantly reduces downstream rework compared to earlier milestones
3. Static web delivery contract (`app/static` sync as verification gate) prevents "works in dev, broken in prod" web deployment issues
