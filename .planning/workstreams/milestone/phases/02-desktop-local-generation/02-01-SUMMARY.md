---
phase: 02-desktop-local-generation
plan: 01
subsystem: desktop-client
tags: [electron, faster-whisper, asr, model-bundling]

# Dependency graph
requires:
  - phase: 01-shared-cloud-generation
    provides: Cloud ASR pipeline, runtime capability gating
provides:
  - Desktop installer bundles faster-distil-small.en model into resources/preinstalled-models/
  - Helper runtime resolves bundled model via DESKTOP_PREINSTALLED_MODEL_DIR
  - ASR model registry maps faster-whisper-medium to Bottle 1.0
affects: [02-desktop-local-generation, 02-02-bottle-desktop-generation, 02-03-error-handling]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - electron-builder extraResources for bundled assets
    - DESKTOP_PREINSTALLED_MODEL_DIR environment variable for packaged model resolution
    - selectDesktopModelDir() fallback chain (fallback -> packaged -> fallback)

key-files:
  created: []
  modified:
    - desktop-client/package.json
    - desktop-client/electron/helper-runtime.mjs
    - desktop-client/electron/main.mjs
    - app/services/asr_model_registry.py
    - app/api/routers/local_asr_assets.py

key-decisions:
  - "Model bundled at asr-test/models/faster-distil-small.en, packaged to resources/preinstalled-models/"
  - "DESKTOP_PREINSTALLED_MODEL_DIR set by main.mjs from desktopPackagedRuntime.bundledModelDir"

patterns-established:
  - "Packaged model path resolution: resourcesPath/preinstalled-models/<model-name>"
  - "Helper environment: DESKTOP_PREINSTALLED_MODEL_DIR passed during spawn"

requirements-completed: [DESK-01, DESK-03]

# Metrics
duration: 5min
completed: 2026-03-27
---

# Phase 02 Plan 01: Bundle faster-distil-small.en Model Summary

**Desktop installer bundles faster-distil-small.en model for zero-setup Bottle 1.0 usage**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-26T18:41:09Z
- **Completed:** 2026-03-27
- **Tasks:** 3 (verification-only)
- **Files verified:** 5

## Accomplishments

- Verified electron-builder extraResources config packs model from asr-test/models into resources/preinstalled-models/
- Verified helper-runtime.mjs selectDesktopModelDir() resolves DESKTOP_PREINSTALLED_MODEL_DIR correctly
- Verified ASR model registry and local_asr_assets.py bundle_dir configuration

## Task Commits

Each task was verified - no modifications required:

1. **Task 1: Verify extraResources config** - No changes needed
2. **Task 2: Verify selectDesktopModelDir()** - No changes needed
3. **Task 3: Verify LOCAL_DESKTOP_ASR_MODEL_KEYS** - No changes needed

## Files Verified

- `desktop-client/package.json` - extraResources correctly configured
- `desktop-client/electron/helper-runtime.mjs` - PREINSTALLED_MODELS_DIR and bundledModelDir() correct
- `desktop-client/electron/main.mjs` - DESKTOP_PREINSTALLED_MODEL_DIR passed to helper
- `app/services/asr_model_registry.py` - LOCAL_DESKTOP_ASR_MODEL_KEYS contains FASTER_WHISPER_ASR_MODEL
- `app/api/routers/local_asr_assets.py` - bundle_dir resolves DESKTOP_PREINSTALLED_MODEL_DIR

## Decisions Made

None - all configurations already in place per plan requirements.

## Deviations from Plan

None - plan executed exactly as written. All three tasks verified existing configurations are correctly implemented.

## Verification Results

### Task 1: extraResources Configuration
- `package.json` extraResources maps `../asr-test/models/faster-distil-small.en` to `preinstalled-models/faster-distil-small.en`
- Source directory exists with 5 model files (config.json, model.bin, preprocessor_config.json, tokenizer.json, vocabulary.json)
- Packaged output at `desktop-client/dist/win-unpacked/resources/preinstalled-models/faster-distil-small.en` contains identical files

### Task 2: Model Path Resolution
- `helper-runtime.mjs` defines `PREINSTALLED_MODELS_DIR = "preinstalled-models"`
- `bundledModelDir()` constructs path as `resourcesDir/preinstalled-models/faster-distil-small.en`
- `main.mjs` passes `DESKTOP_PREINSTALLED_MODEL_DIR` as `desktopPackagedRuntime.bundledModelDir` when packaged

### Task 3: ASR Model Registry
- `LOCAL_DESKTOP_ASR_MODEL_KEYS = (FASTER_WHISPER_ASR_MODEL,)` where FASTER_WHISPER_ASR_MODEL = "faster-whisper-medium"
- `local_asr_assets.py` bundle_dir resolves from `DESKTOP_PREINSTALLED_MODEL_DIR` env var with fallback to asr-test/models path

## Issues Encountered

None

## Next Phase Readiness

- Model bundling infrastructure verified and working
- Ready for Phase 02-02: Stabilize Bottle 1.0 desktop generation pipeline

---
*Phase: 02-desktop-local-generation*
*Completed: 2026-03-27*
