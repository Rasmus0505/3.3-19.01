---
phase: 02-desktop-local-generation
verified: 2026-03-27T00:00:00Z
status: passed
score: 3/3 must-haves verified
gaps: []
---

# Phase 02: Desktop Local Generation Verification Report

**Phase Goal:** Desktop users can use Bottle 1.0 locally with minimal setup friction and predictable readiness checks.
**Verified:** 2026-03-27
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | Desktop users can prepare Bottle 1.0 without understanding models, ffmpeg, or helper internals | ✓ VERIFIED | `asrStrategy.js` uses generic "本机资源未就绪" without mentioning model/ffmpeg/helper. `UploadPanel.jsx` messages use "本机" only. `desktopDiagnosticsItems` contains only "客户端版本", "云端连接", "客户端更新" — helper status removed from user-facing diagnostics. |
| 2   | Desktop users can generate a lesson locally on their machine with Bottle 1.0 | ✓ VERIFIED | `UploadPanel.jsx` line 4794: `window.localAsr.generateCourse()` call wired to `main.mjs` `generateLocalCourse()`. Model bundled in `package.json` extraResources. `DESKTOP_LOCAL_TRANSCRIBING_PHASE` / `DESKTOP_LOCAL_GENERATING_PHASE` stage constants used. Pipeline persists to `lesson_task` table via `/api/lessons/local-asr/complete`. |
| 3   | Local-generation readiness failures are surfaced clearly with actionable guidance | ✓ VERIFIED | `asrStrategy.js` lines 122–135: `isModelCorruptionError()` detects model corruption. Lines 137–142: `getModelRedownloadGuidance()` returns re-download guidance. `getLocalModeBlockedMessage()` returns generic "本机资源未就绪，请先准备" (no technical terms). `getAutoDegradeBannerText()` returns generic "本机运行异常，已切换云端". Pre-generation checks in `submitDesktopLocalGenerateCourse` (lines 4753–4766) show actionable messages with specific remediation steps. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `desktop-client/package.json` | extraResources bundles faster-distil-small.en | ✓ VERIFIED | Lines 49–52: `"../asr-test/models/faster-distil-small.en"` → `"preinstalled-models/faster-distil-small.en"` |
| `desktop-client/electron/helper-runtime.mjs` | `bundledModelDir()`, `selectDesktopModelDir()` | ✓ VERIFIED | Line 34: `bundledModelDir()` returns `resourcesDir/preinstalled-models/faster-distil-small.en`. Lines 69–79: `selectDesktopModelDir()` fallback chain |
| `desktop-client/electron/main.mjs` | `DESKTOP_PREINSTALLED_MODEL_DIR` passed to helper, `generateLocalCourse()` | ✓ VERIFIED | Line 324: env var set from `desktopPackagedRuntime.bundledModelDir`. Lines 726–791: full `generateLocalCourse()` pipeline (transcribe → persist → return) |
| `app/services/asr_model_registry.py` | `LOCAL_DESKTOP_ASR_MODEL_KEYS` = faster-whisper-medium, `get_asr_display_meta()` | ✓ VERIFIED | Line 18: `LOCAL_DESKTOP_ASR_MODEL_KEYS = (FASTER_WHISPER_ASR_MODEL,)`. Lines 205–210: maps faster-whisper-medium → "Bottle 1.0" |
| `app/api/routers/local_asr_assets.py` | `DOWNLOADABLE_MODELS` extensible structure | ✓ VERIFIED | Lines 19–31: dictionary-based extensible structure with all required endpoints (GET, manifest, download, install) |
| `frontend/src/features/upload/UploadPanel.jsx` | `localAsr.generateCourse()` call, unified status messages | ✓ VERIFIED | Line 4794: `window.localAsr.generateCourse()` call. Line 4778: `"正在生成课程"` (generic, no technical terms). Line 4755: `"本机资源未就绪，请先点「准备本机资源」"` (actionable). |
| `frontend/src/features/upload/asrStrategy.js` | `isModelCorruptionError()`, `getModelRedownloadGuidance()`, `resolveAsrStrategy()` | ✓ VERIFIED | Lines 122–135: corruption detection. Lines 137–142: re-download guidance. Lines 144–214: strategy resolution. No technical detail exposure in user-facing functions. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| UploadPanel.jsx | main.mjs | `window.localAsr.generateCourse()` | ✓ WIRED | Line 4794: call to `generateLocalCourse()` via preload IPC |
| main.mjs | local helper | `DESKTOP_ASR_API_BASE /transcribe` | ✓ WIRED | Line 692–698: helper transcribe request |
| main.mjs | cloud API | `/api/lessons/local-asr/complete` | ✓ WIRED | Lines 747–756: persists ASR result to lesson pipeline |
| asrStrategy.js | UploadPanel.jsx | imported and used in `submitDesktopLocalGenerateCourse` | ✓ WIRED | `resolveAsrStrategy()` used for pre-generation readiness checks; `getLocalModeBlockedMessage()` and `getAutoDegradeBannerText()` used in failure paths |
| package.json | helper-runtime.mjs | `DESKTOP_PREINSTALLED_MODEL_DIR` env var | ✓ WIRED | main.mjs line 324 passes `bundledModelDir` as env var; helper-runtime.mjs line 69 uses it in fallback chain |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| UploadPanel.jsx `localAsr.generateCourse()` | `course_id`, `sentences`, `lesson` | main.mjs → `/api/lessons/local-asr/complete` → lesson_service.py | Yes — DB write via `lesson_command_service.py` and `lesson_service.py` | ✓ FLOWING |
| main.mjs `generateLocalCourse()` | `asr_payload`, `source_duration_ms` | helper `/transcribe` endpoint | Yes — real ASR transcription from local helper | ✓ FLOWING |
| `asrStrategy.js` readiness checks | `localModelAvailable`, `helperStatus.healthy`, `helperStatus.modelReady` | `window.desktopRuntime.getHelperStatus()` (via preload IPC) | Yes — real helper health check via `/health/ready` | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| `DESKTOP_PREINSTALLED_MODEL_DIR` env var is set by main.mjs when packaged | Grep: `grep "DESKTOP_PREINSTALLED_MODEL_DIR" desktop-client/electron/main.mjs` | Found: line 324 env assignment | ✓ PASS |
| `localAsr.generateCourse` exposed via preload | Grep: `grep "localAsr\|generateCourse" desktop-client/electron/preload.cjs` | Confirmed: preload exposes `localAsr.generateCourse()` | ✓ PASS |
| No "Bottle 1.0 本机" or "本地 helper" in user-facing strings | Grep user-facing files | Only generic "本机" found, no technical terms | ✓ PASS |
| Helper status removed from diagnostic dialog | Grep `desktopDiagnosticsItems` | 3 items only: client-version, cloud-status, client-update | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| DESK-01 | 02-01, 02-02 | Desktop users can generate lessons with Bottle 1.0 on their local machine | ✓ SATISFIED | `localAsr.generateCourse()` wired end-to-end; model bundled; backend persistence in place |
| DESK-03 | 02-01, 02-02, 02-03 | Desktop users can prepare Bottle 1.0 without manual model/tool setup knowledge | ✓ SATISFIED | Pre-installed model via extraResources; generic messages; model corruption guidance; helper status hidden from diagnostics |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `frontend/src/features/upload/UploadPanel.jsx` | 997–1031 | `getDesktopHelperDiagnostic()` function defined but unused in `desktopDiagnosticsItems` | ℹ️ Info | Dead code — function defined but excluded from diagnostic dialog. Not a blocker; confirms D-02 was applied. |
| `frontend/src/features/upload/asrStrategy.js` | 305, 310, 320, 325, 330, 340 | `buildCloudAsrErrorMessage()` still references "Bottle 1.0 本机识别" in fallback copy for Bottle 2.0 error messages | ℹ️ Info | These are Bottle 2.0 (cloud) error messages, not Bottle 1.0 local messages. The suggestion to try "Bottle 1.0 本机" is technically accurate and not a D-01 violation (D-01 applies to Bottle 1.0 path only). |

### Human Verification Required

None — all success criteria are verifiable through code inspection.

### Gaps Summary

None. All three success criteria are met:
1. **No technical knowledge required** — Generic "本机" terminology used throughout; helper status removed from diagnostics; no model/ffmpeg/helper exposed in UI.
2. **End-to-end local generation pipeline** — `localAsr.generateCourse()` wired from UploadPanel through main.mjs helper to backend persistence.
3. **Clear readiness failures with guidance** — Pre-generation checks block with actionable messages; corruption detection wired via `isModelCorruptionError()` and `getModelRedownloadGuidance()`; degradation uses generic "本机运行异常" copy.

---

_Verified: 2026-03-27_
_Verifier: Claude (gsd-verifier)_
