# Requirements: Bottle English Learning

**Defined:** 2026-03-31
**Core Value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.

## v2.2 Requirements

### Desktop Release and Updates

- [ ] **DESK-01**: User can download an official Windows installer for Bottle desktop and complete installation without relying on a dev build or manual file assembly.
- [ ] **DESK-02**: User can see the installed desktop app version and whether a newer official app version is available.
- [ ] **DESK-03**: User can trigger a desktop app update from inside the client and complete it without manually uninstalling and reinstalling when the update path is healthy.
- [ ] **DESK-04**: User can update Bottle desktop ASR model/resource files by downloading only the changed files instead of re-downloading the full model bundle.
- [ ] **DESK-05**: User can see update progress, completion state, and actionable recovery guidance when app or model update fails.

### Admin Announcements

- [ ] **ANNC-01**: Admin can create an announcement with title and content for release communication.
- [ ] **ANNC-02**: Admin can mark an announcement as changelog, banner, or modal so the same system can drive different user-facing placements.
- [ ] **ANNC-03**: Admin can pin and sort announcements so important information appears first.
- [ ] **ANNC-04**: Admin can delete announcements that should no longer be shown or managed.
- [ ] **ANNC-05**: User only sees active announcements that are intended for the current surface (web, desktop, or both).

### Desktop Hardening

- [ ] **SECU-01**: Operator can produce signed desktop release artifacts through a repeatable release pipeline instead of ad-hoc local packaging.
- [ ] **SECU-02**: User runs a packaged desktop client whose renderer only receives explicitly whitelisted preload capabilities needed by the product.
- [ ] **SECU-03**: Operator can verify which packaged runtime assets are protected inside the official desktop release and which assets remain updateable by design.

### Wordbook Review Experience

- [ ] **WORD-01**: User can enter a focused due-review flow that prioritizes words needing review ahead of passive browsing.
- [ ] **WORD-02**: User sees mastery/progress feedback for each word, and each review result updates the next review timing using a forgetting-curve-inspired rule.
- [ ] **WORD-03**: User can batch-manage wordbook entries for cleanup and organization without opening each word one by one.
- [ ] **WORD-04**: User can reopen example sentence and source lesson context while reviewing a word.
- [ ] **WORD-05**: User can request translation for a selected part of stored context instead of only translating the whole sentence.
- [ ] **WORD-06**: User reviews and manages words through a redesigned shadcn-style interface that removes non-essential information during focused review.

### UX Hints and Interaction Polish

- [ ] **HINT-01**: User sees a short translucent hover/focus hint on selected high-confusion buttons and controls.
- [ ] **HINT-02**: User sees the same lightweight hint pattern for selected blocked, recovery, or first-use states, and the hint auto-dismisses without trapping the workflow.

## Future Requirements

### Desktop Releases

- **DESK-06**: Operator can run staged rollout or forced-update policies per desktop release.

### Announcements

- **ANNC-06**: Admin can schedule announcement visibility by time window and finer-grained audience targeting.

### Wordbook

- **WORD-07**: User can hear pronunciation audio for supported wordbook entries during review.
- **WORD-08**: User can view phonetic symbols / IPA for supported wordbook entries during review.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Guaranteed anti-reverse-engineering desktop protection | Electron desktop apps cannot promise absolute secrecy; this milestone focuses on raising extraction cost and tightening release/runtime boundaries |
| Full CMS / marketing automation for announcements | v2.2 only needs release communication, placement, ordering, and deletion |
| Pronunciation audio and IPA as hard v2.2 deliverables | Implementation source, quality, and complexity need feasibility validation first |
| Subscription / membership redesign | This milestone is about release readiness and experience quality, not monetization model changes |
| Full browser parity for desktop-only runtime features | Browser/runtime boundaries remain acceptable for local tooling and packaged desktop capabilities |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DESK-01 | Phase 13 | Pending |
| DESK-02 | Phase 14 | Pending |
| DESK-03 | Phase 14 | Pending |
| DESK-04 | Phase 14 | Pending |
| DESK-05 | Phase 14 | Pending |
| ANNC-01 | Phase 16 | Pending |
| ANNC-02 | Phase 16 | Pending |
| ANNC-03 | Phase 16 | Pending |
| ANNC-04 | Phase 16 | Pending |
| ANNC-05 | Phase 16 | Pending |
| SECU-01 | Phase 13 | Pending |
| SECU-02 | Phase 15 | Pending |
| SECU-03 | Phase 14 | Pending |
| WORD-01 | Phase 17 | Pending |
| WORD-02 | Phase 17 | Pending |
| WORD-03 | Phase 18 | Pending |
| WORD-04 | Phase 17 | Pending |
| WORD-05 | Phase 18 | Pending |
| WORD-06 | Phase 18 | Pending |
| HINT-01 | Phase 18 | Pending |
| HINT-02 | Phase 18 | Pending |

**Coverage:**
- v2.2 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 after roadmap creation*
