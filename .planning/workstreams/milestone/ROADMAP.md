# Roadmap: Bottle English Learning

## Milestones

- ✅ **v1.0 基础能力稳定化** — Phases 1, 1.1, 2 (shipped 2026-03-27)
- 🚧 **v1.1** — Phases 2.1, 3, 4 (planned)
- 📋 **v2.0** — Phases 5, 6 (planned)

## Phases

<details>
<summary>✅ v1.0 基础能力稳定化 (Phases 1, 1.1, 2) — SHIPPED 2026-03-27</summary>

- [x] Phase 1: Shared Cloud Generation (3/3 plans) — completed 2026-03-26
- [x] Phase 1.1: Fix ASR 403 File Access Failures (2/2 plans) — completed 2026-03-27
- [x] Phase 2: Desktop Local Generation (3/3 plans) — completed 2026-03-27

_See: `.planning/milestones/v1.0-ROADMAP.md` for full phase details_

</details>

### 🚧 v1.1 — Urgent Admin Cleanup, Lesson Output & Desktop Link Import (In Progress)

- [x] **Phase 2.1: Admin Bottle 1.0 Settings & Billing Cleanup** (INSERTED) — completed 2026-03-27
- [x] **Phase 3: Lesson Output Consistency** (3 plans) — completed 2026-03-27
- [ ] **Phase 4: Desktop Link Import** (2 plans)

### Phase 2.1: Admin Bottle 1.0 Settings & Billing Cleanup

**Goal**: Remove the standalone `/admin/models` model-configuration surface, delete all admin-side model-parameter configuration paths, and make Bottle 1.0 a normal billable model row inside an existing admin workspace with end-to-end `model_name` continuity.
**Depends on**: Phase 2
**Plans**: 3 plans

Plans:

- [ ] 02.1-01: Remove `/admin/models` and relocate billing access into an existing admin workspace
- [ ] 02.1-02: Delete model-parameter configuration UI, backend endpoints, and deprecated persistence paths
- [ ] 02.1-03: Align Bottle 1.0 billing row, runtime deduction, and verification coverage on one canonical `model_name`

### Phase 3: Lesson Output Consistency

**Goal**: Normalize Bottle 1.0 and Bottle 2.0 generation outputs into one canonical lesson record and shared learning entry flow so users can open lessons, review sentence content, and continue practice regardless of generation source, while generation progress, partial failures, and success states stay consistent across runtimes.
**Depends on**: Phases 1, 2, 2.1
**Plans**: 3 plans

Plans:

- [ ] 03-01: Align task and persistence contracts so Bottle 1.0 and Bottle 2.0 both land in the same lesson, sentence, and subtitle-cache artifacts
- [ ] 03-02: Unify history and lesson-opening flows so generated lessons expose consistent sentence review and resume behavior across sources
- [ ] 03-03: Align generation-state, partial-success, and practice handoff UX and verification on the shared lesson pipeline

### Phase 4: Desktop Link Import

**Goal**: Let desktop users import supported media links through local tooling and feed the resulting media into the same generation pipeline without moving heavy download or conversion work onto the server.
**Depends on**: Phase 3
**Plans**: 2 plans

Plans:

- [x] 04-01: Add desktop link selection, yt-dlp ingestion, and local media-preparation safeguards
- [ ] 04-02: Feed imported desktop media into the shared generation and history pipeline with verification and error recovery

### 📋 v2.0 — Billing, Admin & Polish (Planned)

- [ ] **Phase 5: Billing and Admin Alignment** (3 plans)
- [ ] **Phase 6: Product Polish and Fallbacks** (2 plans)

## Progress

|| Phase | Milestone | Plans | Status | Completed |
||-------|-----------|-------|--------|-----------|
|| 1. Shared Cloud Generation | v1.0 | 3/3 | Complete | 2026-03-26 |
|| 1.1. Fix ASR 403 | v1.0 | 2/2 | Complete | 2026-03-27 |
|| 2. Desktop Local Generation | v1.0 | 3/3 | Complete | 2026-03-27 |
|| 2.1. Admin Bottle 1.0 Settings & Billing Cleanup | v1.1 | 3/3 | Complete | 2026-03-27 |
|| 3. Lesson Output Consistency | v1.1 | 3/3 | Complete | 2026-03-27 |
|| 4. Desktop Link Import | v1.1 | 1/2 | In Progress | — |
|| 5. Billing and Admin Alignment | v2.0 | 0/3 | Not started | — |
|| 6. Product Polish and Fallbacks | v2.0 | 0/2 | Not started | — |

**Overall:** 5/8 phases complete (v1.0 shipped, v1.1 Phase 2.1 and Phase 3 complete)
