# Phase 3: Lesson Output Consistency - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 03-lesson-output-consistency
**Mode:** auto
**Areas discussed:** Canonical lesson artifact, History and learning entry, Generation-state visibility, Practice and sentence continuity

---

## Canonical lesson artifact

| Option | Description | Selected |
|--------|-------------|----------|
| One canonical lesson record | Persist Bottle 1.0 and Bottle 2.0 into the same lesson, sentence, progress, and task contracts | ✓ |
| Runtime-specific lesson types | Keep separate local/cloud lesson records and map them later | |
| Frontend-only normalization | Leave backend outputs divergent and normalize only in UI state | |

**User's choice:** One canonical lesson record
**Notes:** [auto] Selected recommended default because the current backend already centers on shared `Lesson`, `LessonSentence`, `LessonProgress`, and `LessonTaskResponse` contracts.

---

## History and learning entry

| Option | Description | Selected |
|--------|-------------|----------|
| Shared history flow | Use one history/start-learning path for both generation routes | ✓ |
| Generation-specific success destinations | Send Bottle 1.0 and Bottle 2.0 users into different post-generation entry points | |
| Separate runtime history buckets | Split desktop-local and cloud lessons into different lists | |

**User's choice:** Shared history flow
**Notes:** [auto] Selected recommended default because the learning shell and catalog already open lessons by canonical lesson ID and do not need separate runtime namespaces.

---

## Generation-state visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Shared staged task contract | Keep one staged progress model with partial-success handling and shared controls | ✓ |
| Hard-fail degraded outcomes | Treat ASR-only or partial results as full failure and block lesson entry | |
| Separate cloud/local progress UI | Maintain different progress and recovery patterns per runtime | |

**User's choice:** Shared staged task contract
**Notes:** [auto] Selected recommended default because upload, task polling, pause/resume, and debug flows already exist in the shared `/api/lessons/tasks/*` contract and frontend task card.

---

## Practice and sentence continuity

| Option | Description | Selected |
|--------|-------------|----------|
| Persisted lesson data as source of truth | Practice reads `LessonSentence` and `LessonProgress` regardless of ASR source | ✓ |
| Runtime-specific practice adapters | Learning flow branches on local vs cloud lesson origin | |
| Raw ASR payload as learning source | Practice reads raw subtitle/task payloads directly instead of the persisted lesson | |

**User's choice:** Persisted lesson data as source of truth
**Notes:** [auto] Selected recommended default because sentence review, progress summaries, and subtitle recovery are already oriented around shared lesson IDs and persisted sentence rows.

---

## the agent's Discretion

- Exact copy for degraded-success, resume, and history CTA text
- Exact timing for plain subtitle variant recovery, as long as the canonical lesson ID stays authoritative
- Exact UI hierarchy of debug/report affordances on upload and history surfaces

## Deferred Ideas

- Desktop link import remains Phase 4
- Broader learning and onboarding polish remains Phase 6
