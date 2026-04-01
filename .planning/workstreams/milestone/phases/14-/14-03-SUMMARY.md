---
phase: 14
plan: 03
type: execute
subsystem: desktop-client
tags: [model-update, delta-update, progress-ui, asset-boundary, SECU-03]
dependency_graph:
  requires: []
  provides:
    - DESK-04
    - DESK-05
    - SECU-03
  affects:
    - desktop-client/electron/main.mjs
    - frontend/src/features/upload/UploadPanel.jsx
tech_stack:
  added:
    - desktopModelUpdateState: currentFile, downloading fields
    - Progress tracking: completedFiles/totalFiles
    - Error categorization: network_error, server_error, disk_error
  patterns:
    - IPC event: desktop:model-update-progress
    - State machine: idle -> checking -> ready -> downloading -> installed/error
    - File-level delta with per-file progress emit
key_files:
  created:
    - .planning/workstreams/milestone/phases/14-/desktop-asset-boundary.md
  modified:
    - desktop-client/electron/main.mjs
    - frontend/src/features/upload/UploadPanel.jsx
key_decisions:
  - Delta updates use bundled model as read-only baseline
  - Model writes always go to user-data, never to bundled paths
  - Error messages use plain-language categories (network/server/disk)
  - Asset boundary maintained as SECU-03 contract
decisions: []
metrics:
  duration: "~10 minutes"
  completed_date: "2026-04-01"
  tasks_completed: 3
  files_created: 1
  files_modified: 2
  commits: 3
---

# Phase 14 Plan 03: 桌面程序与模型增量更新产品化

## One-liner

Model delta update with file-level progress tracking, plain-language error messaging, retry UI, and asset boundary security contract.

## Completed Tasks

### Task 1: Extend model update state with progress fields (main.mjs)

Extended `desktopModelUpdateState` with `currentFile` and `downloading` fields. Implemented real `startDesktopModelUpdate` function that:
- Fetches remote manifest and computes delta
- Downloads each file individually with progress emit
- Categorizes errors into: network_error, server_error, disk_error
- Updates `completedFiles` and `currentFile` after each file download
- Shows Chinese user messages throughout the update flow

Added auto-check on launch in `bootstrapRuntime` for model updates.

**Commit:** `ed10e90e` - feat(14-03): extend model update state with progress fields

### Task 2: Add model update UI with progress display (UploadPanel.jsx)

Added model update state subscription via `onModelUpdateProgress`. Added model update card in diagnostics dialog showing:
- Status badge: 更新中 / 已是最新 / 有更新 / 失败 / 检查中 / 未检查
- File count progress: `N/M 个文件`
- Progress bar during download
- Current file name during download
- Local and remote version display
- Plain-language error messages for failure cases
- Action buttons: 更新模型 / 重试更新 / 取消 / 检查更新

Added asset boundary explanation section explaining:
- "程序更新随桌面安装包一起更新"
- "模型/资源可以在客户端内单独增量更新"

**Commit:** `53188e63` - feat(14-03): add model update UI with progress display

### Task 3: Create desktop asset boundary contract (SECU-03)

Created `desktop-asset-boundary.md` documenting:
- Protected Assets table: app.asar, BottleLocalHelper.exe, ffmpeg, yt-dlp, bundled model, install-state.json
- Updateable Assets table: user-data models, desktop-runtime.json, desktop-auth-session.json, updates/
- Baseline model information: faster-whisper-medium, faster-distil-small.en
- Release Checklist with security verification items
- Decision log for asset separation rationale

**Commit:** `21439856` - docs(14-03): create desktop asset boundary contract (SECU-03)

## Success Criteria Verification

- [x] User sees model update availability in diagnostics panel
- [x] Model update progress shows N/M file count and current filename during download
- [x] User can manually trigger model update with "更新模型" button
- [x] User can cancel model update while downloading
- [x] Model update failure shows plain-language message (network/server/disk/unknown)
- [x] Model update failure has "重试" button
- [x] Diagnostics panel explains "程序随正式包更新" vs "模型可单独增量更新"
- [x] Asset boundary contract enumerates protected vs updateable assets
- [x] Release checklist included in asset boundary document

## Requirements Completed

- DESK-04: User can see model update availability and trigger manual model update
- DESK-05: Model update downloads only changed files (delta), with progress display
- SECU-03: Asset boundary contract distinguishing bundled (protected) from user-data (updateable) assets

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check

- [x] All modified files exist and compile without errors
- [x] All commits verified with git log
- [x] Asset boundary document contains all required sections
- [x] Model update state has all required fields
- [x] UploadPanel model update UI contains all required elements
