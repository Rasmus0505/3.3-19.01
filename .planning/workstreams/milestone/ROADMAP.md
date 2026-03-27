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

- [x] **Phase 2.1: Admin Bottle 1.0 Settings & Billing Cleanup** (INSERTED) — not planned yet (completed 2026-03-27)
- [ ] **Phase 3: Lesson Output Consistency** (3 plans)
- [ ] **Phase 4: Desktop Link Import** (2 plans)

### Phase 2.1: Admin Bottle 1.0 Settings & Billing Cleanup

**Goal**: Remove the standalone `/admin/models` model-configuration surface, delete all admin-side model-parameter configuration paths, and make Bottle 1.0 a normal billable model row inside an existing admin workspace with end-to-end `model_name` continuity.
**Depends on**: Phase 2
**Plans**: 3 plans

Plans:

- [ ] 02.1-01: Remove `/admin/models` and relocate billing access into an existing admin workspace
- [ ] 02.1-02: Delete model-parameter configuration UI, backend endpoints, and deprecated persistence paths
- [ ] 02.1-03: Align Bottle 1.0 billing row, runtime deduction, and verification coverage on one canonical `model_name`

### 📋 v2.0 — Billing, Admin & Polish (Planned)

- [ ] **Phase 5: Billing and Admin Alignment** (3 plans)
- [ ] **Phase 6: Product Polish and Fallbacks** (2 plans)

## Progress

|| Phase | Milestone | Plans | Status | Completed |
||-------|-----------|-------|--------|-----------|
|| 1. Shared Cloud Generation | v1.0 | 3/3 | Complete | 2026-03-26 |
|| 1.1. Fix ASR 403 | v1.0 | 2/2 | Complete | 2026-03-27 |
|| 2. Desktop Local Generation | v1.0 | 3/3 | Complete | 2026-03-27 |
|| 2.1. Admin Bottle 1.0 Settings & Billing Cleanup | v1.1 | 3/3 | Inserted | — |
|| 3. Lesson Output Consistency | v1.1 | 0/3 | Not started | — |
|| 4. Desktop Link Import | v1.1 | 0/2 | Not started | — |
|| 5. Billing and Admin Alignment | v2.0 | 0/3 | Not started | — |
|| 6. Product Polish and Fallbacks | v2.0 | 0/2 | Not started | — |

**Overall:** 3/8 phases complete (v1.0 shipped)
