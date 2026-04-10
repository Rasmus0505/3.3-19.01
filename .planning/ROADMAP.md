# Roadmap: Bottle English Learning

**Milestone:** v2.8 阅读生成流水线
**Granularity:** Standard (3 phases)

## Milestones

- ✅ **v2.7 阅读板块重写增强** — Phases 32-34 (shipped 2026-04-06)
  - 13/14 requirements complete; PO-04 pending human verification
  - [Archived](.planning/milestones/v2.7-ROADMAP.md)
- 🚧 **v2.8 阅读生成流水线** — Phases 35-37 (planned)

---

## Phases

### 🚧 v2.8 阅读生成流水线

- [x] **Phase 35: Material Intake & Diagnostic Card** — 把阅读输入升级为比赛可展示的材料诊断台 (completed 2026-04-10)
- [x] **Phase 36: Pipeline Orchestrator & Reading Pack** — 把一次性重写升级为显式阶段生成与阅读包产物 (completed 2026-04-10)
- [ ] **Phase 37: Learning Handoff & Pack Library** — 把阅读包变成可回看、可收词、可继续学习的资产

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|---------------|--------|-----------|
| 32 | v2.7 | 0/? | Complete | 2026-04-06 |
| 33 | v2.7 | 2/2 | Complete | 2026-04-06 |
| 34 | v2.7 | 1/1 | Complete | 2026-04-06 |
| 35 | v2.8 | 1/1 | Complete    | 2026-04-10 |
| 36 | v2.8 | 3/3 | Complete    | 2026-04-10 |
| 37 | v2.8 | 0/? | Not started | - |

---

## Phase Details

### Phase 35: Material Intake & Diagnostic Card

**Goal:** 用户在生成前先看到材料诊断，而不是直接进入黑盒重写。

**Depends on:** None

**Requirements:** DIAG-01, DIAG-02, DIAG-03, DIAG-04

**Success Criteria:**

1. User can paste or reopen a reading material and land on a diagnostic card before any rewrite begins.
2. Diagnostic card shows current user CEFR level, estimated material difficulty, recommended target i+1 level, and counts of preserved i+1 words vs above-i+1 expressions.
3. Diagnostic card exposes estimated generation cost/time and a clear confirm action, replacing the previous blind auto-rewrite behavior for the reading-pack flow.
4. Diagnostic summary is persisted with the draft material session so the user can leave and return without losing the diagnosis.

**Plans:** 1/1 plans complete

---

### Phase 36: Pipeline Orchestrator & Reading Pack

**Goal:** 把阅读生成过程做成显式阶段流，并产出可回看的阅读包。

**Depends on:** Phase 35

**Requirements:** PIPE-01, PIPE-02, PIPE-03, PACK-01, PACK-02

**Success Criteria:**

1. User sees a staged generation experience with named steps for parsing, difficulty judgment, simplification planning, text rewriting, and reading-pack assembly.
2. Generation view includes stage-specific copy, progress transitions, and error states that explain what failed and whether original-mode fallback is available.
3. Successful generation writes a persistent reading pack containing original text, i+1 rewritten text, target metadata, mappings, and diagnostic summary.
4. Reading pack supports original view, i+1 view, and sentence-by-sentence comparison view without losing existing highlight and mapping accuracy.
5. Refresh or navigation interruption can recover the latest saved generation state or reopen the finished reading pack instead of forcing a full restart.

**Plans:** 3/3 plans complete

---

### Phase 37: Learning Handoff & Pack Library

**Goal:** 把阅读包从一次性结果变成可学习、可回看、可复用的资产。

**Depends on:** Phase 36

**Requirements:** PACK-03, PACK-04, HAND-01, HAND-02

**Success Criteria:**

1. History surface shows reading-pack cards with difficulty badges, target-level metadata, and generation status so users can reopen packs as assets.
2. Reading pack includes a structured explanation panel that separates preserved i+1 words from simplified expressions instead of relying only on inline marks.
3. User can add preserved i+1 words and simplified expressions to wordbook directly from the pack without leaving the reading workflow.
4. Reading pack shows an explicit next-step action after generation, such as continue reading, compare with original, or collect words for review.
5. Existing reading history and wordbook flows remain compatible; the new pack library layers on top instead of replacing them.

**Plans:** TBD

---

## Coverage

**v2.8 Requirements: 13 total**
**Mapped to phases: 13 / 13 ✓**
**Unmapped: 0**

---

## Milestone Context

**Previous milestone:** v2.7 阅读板块重写增强 — shipped 2026-04-06

**Milestone story:** v2.8 shifts the reading module from "AI rewrite result" to a competition-ready "material -> i+1 reading pack" generation pipeline. The OpenMAIC reference is used for stage visibility, progress storytelling, and assetized outputs, while the core pedagogy remains Bottle's CEFR-driven i+1 transformation.

**Next milestone:** TBD after v2.8 validation

---
*Roadmap drafted: 2026-04-10*
*Last updated: 2026-04-10 after v2.8 milestone draft*
