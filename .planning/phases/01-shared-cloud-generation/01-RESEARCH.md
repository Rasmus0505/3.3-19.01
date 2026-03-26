# Phase 1: Shared Cloud Generation - Research

**Researched:** 2026-03-26
**Status:** Ready for planning

## Objective

Research how to implement a stable Bottle 2.0 cloud-generation path for both web and desktop without turning the main Bottle server into the default heavy media-processing worker.

## Key Findings

### 1. Official DashScope constraints favor cloud-file processing over server-side transcoding

From official Aliyun / DashScope documentation:

- `qwen3-asr-flash-filetrans` is the long-file asynchronous transcription model.
- The model expects a publicly reachable file URL rather than raw local-file upload to the recognition endpoint itself.
- Official guidance recommends using OSS / cloud object storage to provide the file URL.
- Officially listed supported formats include both audio and video containers such as `mp3`, `wav`, `m4a`, `ogg`, `opus`, `mp4`, `mov`, `mkv`, `avi`, `flv`, `webm`, `wmv`.
- Official docs list a practical upper bound of **2 GB** and **12 hours** for the filetrans path.
- For non-PCM inputs, the service performs server-side resampling internally before recognition.

Implication:
- The product goal is technically aligned with DashScope's intended model usage: upload once to cloud storage, then transcribe from the cloud-side file reference.
- There is no product need to make your own server the normal audio-conversion hop for Bottle 2.0.

### 2. The current codebase already contains the preferred direct-upload architecture

Current implementation already has a near-complete direct-upload path:

- `app/api/routers/dashscope_upload.py` requests an upload policy and returns `upload_host`, `upload_dir`, `oss_fields`, and `file_id`.
- `frontend/src/features/upload/UploadPanel.jsx` already uses that policy to POST the file directly to the cloud storage path, then submits `/api/lessons/tasks` with `dashscope_file_id`.
- `app/api/routers/lessons/router.py` already accepts `dashscope_file_id` and creates a generation task.
- `app/services/lesson_command_service.py` stores the `dashscope_file_id` artifact and queues execution.
- `app/services/lesson_service.py::generate_from_dashscope_file_id(...)` obtains a signed URL and performs ASR from the cloud-hosted object instead of converting local media on the Bottle server.

Implication:
- The preferred Phase 1 path is not a net-new architecture. It is mostly a stabilization / convergence effort.

### 3. There is still a legacy server-passthrough Bottle 2.0 path in the repo

The repo also still contains a second Bottle 2.0 flow:

- `app/api/routers/lessons/cloud_transcribe.py`
- `frontend/src/features/upload/CloudUploadPanel.tsx`

That flow streams browser media to the Bottle server, writes a temp file, and forwards it to DashScope. The file is temporary rather than persistent, but it still makes the Bottle server participate in media handling.

Implication:
- This legacy path conflicts with the Phase 1 product decision of preferring cloud-file processing and keeping the central server light.
- Phase 1 should converge user-facing Bottle 2.0 behavior on the direct-upload + `dashscope_file_id` pipeline, while deciding whether the passthrough route remains internal/legacy or is fully retired.

### 4. Desktop and web already share the same renderer-side cloud transport abstraction

- `frontend/src/shared/api/client.js` already abstracts browser fetch vs desktop `window.desktopRuntime.requestCloudApi(...)`.
- `desktop-client/electron/preload.cjs` and `desktop-client/electron/main.mjs` already expose and implement the desktop cloud bridge.
- `frontend/src/features/upload/UploadPanel.jsx` already holds most of the unified Bottle 2.0 UX logic.

Implication:
- The right implementation direction is to unify state labels, recovery behavior, and capability messaging inside the shared upload flow, not create separate web and desktop cloud products.

### 5. Product messaging already has the primitives needed for desktop-only guidance

The upload flow already contains:

- offline/cloud-unavailable status handling
- Bottle 1.0 / Bottle 2.0 switching logic
- desktop-only / local-only user-facing error messages
- desktop runtime checks and helper status inspection

Implication:
- Adding a strong desktop-only popup + CTA is an incremental UX hardening task, not a product redesign.

## Recommended Approach

1. Make the direct-upload + `dashscope_file_id` pipeline the canonical Bottle 2.0 path for both web and desktop.
2. Treat the server-passthrough `cloud_transcribe` route as legacy and remove it from the primary UX path.
3. Unify task-state naming and recovery expectations in the shared upload flow.
4. Add explicit desktop-only guidance for unsupported / unreliable browser cases instead of falling back to server-side transcoding.
5. Keep file-size handling soft at first: validate actual cloud-path behavior before introducing a hard product cap lower than the provider limit.

## Known Unknowns

- Whether every real-world `video/*` input accepted by the browser upload flow behaves consistently through the direct cloud-file path needs validation with real samples.
- Whether provider-side limits should be surfaced as file size, duration, or both still needs product wording and runtime verification.
- Whether the legacy passthrough route should be deleted immediately or merely de-emphasized needs an implementation decision during planning.

## Research Flags

- Requires targeted verification with real `mp4` / `mov` / `webm` samples before setting permanent UI constraints.
- Requires review of all active frontend entry points to ensure no user-facing path still defaults to server passthrough.

## Validation Architecture

Phase 1 should validate three things continuously:

1. **Contract integrity**
   - Upload policy response shape remains stable.
   - `dashscope_file_id` task creation remains stable.

2. **Primary path convergence**
   - Shared upload UI uses the direct cloud-file path as the default Bottle 2.0 route.
   - Desktop bridge does not fork the cloud UX into a different task-state vocabulary.

3. **Boundary behavior**
   - Desktop-only recommendations appear instead of server-side fallback when unsupported browser scenarios are hit.
   - Auth and balance errors remain user-readable and consistent.

## Sources

### Official
- Aliyun Model Studio: `qwen-speech-recognition` — filetrans model scope, supported formats, size/duration limits, and public-file URL guidance
- Aliyun Model Studio: temporary upload/policy guidance for obtaining cloud upload URLs

### Codebase
- `app/api/routers/dashscope_upload.py`
- `app/api/routers/lessons/router.py`
- `app/api/routers/lessons/cloud_transcribe.py`
- `app/services/lesson_command_service.py`
- `app/services/lesson_service.py`
- `frontend/src/features/upload/UploadPanel.jsx`
- `frontend/src/features/upload/CloudUploadPanel.tsx`
- `frontend/src/shared/api/client.js`
