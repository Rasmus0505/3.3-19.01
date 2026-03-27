# Phase 3: Lesson Output Consistency - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 03-lesson-output-consistency
**Mode:** mixed (auto + user correction)
**Areas discussed:** Canonical lesson artifact, History and learning entry, Generation-state visibility, Practice and sentence continuity

---

## Canonical lesson artifact

| Option | Description | Selected |
|--------|-------------|----------|
| One canonical lesson record | Persist Bottle 1.0 and Bottle 2.0 into the same lesson, sentence, progress, and task contracts | ✓ |
| Runtime-specific lesson types | Keep separate local/cloud lesson records and map them later | |
| Frontend-only normalization | Leave backend outputs divergent and normalize only in UI state | |

**User's choice:** One canonical lesson record with strict user-facing consistency
**Notes:** User confirmed the recommended direction and tightened it: user-facing fields and the main history / learning / progress flow must stay strictly一致; internal supplemental fields are allowed only if they do not alter the canonical learner flow.

---

## History and learning entry

| Option | Description | Selected |
|--------|-------------|----------|
| Shared history flow without source exposure | Use one history/start-learning path and do not expose local/cloud origin in the normal history UI | ✓ |
| Generation-specific success destinations | Send Bottle 1.0 and Bottle 2.0 users into different post-generation entry points | |
| Separate runtime history buckets | Split desktop-local and cloud lessons into different lists | |

**User's choice:** Shared history flow without exposing source difference
**Notes:** User rejected exposing runtime/source differences in history. History may still include recovery actions in the three-dot menu, including re-running translation for degraded lessons and manually marking a lesson as completed.

---

## Generation-state visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Shared staged task contract with degraded-success recovery | Keep one staged progress model, allow `asr_only` to stay learnable, and permit a later translation-recovery action | ✓ |
| Hard-fail degraded outcomes | Treat ASR-only or partial results as full failure and block lesson entry | |
| Separate cloud/local progress UI | Maintain different progress and recovery patterns per runtime | |

**User's choice:** Shared staged task contract with degraded-success recovery
**Notes:** User confirmed that `asr_only` should not be a total failure. If `asr_only` means "only subtitles / translation incomplete", the lesson remains learnable and history should later allow a translation-completion action from the three-dot menu.

---

## Practice and sentence continuity

| Option | Description | Selected |
|--------|-------------|----------|
| Persisted lesson data as source of truth | Practice reads `LessonSentence` and `LessonProgress` regardless of ASR source | ✓ |
| Runtime-specific practice adapters | Learning flow branches on local vs cloud lesson origin | |
| Raw ASR payload as learning source | Practice reads raw subtitle/task payloads directly instead of the persisted lesson | |

**User's choice:** Persisted lesson data as source of truth, completely ignoring generation source in practice
**Notes:** User confirmed that immersive learning and progress should completely ignore whether a lesson came from local or cloud generation once the lesson exists.

---

## Recovery timing

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy recovery | Keep the canonical lesson immediately usable; only recover subtitle/translation data when the user opens the lesson or explicitly triggers a recovery action | ✓ |
| Eager recovery | Automatically run subtitle/translation recovery before or during every history/detail load | |

**User's choice:** Lazy recovery
**Notes:** User chose lazy recovery so supplemental subtitle/translation repair does not block or reshape the main history / learning / progress flow.

---

## the agent's Discretion

- Exact copy for degraded-success, resume, history CTA, and "mark completed" action text
- Exact UI hierarchy of debug/report affordances on upload and history surfaces

## Deferred Ideas

- Desktop link import remains Phase 4
- Broader learning and onboarding polish remains Phase 6
