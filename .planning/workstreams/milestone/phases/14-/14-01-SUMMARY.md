---
phase: 14-desktop-program-and-model-incremental-updates
plan: "01"
subsystem: desktop-client
tags: [electron, ipc, desktop-update, react]

# Dependency graph
requires:
  - phase: "13"
    provides: "stable-only release surface, /desktop/client/latest.json metadata endpoint, desktop-releases.json generation"
provides:
  - "desktopClientUpdateState with badgeVisible field for red dot tracking"
  - "desktop:acknowledge-client-update IPC handler for clearing red dot badge"
  - "desktop:start-client-update-download stub IPC handler for Plan 14-02"
  - "preload bridge exposes acknowledgeClientUpdate and startClientUpdateDownload to renderer"
  - "UploadPanel wired to onClientUpdateStatusChanged with live update state"
  - "Red dot badge (animate-ping) on diagnostics button when update available"
  - "Non-blocking update banner with version info, 立即更新, and 稍后 buttons"
affects:
  - "14-02: in-client download orchestration (uses startClientUpdateDownload stub)"
  - "14-03: model update UX (shares update banner pattern)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Desktop update state machine: idle → checking → ready/error with badgeVisible tracking"
    - "Renderer subscribes to main process update state via IPC event channel"
    - "Non-blocking banner pattern: dismissible + actionable (update/snooze)"
    - "Red dot badge using Tailwind animate-ping + rounded-full"

key-files:
  created: []
  modified:
    - "desktop-client/electron/main.mjs"
    - "desktop-client/electron/preload.cjs"
    - "frontend/src/features/upload/UploadPanel.jsx"

key-decisions:
  - "badgeVisible is separate from updateAvailable: red dot clears on acknowledge but update banner reappears until installed"
  - "Auto-check fires on launch via existing bootstrapRuntime checkOnLaunch config"
  - "installPending '稍后' button also calls acknowledgeClientUpdate to clear red dot"
  - "checkClientUpdate added to diagnostics dialog footer for manual refresh"

patterns-established:
  - "Pattern 1: badgeVisible state - red dot visible when updateAvailable && badgeVisible; clears on acknowledge or install"
  - "Pattern 2: Banner is non-blocking - dismissible with acknowledgeClientUpdate but reappears until installed"
  - "Pattern 3: IPC event subscription - renderer listens to desktop:client-update-status-changed for live updates"

requirements-completed: [DESK-02]

# Metrics
duration: 15min
completed: 2026-04-01
---

# Phase 14 Plan 01: Desktop Program Update Notification - Summary

**desktopClientUpdateState wired with badgeVisible field; non-blocking update banner with red dot badge shown when update available; diagnostics dialog shows version info and manual refresh**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-01T06:00:00Z
- **Completed:** 2026-04-01T06:15:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- desktopClientUpdateState extended with badgeVisible field (initially false)
- checkDesktopClientUpdate sets badgeVisible: updateAvailable when update found, false on idle/error/installed
- desktop:acknowledge-client-update IPC handler clears badgeVisible only (keeps updateAvailable)
- desktop:start-client-update-download stub IPC handler added for Plan 14-02
- preload bridge already exposes startClientUpdateDownload and acknowledgeClientUpdate
- UploadPanel subscribes to onClientUpdateStatusChanged with live state updates
- Red dot badge (animate-ping) on diagnostics button when badgeVisible + updateAvailable
- Non-blocking update banner with version info, release name, 立即更新 and 稍后 buttons
- 稍后 button dismisses banner and calls acknowledgeClientUpdate (clears red dot)
- 检查更新 button added to diagnostics dialog footer
- Fix: installPending section's 稍后 button now also calls acknowledgeClientUpdate

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend desktopClientUpdateState with badgeVisible and IPC handlers** - `39055b7e` (feat)
2. **Task 2: Extend preload bridge with acknowledge and download-start bridges** - Pre-completed in previous session
3. **Task 3: Wire version display, update banner, and red dot badge in UploadPanel** - `18b91b02` (feat)

**Plan metadata:** committed with task 3

## Files Created/Modified

- `desktop-client/electron/main.mjs` - Added badgeVisible field to state, IPC handlers for acknowledge and stub download
- `desktop-client/electron/preload.cjs` - Already exposes startClientUpdateDownload and acknowledgeClientUpdate bridges
- `frontend/src/features/upload/UploadPanel.jsx` - Wired update state subscription, banner, red dot badge, and buttons

## Decisions Made

- badgeVisible is a separate flag from updateAvailable: red dot clears on acknowledge but banner can reappear if state updates
- Auto-check fires on launch via existing bootstrapRuntime checkOnLaunch config (desktopRuntimeConfig.clientUpdate.checkOnLaunch !== false)
- 稍后 button always calls acknowledgeClientUpdate (clears red dot) plus sets local banner dismissed state
- Diagnostics dialog footer gets 检查更新 button for manual refresh

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Plan 14-02 can now wire the real download orchestration to the startClientUpdateDownload stub
- Red dot badge pattern established; can be applied to model update flow in Plan 14-03

---
*Phase: 14-01*
*Completed: 2026-04-01*
