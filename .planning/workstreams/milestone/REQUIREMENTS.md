# Requirements: Bottle English Learning

**Defined:** 2026-03-28  
**Milestone:** v2.1 优化学习体验和管理体验  
**Core Value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.

Archived shipped requirements: see `.planning/milestones/v2.0-REQUIREMENTS.md`.

## v2.1 Requirements

### Immersive Learning

- [x] **IMM-01**: User can replay the current sentence repeatedly without being forced to advance to the next sentence
- [x] **IMM-02**: User can enable or disable a single-sentence loop while studying
- [x] **IMM-03**: User can switch current-sentence playback speed between `0.75x`, `0.90x`, and `1.00x` during study
- [x] **IMM-04**: Replay, pause/continue, next/previous sentence, reveal-letter, and reveal-word actions behave predictably when combined
- [x] **IMM-05**: Fullscreen and subtitle-mask interactions do not incorrectly reset sentence playback or completion state

### Wordbook Review

- [ ] **WBK-01**: User can collect words or phrases from immersion with latest sentence context preserved
- [ ] **WBK-02**: Wordbook shows source count, latest context, next review time, review count, wrong count, and current mastery status
- [ ] **WBK-03**: User can open a due-review queue and review due items without manually filtering the full wordbook list
- [ ] **WBK-04**: User can mark a review result as `again` or `good` and the next review time updates accordingly

### Account Experience

- [ ] **ACC-01**: User must provide a unique username during registration
- [ ] **ACC-02**: User can update username after registration from a lightweight account settings entry
- [ ] **ACC-03**: User still logs in with email and password only
- [ ] **ACC-04**: Login and registration UI clearly distinguishes login fields from registration fields and uses branded Chinese-first copy

### Web Product Boundary

- [x] **WEB-01**: Web upload surface clearly explains the difference between Bottle 1.0 and Bottle 2.0 before generation starts
- [x] **WEB-02**: Web users cannot execute Bottle 1.0 generation through browser flows
- [x] **WEB-03**: Web users can follow a clear desktop CTA when Bottle 1.0 is the better fit

### Admin Operations

- [ ] **ADM-01**: Admin overview, users, wallet logs, redeem, and pricing surfaces display money in yuan as the primary unit
- [ ] **ADM-02**: Admin model naming uses `Bottle 1.0` and `Bottle 2.0` as primary labels, with technical names only as secondary notes
- [ ] **ADM-03**: Admin route structure is Chinese-first and grouped by operator workflow while preserving old deep links
- [ ] **ADM-04**: Editable pricing and read-only runtime diagnostics are presented as separate operator concerns

### Conversion & Monetization

- [x] **GROW-01**: Upload model cards and blocked-action states use clearer pricing anchors and scenario guidance to improve recharge/download intent
- [x] **GROW-02**: The milestone leaves a benchmark-backed monetization summary for later pricing or A/B follow-up without introducing subscriptions now

## Future Requirements

### Deferred

- **FUT-01**: Username can be used as an optional login credential
- **FUT-02**: Subscription or membership packaging on top of the current per-use model
- **FUT-03**: More advanced SRS modes such as graded intervals, tagging, and weak-word drills
- **FUT-04**: More browser-side generation capability where runtime reliability proves acceptable

## Out of Scope

| Feature | Reason |
|---------|--------|
| Username login | Expands auth risk beyond what v2.1 needs |
| Subscription plans | This milestone focuses on per-use conversion improvements first |
| Actual Bottle 1.0 execution in web flows | Bottle 1.0 remains desktop-only by product boundary |
| Full custom SRS engine | v2.1 only needs due-review and simple review outcomes |
| Replacing wallet storage semantics | UI and API display can standardize on yuan without changing current storage model immediately |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WEB-01 | Phase 7 | Complete |
| WEB-02 | Phase 7 | Complete |
| WEB-03 | Phase 7 | Complete |
| GROW-01 | Phase 7 | Complete |
| GROW-02 | Phase 7 | Complete |
| IMM-01 | Phase 8 | Complete |
| IMM-02 | Phase 8 | Complete |
| IMM-03 | Phase 8 | Complete |
| IMM-04 | Phase 8 | Complete |
| IMM-05 | Phase 8 | Complete |
| WBK-01 | Phase 9 | Pending |
| WBK-02 | Phase 9 | Pending |
| WBK-03 | Phase 9 | Pending |
| WBK-04 | Phase 9 | Pending |
| ACC-01 | Phase 10 | Pending |
| ACC-02 | Phase 10 | Pending |
| ACC-03 | Phase 10 | Pending |
| ACC-04 | Phase 10 | Pending |
| ADM-01 | Phase 11 | Pending |
| ADM-02 | Phase 11 | Pending |
| ADM-03 | Phase 11 | Pending |
| ADM-04 | Phase 11 | Pending |

**Coverage:**
- v2.1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-28*  
*Last updated: 2026-03-28 after initial v2.1 definition*
