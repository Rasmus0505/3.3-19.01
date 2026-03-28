---
phase: 09-wordbook-account-and-web-bottle-boundary
plan: "04"
subsystem: frontend
tags: [upload, bottle-naming, static-sync]
requires: []
provides:
  - Bottle-only naming on upload and model metadata surfaces
  - Updated static web artifact synced into `app/static`
affects: [frontend/upload, asr-model-registry, app/static]
tech-stack:
  added: []
  patterns: [bottle-name-surface-contract]
key-files:
  created: []
  modified:
    - frontend/src/features/upload/UploadPanel.jsx
    - frontend/src/features/upload/asrStrategy.js
    - frontend/src/features/upload/CloudUploadPanel.tsx
    - frontend/src/shared/lib/asrModels.js
    - app/services/asr_model_registry.py
    - tests/contracts/test_phase09_surface_contract.py
    - app/static/index.html
key-decisions:
  - "User-facing upload surfaces now describe capabilities with `Bottle 1.0 / Bottle 2.0` only, not the old local/cloud labels."
  - "The source-level contract test guards both wordbook review labels and the Bottle naming cleanup."
requirements-completed: [ACC-04]
duration: 18 min
completed: 2026-03-28
---

# Phase 09 Plan 04 Summary

Phase 7’s desktop-only Bottle boundary is now enforced with stricter naming cleanup: the upload surface, fallback metadata, and synced static bundle all use Bottle naming only.

## Accomplishments

- Replaced the old `本机识别 / 云端识别` strings in upload cards, related helper copy, and fallback model metadata.
- Updated backend ASR model descriptors so Bottle naming stays aligned even when the frontend uses fallback metadata.
- Added a phase-09 surface contract test covering both wordbook review labels and the Bottle naming cleanup.
- Rebuilt and synced `app/static` so the deployed web artifact matches the source changes.

## Task Commits

1. `e0fc97ab` — `feat(phase-09): align bottle naming surfaces`

## Verification

- `tests/contracts/test_phase09_surface_contract.py`
- `npm --prefix frontend run build:app-static`

