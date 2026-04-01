---
phase: 14
plan: 02
type: execute
wave: 1
tags:
  - desktop-client
  - electron
  - update
  - DESK-03
files_modified:
  - desktop-client/electron/main.mjs
  - desktop-client/electron/preload.cjs
  - frontend/src/features/upload/UploadPanel.jsx
dependency_graph:
  requires: []
  provides:
    - desktop:start-client-update-download (IPC handler, replaces stub)
    - desktop:restart-and-install (IPC handler)
    - desktop:acknowledge-client-update (IPC handler, extended)
  affects: []
tech_stack:
  added:
    - Electron IPC streaming fetch
    - shell.openPath for installer launch
    - app.relaunch + app.quit for restart
    - React state for download progress
    - Error classification per D-13 (network/server/disk/unknown)
key_files:
  created: []
  modified:
    - desktop-client/electron/main.mjs (+~70 lines: startClientUpdateDownload function, restart-and-install handler)
    - desktop-client/electron/preload.cjs (+2 lines: restartAndInstall bridge)
    - frontend/src/features/upload/UploadPanel.jsx (+~120 lines: download banner, install banner, error banner)
decisions: []
metrics:
  duration: "2026-04-01T14:00-14:30"
  completed_date: "2026-04-01"
---

# Phase 14 Plan 02: Desktop Program Update Download & Install Summary

Productized the in-client program update flow: download with progress tracking, download-complete state, user-controlled restart trigger, and failure recovery.

## What Was Built

**In-client download orchestration with streaming progress tracking** — Desktop client now downloads update packages directly (D-04: In-client download, not browser), showing real-time percentage progress. On success, shows "下载完成" with "重启并安装" option (D-06: Download complete → user chooses restart). On failure, shows plain-language error with retry and manual download fallback (D-07, D-13: error categories).

## Key Changes

### desktop-client/electron/main.mjs
- Extended `desktopClientUpdateState` with fields: `downloading`, `downloadProgress`, `downloadPath`, `installPending`, `lastError`, `badgeVisible`
- Added `startClientUpdateDownload()` async function: streams download with chunk-by-chunk progress, saves to `{userData}/updates/bottle-desktop-{version}.exe`
- Added `desktop:restart-and-install` IPC handler: calls `shell.openPath(downloadPath)`, then `app.relaunch()` + `app.quit()` after 2s
- Added error classification per D-13: `network_error`, `server_error`, `disk_error`, `unknown`
- Replaced stub from 14-01 with real implementation

### desktop-client/electron/preload.cjs
- Added `restartAndInstall` bridge to `desktopRuntime`

### frontend/src/features/upload/UploadPanel.jsx
- Added `desktopUpdateState` and `updateBannerDismissed` state
- Added subscription to `onClientUpdateStatusChanged` + initial `getClientUpdateStatus()`
- Added three-part update banner:
  - **Downloading**: shows animated progress bar with percentage
  - **Install pending**: shows checkmark with "重启并安装" and "稍后" buttons
  - **Ready to download**: shows "发现新版本" with "立即更新" and "稍后" buttons
- Added error banner: shows category-specific message (network/server/disk/unknown) with "重试" and "官网下载" buttons
- Added red dot badge indicator on diagnostics button

## Success Criteria Verification

| Criterion | Status |
|-----------|--------|
| User sees download progress bar when update is being downloaded | Implemented |
| Download progress percentage updates in real-time during download | Implemented (every chunk) |
| After download complete, banner shows "下载完成" with "重启并安装" option | Implemented |
| Clicking "重启并安装" opens the installer and restarts the app | Implemented |
| On download failure, banner shows plain-language error message | Implemented (D-13 categories) |
| Failure banner has "重试" button that re-triggers download | Implemented |
| Failure banner has "官网下载" button that opens browser fallback | Implemented |
| Banner clears red dot badge when user clicks "稍后" but keeps update availability | Implemented via acknowledgeClientUpdate |

## Deviations from Plan

**None — plan executed exactly as written.**

## Commits

- `f8e18964` feat(14-02): implement in-client download orchestration with progress tracking

## Requirements Addressed

- DESK-03: in-client update trigger and completion
