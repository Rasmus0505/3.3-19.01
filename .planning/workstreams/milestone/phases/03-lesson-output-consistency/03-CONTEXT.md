# Phase 3: Lesson Output Consistency - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Normalize Bottle 1.0 and Bottle 2.0 generation outputs into one canonical lesson artifact and shared learning flow. This phase covers the persisted lesson contract, history/detail entry, sentence review, practice continuity, and shared generation-state feedback. It does not add desktop link import, new generation modes, or broader learning-polish features outside the existing lesson pipeline.

</domain>

<decisions>
## Implementation Decisions

### Canonical lesson artifact
- **D-01:** Bottle 1.0 and Bottle 2.0 must both persist into the same canonical `lessons`, `lesson_sentences`, and `lesson_progress` model shape rather than creating source-specific lesson types.
- **D-02:** `LessonDetailResponse`, `LessonCatalogResponse`, and `LessonTaskResponse` remain the source-of-truth contracts for generated lesson output regardless of runtime.
- **D-03:** Runtime-specific raw payloads such as `subtitle_cache_seed`, task debug data, and offline subtitle variants may exist for recovery, but they support the canonical lesson record instead of replacing it.

### History and learning entry
- **D-04:** Users should reach generated lessons through the same history and "start learning" flow regardless of whether the lesson came from Bottle 1.0 local generation or Bottle 2.0 cloud generation.
- **D-05:** History cards, catalog metadata, and lesson-open behavior should expose the same core fields across sources: title, source filename, sentence count, progress summary, and current lesson binding.
- **D-06:** Desktop-local recovery data should stay keyed by the shared lesson ID so local-only artifacts do not create a separate desktop lesson namespace.

### Generation-state visibility
- **D-07:** Shared staged task feedback stays in place for all generation routes: one task contract with stage cards, counters, overall percent, pause/resume/terminate, and debug-report support.
- **D-08:** Partial-success cases such as ASR-only output should remain learnable outcomes: show explicit degraded-success messaging, keep the lesson in history, and allow users to continue into review/practice instead of treating the result as a total failure.
- **D-09:** Failure, pause, resume, and recovery affordances should stay attached to `/api/lessons/tasks/*` and the shared upload-task surface rather than splitting into cloud-only vs desktop-only UI behavior.

### Practice and sentence continuity
- **D-10:** Learning and spelling flows should consume persisted `LessonSentence` and `LessonProgress` data only; once generation finishes, practice must not branch on ASR source.
- **D-11:** Sentence review needs to preserve English text, Chinese text, timing, and progress continuity from the persisted lesson so users can resume later on the same lesson record.
- **D-12:** Phase 3 should prioritize canonical lesson/practice continuity before adding richer source-specific enhancements or Phase 4 link-import behavior.

### the agent's Discretion
- Exact user-facing copy for partial-success, resume, and history-entry messaging
- Whether plain subtitle variants are recovered eagerly or lazily, as long as the canonical lesson ID remains the only learner-facing lesson identity
- The exact visual hierarchy of progress/debug affordances on upload and history surfaces

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product scope and milestone framing
- `.planning/PROJECT.md` — Product boundary, runtime split, and the Phase 3 promise that generated media becomes usable lesson and practice artifacts regardless of route
- `.planning/workstreams/milestone/REQUIREMENTS.md` — Phase 3 requirements: `LESS-01`, `LESS-02`, `LESS-03`, `LEARN-01`, `LEARN-02`
- `.planning/workstreams/milestone/ROADMAP.md` — Phase 3 goal, dependency order, and 3-plan structure inside the current milestone
- `.planning/workstreams/milestone/STATE.md` — Current milestone continuity and active handoff from completed Phase 2.1

### Prior phase decisions that constrain Phase 3
- `.planning/workstreams/milestone/phases/01-shared-cloud-generation/01-CONTEXT.md` — Shared cloud-generation stage model and unified task experience
- `.planning/workstreams/milestone/phases/02-desktop-local-generation/02-CONTEXT.md` — Locked decision that Bottle 1.0 already writes through the same lesson pipeline and should feel identical after generation
- `.planning/workstreams/milestone/phases/02.1-admin-bottle-1-0-settings-and-billing-cleanup/02.1-CONTEXT.md` — Explicitly defers lesson normalization and learning continuity to Phase 3

### Backend lesson and task contracts
- `app/models/lesson.py` — Canonical persistence for lessons, lesson sentences, progress, generation tasks, and media assets
- `app/schemas/lesson.py` — API contract for lesson detail, catalog, task status, subtitle cache seed, and partial-success reporting
- `app/api/routers/lessons/router.py` — Task creation, task polling, lesson detail/catalog, subtitle variant regeneration, and local-generation completion responses
- `app/services/lesson_query_service.py` — Shared catalog/detail payload builders
- `app/repositories/lessons.py` — Catalog sentence-count and progress-summary queries used by history surfaces

### Frontend learning and generation surfaces
- `frontend/src/features/upload/UploadPanel.jsx` — Shared upload/generation state machine, success/error handling, desktop-local and cloud-generation entry points
- `frontend/src/app/learning-shell/LearningShellContainer.jsx` — Shared history, lesson-open, immersive learning entry, and original subtitle recovery flow
- `frontend/src/shared/media/localSubtitleStore.js` — Local subtitle-cache strategy keyed by canonical lesson IDs for offline/desktop recovery
- `frontend/src/store/slices/lessonSlice.ts` — Lesson state hydration and sentence-count/progress normalization for the learning shell

### Supporting research note
- `.planning/research/SUMMARY.md` — Phase 3 rationale: users care about study results, not which ASR route produced them

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/models/lesson.py`: already provides one persisted lesson model with shared sentence and progress tables plus task artifacts that can hold both full-success and partial-success generation output
- `app/api/routers/lessons/router.py`: already exposes both cloud and local generation through one router namespace, plus shared task polling, lesson detail, catalog, and subtitle-variant regeneration contracts
- `app/schemas/lesson.py`: already includes `completion_kind`, `result_kind`, `partial_failure_*`, `subtitle_cache_seed`, and shared catalog/detail payloads needed for a unified lesson output surface
- `app/repositories/lessons.py`: already computes sentence counts and progress summaries for the history catalog independent of source runtime
- `frontend/src/features/upload/UploadPanel.jsx`: already renders one multi-stage task UI that handles success, partial success, pause/resume, and failure for both cloud and desktop-local paths
- `frontend/src/app/learning-shell/LearningShellContainer.jsx`: already routes users into one history and learning shell, then recovers original subtitle variants through the shared lesson ID
- `frontend/src/shared/media/localSubtitleStore.js`: already stores plain subtitle variants and offline metadata against canonical lesson IDs instead of creating separate offline lesson records

### Established Patterns
- The product already prefers one renderer and one lesson/task contract across runtimes instead of separate web vs desktop products
- Generation state is already represented as staged progress plus counters, not as opaque spinner-only flows
- Partial generation results are already modeled explicitly (`full_success` vs `asr_only`) in backend task schemas and frontend success/error handling
- History and immersive learning already depend on persisted lesson IDs, sentence counts, and progress summaries rather than on runtime-specific task state

### Integration Points
- Backend alignment work connects through `LessonService`/task creation to `LessonTaskResponse`, then into history and lesson detail payloads
- Frontend continuity work connects through `UploadPanel.jsx` task handling, `lessonSlice.ts` normalization, and `LearningShellContainer.jsx` history/start-learning flows
- Offline subtitle and desktop recovery should continue to flow through `localSubtitleStore.js` and `subtitle_cache_seed`, never through a second learner-visible lesson model

</code_context>

<specifics>
## Specific Ideas

- The learner-facing product shape should be "generate -> history -> learn" no matter whether ASR was local or cloud.
- Users should not need to understand ASR route differences once a lesson exists; they should see one lesson, one history entry, and one learning flow.
- Degraded outcomes are acceptable if they still produce a usable lesson artifact; Phase 3 should make those outcomes explicit and resumable instead of hiding them.

</specifics>

<deferred>
## Deferred Ideas

- Desktop link import remains Phase 4 and should not expand Phase 3 scope
- Broader onboarding, fallback, and learning polish remains Phase 6
- Additional runtime-specific enhancements beyond canonical lesson continuity belong in later phases once the shared lesson contract is stable

</deferred>

---

*Phase: 03-lesson-output-consistency*
*Context gathered: 2026-03-27*
