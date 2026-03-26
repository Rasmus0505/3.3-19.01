# Phase 2: Desktop Local Generation - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Desktop users can use Bottle 1.0 locally with minimal setup friction and predictable readiness. This phase delivers the complete Bottle 1.0 generation path: helper auto-start, model readiness, frontend integration, unified lesson pipeline, and graceful error recovery. It does not add new generation modes or change Bottle 2.0 behavior.

</domain>

<decisions>
## Implementation Decisions

### User experience principle
- **D-01:** Users completely do not perceive ASR source (cloud vs local). No technical details are surfaced.
- **D-02:** No diagnostic panel, no helper status display, no model state indicators.
- **D-03:** No Bottle 1.0-specific banners, status text, or guidance copy visible to users.
- **D-04:** Generation stages: transcribing → generating lesson → completed/failed. Reuse existing phase文案 without desktop-specific additions.
- **D-05:** Error recovery: show unified failure state. When model is corrupted, guide users to re-download via `/api/local-asr-assets/download-models`. No banner explaining the degradation path.

### Helper strategy
- **D-06:** Helper process auto-starts on Electron app launch (boot-time start, not user-triggered).
- **D-07:** Helper startup is silent and invisible to the renderer. No IPC status events are sent during startup.
- **D-08:** Users do not see any "helper starting", "model loading", or "helper ready" indicators.

### Model strategy
- **D-09:** Pre-installed model package: `faster-distil-small.en` bundled into the desktop installer. Users can use Bottle 1.0 immediately after installation without downloading.
- **D-10:** Model file location: `desktop-client/models/faster-distil-small.en/`. Electron-builder packs this into `resources/app.asar.unpacked/models/`.
- **D-11:** Future new local ASR models: prefer download installation (B) via `/api/local-asr-assets/download-models`; bundle-in-installer (A) as fallback.
- **D-12:** When model file is corrupted: guide user to re-download via the model download/install flow. Do not show technical details about the corruption.

### Pipeline integration
- **D-13:** Local ASR results write to `lesson_task` table through the same lesson generation pipeline as Bottle 2.0.
- **D-14:** Lesson records are identical regardless of generation source. Users enter learning/practice flows identically.
- **D-15:** No new billing logic in this phase; Bottle 1.0 billing is handled in Phase 05.

### Technical ownership
- **D-16:** ASR strategy routing: `frontend/src/features/upload/asrStrategy.js` already routes Bottle 1.0 to local path. This phase completes the full loop including frontend result submission.
- **D-17:** `app/services/asr_model_registry.py` `get_asr_display_meta()` returns "Bottle 1.0" / "Bottle 2.0" display names.
- **D-18:** `desktop-client/electron/main.mjs` owns helper lifecycle, transcribeLocalMedia(), and generateLocalCourse().
- **D-19:** `desktop-client/electron/preload.cjs` exposes `desktopRuntime.transcribeLocalMedia()` and `localAsr.generateCourse()` to renderer.

### Claude's Discretion
- Exact visual treatment of the unified failure state
- Exact copy for model re-download guidance (generic "something went wrong, please try again" vs specific "model needs re-downloading")
- Helper process restart behavior on crash (auto-restart vs show failure after N attempts)
- Whether the model directory uses a fixed subdirectory name or a versioned layout for future model expansion

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product scope and roadmap
- `.planning/PROJECT.md` — Product boundary, runtime split (desktop = full experience, web = browser-safe subset), server-load constraint, billing ownership
- `.planning/REQUIREMENTS.md` — DESK-01 (desktop client exposes full capability), DESK-03 (local model/tool readiness)
- `.planning/workstreams/milestone/ROADMAP.md` — Phase 2 goal, success criteria (no model/ffmpeg/helper understanding needed), 3 plan slots
- `.planning/workstreams/milestone/phases/01-shared-cloud-generation/01-CONTEXT.md` — Locked Phase 01 decisions: Bottle 2.0 stages are transcribing → generating lesson → completed/failed; runtime capability messaging exists; desktop reuses same renderer

### Desktop client architecture
- `desktop-client/electron/main.mjs` — Helper lifecycle (startDesktopHelper, bootstrapRuntime), transcribeLocalMedia(), generateLocalCourse(), model update endpoints
- `desktop-client/electron/preload.cjs` — Exposes desktopRuntime.transcribeLocalMedia(), localAsr.generateCourse(), desktopRuntime.getRuntimeInfo()
- `desktop-client/package.json` — Electron + builder config, build resources, NODE_PATH for unpacked ASR modules
- `desktop-client/scripts/` — Dev/build/package scripts

### ASR model management
- `app/services/asr_model_registry.py` — ASR model registry, get_asr_model_status(), get_asr_display_meta() ("Bottle 1.0" / "Bottle 2.0"), get_supported_local_desktop_asr_model_keys(), bundle_dir fallback
- `app/api/routers/local_asr_assets.py` — Model download/install API: GET /download-models, GET /download-models/{key}, GET /download-models/{key}/manifest, GET /download-models/{key}/download, POST /download-models/{key}/install
- `app/services/asr_model_registry.py` — bundle_dir path: DESKTOP_PREINSTALLED_MODEL_DIR env var fallback to app.asar.unpacked/models/

### Frontend upload flow
- `frontend/src/features/upload/UploadPanel.jsx` — Existing Bottle 2.0 UX, stage messaging, task orchestration; Bottle 1.0 path integrates here
- `frontend/src/features/upload/asrStrategy.js` — ASR strategy routing (cloud vs local), getLocalModeBlockedMessage(), getAutoDegradeBannerText()
- `frontend/src/shared/api/client.js` — Web vs desktop cloud bridge via window.desktopRuntime.requestCloudApi()
- `frontend/src/shared/lib/asrModels.js` — Frontend-facing model labels and runtime descriptors

### Lesson pipeline
- `app/api/routers/lessons/router.py` — Lesson task creation API
- `app/services/lesson_command_service.py` — Task creation, artifact persistence, failure recording
- `app/services/lesson_service.py` — Generation flow and lesson pipeline

</canonical_refs>

<codebase_context>
## Existing Code Insights

### Reusable Assets
- `desktop-client/electron/main.mjs`: already has `startDesktopHelper()`, `bootstrapRuntime()`, `transcribeLocalMedia()`, `generateLocalCourse()` — helper lifecycle and ASR invocation already implemented
- `desktop-client/electron/preload.cjs`: already exposes `desktopRuntime.transcribeLocalMedia()` and `localAsr.generateCourse()` — frontend has the IPC API it needs
- `app/services/asr_model_registry.py`: `get_asr_display_meta()` already maps "faster-whisper-local" → "Bottle 1.0", "qwen-asr" → "Bottle 2.0"
- `app/api/routers/local_asr_assets.py`: model download/install API already implemented with DOWNLOADABLE_MODELS dictionary (extensible for future models)
- `frontend/src/features/upload/UploadPanel.jsx`: existing stage messaging infrastructure (transcribing → generating lesson → completed/failed) already in place
- `frontend/src/features/upload/asrStrategy.js`: existing ASR routing and failure messaging

### Established Patterns
- Desktop reuses the same renderer and swaps transport through the cloud bridge rather than maintaining a separate frontend
- Task progress stages already exist: upload → submit → transcribing → generating lesson → completed/failed
- The product already has offline / cloud-unavailable / desktop-only user messaging patterns
- Model status and helper state are already tracked in the backend (`get_asr_model_status()`)

### Integration Points
- Frontend Bottle 1.0 path connects through: UploadPanel → asrStrategy → desktopRuntime.transcribeLocalMedia() → main.mjs helper → ASR result → localAsr.generateCourse() → backend lesson pipeline
- Model download connects through: backend `local_asr_assets.py` → frontend model management UI → desktop helper writes model to user data directory
- Lesson results flow through the same lesson_task table regardless of ASR source
- Billing (Phase 05) will hook into both Bottle 1.0 and Bottle 2.0 entry points

</codebase_context>

<specifics>
## Specific Ideas

- Model file: `faster-distil-small.en` (from `asr-test/models/faster-distil-small.en` during development; packaged into `desktop-client/models/` for distribution)
- The product should feel like one unified lesson generation experience regardless of whether ASR runs locally or in the cloud
- Users should never need to understand what "helper", "model", "ffmpeg", or "ASR" means
- When something goes wrong, the user sees a generic failure with a re-download option for model corruption — no technical explanation

</specifics>

<deferred>
## Deferred Ideas

- Desktop link import / URL-to-video generation is Phase 04 and should not expand Phase 02 scope
- Billing model and point deduction rules for Bottle 1.0 vs Bottle 2.0 belong in Phase 05
- Model version management and incremental updates belong in Phase 02's implementation, but the download-first strategy for future models is noted
- Exact permanent file-size limits and duration guidance for Bottle 1.0 should be measured from real usage rather than guessed now

</deferred>

---

*Phase: 02-desktop-local-generation*
*Context gathered: 2026-03-27*
