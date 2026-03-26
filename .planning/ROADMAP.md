# Roadmap: Bottle English Learning

## Overview

This roadmap turns an already-running English learning codebase into a clearer runtime-aware product. The first milestone is to stabilize the shared cloud path, make the desktop client the full-capability experience, normalize lesson output across generation modes, and align billing/admin operations with the actual product boundaries.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Shared Cloud Generation** - Harden Bottle 2.0 as the shared web + desktop generation path
- [ ] **Phase 2: Desktop Local Generation** - Make Bottle 1.0 a low-friction desktop capability
- [ ] **Phase 3: Lesson Output Consistency** - Normalize generated lessons and learning flows across generation routes
- [ ] **Phase 4: Desktop Link Import** - Support URL-based media import on desktop with local tooling
- [ ] **Phase 5: Billing and Admin Alignment** - Align pricing, redeem, and runtime visibility with the product strategy
- [ ] **Phase 6: Product Polish and Fallbacks** - Reduce learner friction and harden edge-case behavior

## Phase Details

### Phase 1: Shared Cloud Generation
**Goal**: Web and desktop users can reliably generate lessons with Bottle 2.0 without pushing the main server into default heavy media processing.
**Depends on**: Nothing (first phase)
**Requirements**: [AUTH-01, AUTH-02, AUTH-03, BILL-01, WEB-01, WEB-02, WEB-03, DESK-02]
**Success Criteria** (what must be TRUE):
  1. Web users can complete a Bottle 2.0 lesson-generation flow from the main product experience.
  2. Desktop users can trigger Bottle 2.0 from the same product surface without leaving the normal workflow.
  3. Product UI clearly distinguishes supported vs unsupported runtime capabilities.
  4. The central server is not acting as the default long-running media worker for this path.
**Plans**: 3 plans

Plans:
- [x] 01-01: Stabilize shared Bottle 2.0 upload/task pipeline
- [x] 01-02: Clarify runtime capability gating in web and desktop UI
- [ ] 01-03: Harden auth/session prerequisites around generation entry points

### Phase 2: Desktop Local Generation
**Goal**: Desktop users can use Bottle 1.0 locally with minimal setup friction and predictable readiness checks.
**Depends on**: Phase 1
**Requirements**: [DESK-01, DESK-03]
**Success Criteria** (what must be TRUE):
  1. Desktop users can prepare Bottle 1.0 without understanding models, ffmpeg, or helper internals.
  2. Desktop users can generate a lesson locally on their machine with Bottle 1.0.
  3. Local-generation readiness failures are surfaced clearly with actionable guidance.
**Plans**: 3 plans

Plans:
- [ ] 02-01: Harden local model/tool readiness and install experience
- [ ] 02-02: Stabilize Bottle 1.0 desktop generation pipeline
- [ ] 02-03: Improve local-generation error handling and recovery

### Phase 3: Lesson Output Consistency
**Goal**: Lessons generated from any supported route become consistent learning artifacts for review and spelling practice.
**Depends on**: Phase 2
**Requirements**: [LESS-01, LESS-02, LESS-03, LEARN-01, LEARN-02]
**Success Criteria** (what must be TRUE):
  1. Bottle 1.0 and Bottle 2.0 outputs both result in usable lesson records.
  2. Users can open generated lessons and enter learning/practice flows regardless of generation source.
  3. Progress, partial failure, and success states are visible and understandable in product UI.
**Plans**: 3 plans

Plans:
- [ ] 03-01: Normalize lesson artifacts and status contracts across generation routes
- [ ] 03-02: Align lesson detail and practice entry behavior
- [ ] 03-03: Improve generation-progress and result-state presentation

### Phase 4: Desktop Link Import
**Goal**: Desktop users can turn supported links into lesson-generation inputs through local tooling.
**Depends on**: Phase 3
**Requirements**: [DESK-04]
**Success Criteria** (what must be TRUE):
  1. Desktop users can submit a supported media URL and import it through the desktop client.
  2. Local yt-dlp / ffmpeg tooling handles the link-import preparation path.
  3. Users receive clear progress and failure feedback during URL import.
**Plans**: 2 plans

Plans:
- [ ] 04-01: Stabilize desktop URL-import backend/helper flow
- [ ] 04-02: Integrate URL import into the desktop generation experience

### Phase 5: Billing and Admin Alignment
**Goal**: Product pricing, redeem flows, and runtime operations reflect the actual Bottle 1.0 / Bottle 2.0 strategy.
**Depends on**: Phase 4
**Requirements**: [BILL-02, BILL-03, ADMIN-01, ADMIN-02, ADMIN-03]
**Success Criteria** (what must be TRUE):
  1. Admin can configure pricing for Bottle 1.0 and Bottle 2.0 in a maintainable way.
  2. Users pay with platform-managed points rather than personal ASR keys.
  3. Admin can inspect health/runtime state relevant to generation operations.
**Plans**: 3 plans

Plans:
- [ ] 05-01: Align billing model and point deduction rules with runtime modes
- [ ] 05-02: Harden admin pricing/configuration controls
- [ ] 05-03: Improve operational visibility for generation support status

### Phase 6: Product Polish and Fallbacks
**Goal**: Learners can use the product with low friction even when runtime limits, offline issues, or feature boundaries appear.
**Depends on**: Phase 5
**Requirements**: [LEARN-03]
**Success Criteria** (what must be TRUE):
  1. Learners understand what to do when a feature is unavailable on their current surface.
  2. Product messaging and fallback behavior reduce confusion between desktop-only and web-safe flows.
  3. Common edge cases fail gracefully without forcing technical troubleshooting.
**Plans**: 2 plans

Plans:
- [ ] 06-01: Improve onboarding, labels, and capability messaging
- [ ] 06-02: Harden fallback and recovery flows around runtime-specific failures

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Shared Cloud Generation | 2/3 | In Progress | - |
| 2. Desktop Local Generation | 0/3 | Not started | - |
| 3. Lesson Output Consistency | 0/3 | Not started | - |
| 4. Desktop Link Import | 0/2 | Not started | - |
| 5. Billing and Admin Alignment | 0/3 | Not started | - |
| 6. Product Polish and Fallbacks | 0/2 | Not started | - |
