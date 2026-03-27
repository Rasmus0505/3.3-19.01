# Phase 03: Lesson Output Consistency - Research

**Researched:** 2026-03-27
**Domain:** FastAPI lesson/task pipeline + React learning shell/history flow
**Confidence:** HIGH

## Summary

Phase 03 is not a greenfield feature. The codebase already has most of the pieces needed for source-agnostic lesson output:

- one canonical persistence model in `app/models/lesson.py`
- one shared lesson/task router in `app/api/routers/lessons/router.py`
- one shared catalog/detail query path in `app/services/lesson_query_service.py`
- one shared history + immersive learning shell in `frontend/src/app/learning-shell/`
- one shared upload-task UI in `frontend/src/features/upload/UploadPanel.jsx`

The real risk is contract drift between the cloud path and the desktop-local path. Both paths already produce lessons, subtitle cache seeds, task snapshots, and partial-success metadata, but different entry points can still drift in field completeness, history hydration, or degraded-success UX. Phase 03 should therefore optimize for canonical contract alignment and regression coverage, not for inventing a new lesson model.

**Primary recommendation:** plan the phase in three slices:

1. Canonicalize backend lesson/task/detail contracts across cloud and local generation.
2. Normalize history/detail/start-learning flow around the persisted lesson ID and sentence/progress metadata.
3. Align generation-state, partial-success, and practice entry UX with tests that lock the shared lesson pipeline.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Bottle 1.0 and Bottle 2.0 both persist into the same canonical lesson artifact.
- **D-02:** `LessonDetailResponse`, `LessonCatalogResponse`, and `LessonTaskResponse` remain the source-of-truth learner-facing contracts.
- **D-03:** Runtime-specific recovery payloads may exist, but they support the canonical lesson record rather than replacing it.
- **D-04:** Users should enter generated lessons through the same history/start-learning flow regardless of source runtime.
- **D-05:** History metadata should stay consistent across sources: title, source filename, sentence count, progress summary, and lesson binding.
- **D-06:** Local-only recovery data stays keyed by canonical lesson ID rather than creating a separate desktop namespace.
- **D-07:** Shared staged task feedback remains the model for all generation routes.
- **D-08:** Partial-success results must remain usable learnable outcomes, not total failures.
- **D-09:** Pause/resume/recovery stays attached to `/api/lessons/tasks/*` and the shared upload-task surface.
- **D-10:** Practice must read persisted `LessonSentence` and `LessonProgress`, not branch by ASR source.
- **D-11:** Sentence review should preserve English, Chinese, timing, and progress continuity from the persisted lesson.
- **D-12:** Phase 03 prioritizes canonical lesson/practice continuity before Phase 4 link-import work.

### the agent's Discretion
- Exact copy for degraded-success and recovery messaging
- Whether plain subtitle recovery is eager or lazy
- Exact visual emphasis of debug/report affordances

### Deferred Ideas (OUT OF SCOPE)
- Desktop link import (Phase 4)
- Broader learning/onboarding polish (Phase 6)
- New runtime-specific learner features beyond canonical lesson continuity
</user_constraints>

---

## Standard Stack

### Core
| Library | Purpose | Why it matters here |
|---------|---------|---------------------|
| FastAPI | Lesson/task API routing | All cloud/local generation entry points already converge here |
| Pydantic v2 | Lesson/task response contracts | Canonical contract drift shows up here first |
| SQLAlchemy ORM | Lesson, sentence, progress, and task persistence | Phase 03 should reuse this rather than introducing source-specific models |
| React 18 | Shared learning/history/upload renderer | Web and desktop already share one learner-facing surface |
| Zustand | Lesson/current-session frontend state | History/detail/practice continuity is normalized here |
| pytest | Contract/integration/e2e verification | Existing suite already covers lesson/task flows and can be extended |

No additional packages are required for this phase.

---

## Architecture Patterns

### Pattern 1: Canonical lesson persistence already exists

`app/models/lesson.py` already provides:

- `Lesson`
- `LessonSentence`
- `LessonProgress`
- `LessonGenerationTask`

This is the strongest signal that Phase 03 should **align producers** to the canonical lesson model, not create new source-specific lesson types.

### Pattern 2: Shared task contract already models degraded outcomes

`app/schemas/lesson.py` and `_to_task_response()` in `app/api/routers/lessons/router.py` already carry:

- `completion_kind`
- `result_kind`
- `result_label`
- `result_message`
- `partial_failure_stage`
- `partial_failure_code`
- `partial_failure_message`
- `subtitle_cache_seed`

That means partial-success handling is already architecturally supported. The remaining work is to ensure local/cloud paths populate and surface it consistently.

### Pattern 3: Catalog/history already expects source-agnostic metadata

`app/repositories/lessons.py` and `app/services/lesson_query_service.py` already compute:

- `sentence_count`
- `progress_summary`
- `LessonCatalogResponse`
- `LessonDetailResponse`

`frontend/src/store/slices/lessonSlice.ts` then hydrates that data into:

- `lessonCardMetaMap`
- `currentLesson`
- subtitle cache metadata

This is the correct Phase 03 boundary: keep catalog/history driven by canonical lesson ID, sentence count, and progress summary.

### Pattern 4: Offline/local subtitle recovery already uses canonical lesson IDs

`frontend/src/shared/media/localSubtitleStore.js` stores subtitle variants keyed by `lesson_id`, not by a separate local-runtime object key. `LearningShellContainer.jsx` recovers original subtitle variants through the same canonical lesson ID. That already matches the desired Phase 03 model and should be preserved.

### Pattern 5: Practice flow already consumes persisted lesson content

`frontend/src/features/immersive/ImmersiveLessonPage.jsx` is driven by the lesson object and its sentence list. `lessonSlice.ts` normalizes sentence arrays, sentence counts, and progress snapshots. This confirms the best Phase 03 strategy is to protect persisted sentence/progress consistency instead of teaching immersive mode about runtime source.

---

## Key File Findings

### Backend
- `app/api/routers/lessons/router.py`
  - Cloud upload, local ASR task creation, local completed-generation save path, task polling, lesson detail, and subtitle variant regeneration all live in one router.
  - `create_local_generated_lesson()` already returns `completion_kind`, `result_kind`, `partial_failure_*`, `subtitle_cache_seed`, and `workspace`.
- `app/api/serializers.py`
  - `to_lesson_catalog_item_response()` and `to_lesson_detail_response()` are the canonical serializer choke points.
  - `to_lesson_detail_response()` already turns `subtitle_cache_seed` into a normalized response object.
- `app/services/lesson_command_service.py`
  - Admission, task queueing, failure/retry, and local generation all route through the same task machinery.
  - The code already distinguishes `full_success` vs `asr_only`, making Phase 03 mostly about alignment and verification.
- `app/services/lesson_task_manager.py`
  - Tracks task states, workspace summary, result metadata, and restore pointers.
  - This is where task-state continuity can drift if fields are inconsistently written.
- `app/repositories/lessons.py`
  - Catalog rows already combine lesson + sentence count + progress summary.

### Frontend
- `frontend/src/features/upload/UploadPanel.jsx`
  - Already contains one task-state machine for cloud and desktop-local generation.
  - Already has UI branches for full success, partial success, pause, resume, and failure.
- `frontend/src/store/slices/lessonSlice.ts`
  - Already merges catalog progress into lesson card metadata and hydrates `currentLesson`.
  - Already writes `subtitle_cache_seed` into local subtitle storage and merges recovered variants into the lesson object.
- `frontend/src/app/learning-shell/LearningShellContainer.jsx`
  - Already owns history/detail routing and original subtitle recovery.
  - Keeps history/start-learning source-agnostic as long as lesson contracts stay aligned.
- `frontend/src/features/lessons/LessonList.jsx`
  - Already renders one history card model with sentence count, progress label, media binding, and start-learning CTA.
- `frontend/src/features/immersive/ImmersiveLessonPage.jsx`
  - Already consumes normalized lesson sentences and progress; no runtime-specific lesson type is expected here.

---

## Anti-Patterns to Avoid

- **Do not create a separate Bottle 1.0 lesson model or response shape.**
- **Do not teach history or immersive mode to branch on local/cloud source once a lesson exists.**
- **Do not let raw ASR payloads become the learner-facing source of truth.**
- **Do not collapse `asr_only` into total failure if a usable lesson artifact exists.**
- **Do not make subtitle-cache/local recovery the primary lesson record.**

---

## Common Pitfalls

### Pitfall 1: Local and cloud lesson detail drift silently
**What goes wrong:** both paths return lessons, but one misses `subtitle_cache_seed`, result metadata, or normalized sentence content.
**Why it happens:** contract fields are assembled in multiple places (`create_local_generated_lesson()`, `_to_task_response()`, serializers).
**How to avoid:** normalize every learner-facing lesson/task response through the same serializer/result helpers and add regression assertions for field parity.

### Pitfall 2: History cards show different learning readiness by source
**What goes wrong:** one source populates `sentence_count`/`progress_summary` cleanly, while another reaches history with missing metadata or inconsistent status.
**Why it happens:** catalog metadata is derived from persistence, but producers may not be writing equivalent lesson/sentence/progress data.
**How to avoid:** verify both generation routes land on the same persisted lesson/sentence/progress contract before UI work.

### Pitfall 3: Partial success becomes a dead end
**What goes wrong:** `asr_only` exists in the backend, but UI treats it like a failure and blocks lesson entry.
**Why it happens:** success/failure surfaces drift between `UploadPanel.jsx`, task snapshots, and history/start-learning expectations.
**How to avoid:** keep degraded-success outcomes as explicit but usable lesson artifacts with clear messaging and start-learning continuity.

### Pitfall 4: Offline subtitle recovery becomes a second lesson system
**What goes wrong:** local subtitle variants or workspace snapshots start driving history/learning independently of the persisted lesson row.
**Why it happens:** recovery logic is useful and can grow into an accidental parallel lesson model.
**How to avoid:** keep all recovery keyed to canonical lesson ID and use it only to enrich the canonical lesson payload.

---

## Code Examples

### Shared catalog persistence contract

`app/repositories/lessons.py` already computes catalog metadata from canonical lesson tables:

```python
sentence_count_sq = (
    select(LessonSentence.lesson_id.label("lesson_id"), func.count(LessonSentence.id).label("sentence_count"))
    .group_by(LessonSentence.lesson_id)
    .subquery()
)
```

This is the right place to preserve source-agnostic history behavior.

### Shared task result modeling

`app/api/routers/lessons/router.py` already models degraded success:

```python
completion_kind = "partial" if result_kind == "asr_only" else "full"
```

Phase 03 should keep that distinction visible and learnable instead of hiding it.

### Shared frontend history hydration

`frontend/src/store/slices/lessonSlice.ts` already normalizes catalog progress into frontend state:

```ts
sentenceCount: Number(lesson.sentence_count || 0),
progress: buildCatalogProgressSnapshot(lesson.progress_summary),
```

This is the canonical frontend path to protect.

---

## Validation Architecture

### Existing test assets that already map to this phase

- `tests/contracts/test_lessons_contract.py`
  - Schema-level contract checks for lesson list/detail/catalog/task responses.
- `tests/integration/test_regression_api.py`
  - Already contains many lesson task, subtitle cache seed, and result-kind regressions.
- `tests/integration/test_lesson_task_recovery.py`
  - Already exercises retry/resume/task recovery behavior.
- `tests/e2e/test_e2e_key_flows.py`
  - Already covers login -> create lesson -> progress update and admin/public product flows.

### Recommended validation split

1. **Plan 03-01**
   - Add or update contract/integration tests proving cloud and local generation produce the same canonical learner-facing lesson/task fields.
2. **Plan 03-02**
   - Add integration/UI-facing tests for catalog/history/start-learning continuity and subtitle recovery keyed by canonical lesson ID.
3. **Plan 03-03**
   - Add regression/e2e coverage for staged progress, partial success, and practice handoff.

### Suggested commands

- **Quick contract run**
  - `pytest tests/contracts/test_lessons_contract.py -q`
- **Backend lesson/task regression run**
  - `pytest tests/integration/test_regression_api.py tests/integration/test_lesson_task_recovery.py -k "lesson or subtitle_cache_seed or result_kind or progress" -q`
- **End-to-end learner flow**
  - `pytest tests/e2e/test_e2e_key_flows.py -k "login_create_lesson_practice_progress" -q`

---

## Open Questions

1. **Should local generated lessons always enter history with `status="ready"` even on `asr_only` degraded success?**
   - Recommendation: yes, as long as degraded context is preserved in task/result metadata and the lesson remains usable.

2. **Should subtitle recovery happen before or after detail hydration?**
   - Recommendation: keep the current post-detail enrichment model in `lessonSlice.ts` / `LearningShellContainer.jsx` unless regression tests prove eager hydration is necessary.

3. **Should Phase 03 change export/import lesson payloads?**
   - Recommendation: only if canonical lesson parity requires it. The current phase goal is learner continuity, not export-format redesign.

---

*Research date: 2026-03-27*
*Phase: 03-lesson-output-consistency*
