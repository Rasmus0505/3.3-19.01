# Phase 1: Shared Cloud Generation - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a stable Bottle 2.0 cloud-generation path that works for both web and desktop users, while keeping the central server from becoming the default heavy media-processing worker. This phase is about the shared cloud generation route only; Bottle 1.0 local generation and desktop link import are separate later phases.

</domain>

<decisions>
## Implementation Decisions

### Web media preparation path
- **D-01:** Bottle 2.0 should preferentially use the cloud file path rather than routing media through your server for audio conversion/transcoding.
- **D-02:** If some web-side Bottle 2.0 media fails under the direct cloud-file path, the product should recommend the desktop client instead of falling back to server-side media conversion.

### Runtime capability messaging
- **D-03:** When a feature is desktop-only, the product should show a clear explanatory popup rather than silently failing or hiding the reason.
- **D-04:** The desktop-only popup should include a bottom-right download button.
- **D-05:** If a direct installer URL is not ready yet, the popup/download path may temporarily point users to a group number or manual distribution instructions.

### Shared cloud task experience
- **D-06:** Bottle 2.0 should show as similar a task-state flow as possible across web and desktop.
- **D-07:** The expected shared user-facing stages are: upload -> submit cloud task -> transcribing -> generating lesson -> completed/failed.
- **D-08:** Retry, failure messaging, and task recovery should feel unified even if the implementation differs between web and desktop runtimes.

### Supported inputs for this phase
- **D-09:** Phase 1 Bottle 2.0 should support local file uploads.
- **D-10:** Supported local file classes should include both audio and video.
- **D-11:** Link import should not be merged into Bottle 2.0 Phase 1 planning; it remains a later dedicated desktop-import phase even though the product may mention it in the future.

### Large-file handling
- **D-12:** Do not hardcode an aggressive product-level file-size cap until the actual cloud path has been validated.
- **D-13:** The product should surface user-visible size/duration guidance and, when current limits are exceeded or reliability is doubtful, recommend the desktop client instead of server fallback.

### the agent's Discretion
- Exact visual treatment of the desktop-only popup and CTA hierarchy
- Exact wording of cloud-task status labels as long as the stage model stays aligned
- Exact thresholds for warning banners vs hard-block behavior once real upload/model limits are measured

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product scope and roadmap
- `.planning/PROJECT.md` — Product boundary, runtime split, billing/key ownership, server-load constraints
- `.planning/REQUIREMENTS.md` — Phase 1 requirement contract (`AUTH-01`, `AUTH-02`, `AUTH-03`, `BILL-01`, `WEB-01`, `WEB-02`, `WEB-03`, `DESK-02`)
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, and plan boundary

### Existing Bottle 2.0 upload/task flow
- `app/api/routers/dashscope_upload.py` — Current pre-signed upload policy endpoint for Bottle 2.0 direct upload
- `app/api/routers/lessons/router.py` — `dashscope_file_id` task creation flow and lesson task API contract
- `app/services/lesson_command_service.py` — Task creation from `dashscope_file_id` and queued generation orchestration
- `app/services/lesson_service.py` — Generation flow from saved DashScope file IDs

### Shared frontend and desktop cloud bridge
- `frontend/src/features/upload/UploadPanel.jsx` — Existing Bottle 2.0 UX, status messaging, direct upload flow, capability gating, desktop-only link-import messaging
- `frontend/src/features/upload/asrStrategy.js` — Cloud/local routing logic and user-facing failure messaging for Bottle 2.0 vs Bottle 1.0
- `frontend/src/shared/api/client.js` — Shared request client and desktop `requestCloudApi` bridge behavior
- `desktop-client/electron/preload.cjs` — Exposes desktop cloud request bridge to renderer
- `desktop-client/electron/main.mjs` — Handles desktop cloud-request proxying and runtime info

### Capability and model metadata
- `app/services/asr_model_registry.py` — Model metadata and Bottle 2.0 capability registration
- `frontend/src/shared/lib/asrModels.js` — Frontend-facing model labels and runtime descriptors

### No external specs
- No additional external project spec/ADR files were referenced during this discussion; requirements are captured in the decisions above and the existing code references listed here.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/features/upload/UploadPanel.jsx`: already contains Bottle 2.0 direct-upload UX, offline banners, capability messages, and cloud-task orchestration hooks.
- `frontend/src/shared/api/client.js`: already abstracts web fetch vs desktop cloud bridge via `window.desktopRuntime.requestCloudApi(...)`.
- `app/api/routers/dashscope_upload.py`: already provides the upload-policy endpoint needed for the direct cloud path.
- `app/api/routers/lessons/router.py`: already accepts `dashscope_file_id` for cloud task creation.
- `app/services/lesson_command_service.py`: already persists/queues cloud-generation tasks around the `dashscope_file_id` artifact.

### Established Patterns
- Cloud and local generation are already presented as runtime strategies in the upload flow rather than separate products.
- Desktop reuses the same renderer and swaps transport through the cloud bridge rather than maintaining a separate frontend.
- The product already has explicit offline / cloud-unavailable / desktop-only user messaging patterns.
- Task progress, pause/resume, and debug-report flows already exist in the lesson-task model and should be reused rather than reinvented.

### Integration Points
- Phase 1 changes will primarily connect through `frontend/src/features/upload/UploadPanel.jsx`, shared API client behavior, `app/api/routers/dashscope_upload.py`, and lesson-task creation/generation services.
- Any desktop-specific cloud behavior should still enter through the shared renderer and `desktopRuntime.requestCloudApi`, not a separate parallel UI path.
- Billing and auth edge handling in generation entry points should align with existing wallet/auth contracts rather than adding new ad hoc gates.

</code_context>

<specifics>
## Specific Ideas

- The product should strongly prefer a direct cloud-file path for Bottle 2.0 and avoid quietly moving web failures into server-side media conversion.
- When users hit desktop-only boundaries, the product should explain why and give them a visible path to the desktop client.
- A temporary distribution fallback is acceptable: if a polished installer host is not ready yet, the download CTA can point users toward a group number or manual distribution instructions.
- Even if desktop and web differ under the hood, learners should perceive Bottle 2.0 as the same cloud-generation product flow.

</specifics>

<deferred>
## Deferred Ideas

- Desktop link import / URL-to-video generation remains a later dedicated phase and should not expand Phase 1 scope.
- Final installer hosting/distribution infrastructure can evolve later; Phase 1 only needs the product-facing fallback behavior.
- Exact permanent file-size limits should be decided after validating the real cloud path rather than guessed now.

</deferred>

---

*Phase: 01-shared-cloud-generation*
*Context gathered: 2026-03-26*
