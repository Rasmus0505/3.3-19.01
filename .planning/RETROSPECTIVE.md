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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 3 | 8 | Initial foundation with cloud + desktop generation |
| v1.1 | 4 | 10 | Urgent admin/lesson/link cleanup |
| v2.0 | 2 | 5 | Billing/admin simplification and polish |
| v2.1 | 7 | 22 | Full product experience overhaul (spec-first approach) |

### Cumulative Quality

| Milestone | Requirements | Verified | Audit Status |
|-----------|-------------|----------|--------------|
| v1.0 | 8 | All | passed |
| v1.1 | 6 | All | passed |
| v2.0 | 8 | All | passed |
| v2.1 | 22 | All | passed |

### Top Lessons (Verified Across Milestones)

1. Desktop-first capability split (local models/ASR on desktop, cloud on web) continues to be the right architectural call for this product's non-technical audience
2. Locking product specs before implementation (Phase 7 pattern) significantly reduces downstream rework compared to earlier milestones
3. Static web delivery contract (`app/static` sync as verification gate) prevents "works in dev, broken in prod" web deployment issues
