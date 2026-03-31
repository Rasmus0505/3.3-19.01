# v2.2 Research: Architecture

**Date:** 2026-03-31
**Milestone:** v2.2 桌面发布与体验收口

## 1. Desktop Release Architecture

### Recommended Build and Release Flow

1. CI builds the packaged Windows `nsis` installer with `electron-builder`.
2. CI signs the app and installer.
3. CI publishes release artifacts plus update metadata (`latest.yml`) to a stable HTTPS endpoint.
4. Desktop app uses `electron-updater` in the main process to check, download, and install app updates.
5. Release notes shown to the user come from the same metadata / release record used by the update pipeline.

### Why This Fits The Current Codebase

- The repo already uses `electron-builder` + `nsis`, which is the official auto-updatable Windows target in Electron Builder docs.
- Current desktop code already tracks:
  - current version
  - remote version
  - metadata URL
  - entry URL
- That existing custom status layer can become the UI/diagnostics layer around `electron-updater`, rather than remaining a separate updater implementation.

## 2. Model Incremental Update Architecture

### Recommended Boundary

- Keep ASR model/resource updates separate from app binary updates.
- Treat model update as a manifest-driven asset sync:
  - remote manifest
  - local manifest
  - checksum/version comparison
  - changed-file download only

### Why

- App code and model assets have different cadence, size, and failure modes.
- Updating a model should not force a full installer reinstall.
- Existing code already contains this separation, so the architecture should formalize it instead of collapsing it.

## 3. Announcement Architecture

### Suggested Data Model

- `announcement_type`: `changelog` | `banner` | `modal`
- `title`
- `body`
- `is_pinned`
- `sort_order`
- `is_active`
- `starts_at` / `ends_at` (optional but strongly recommended)
- `platform_scope`: `web` | `desktop` | `all`
- `dismiss_policy` (optional, later)

### Suggested Delivery Model

- Admin CRUD lives in existing admin backend/frontend.
- Public read API exposes only active announcements.
- Web and desktop both consume the same normalized announcement payload.
- Desktop can optionally merge announcement display with update availability UI.

## 4. Wordbook Architecture

### Current Base

- `wordbook_entries` already stores review timing and counts.
- `wordbook_entry_sources` already stores sentence/lesson context.
- API surface already supports:
  - collect
  - list
  - review queue
  - review mutation
  - status mutation
  - delete

### Recommended v2.2 Shape

- Keep existing tables as the base.
- Extend scheduling semantics only where needed for mastery / forgetting-curve behavior.
- Separate wordbook into distinct surfaces:
  - due review
  - all words / management
  - detail/context
- Put “review-first” navigation ahead of passive collection browsing.

## 5. UX Hint Architecture

### Recommended Pattern

- One reusable hint primitive with:
  - anchor target
  - short explanation
  - optional keyboard shortcut / next action
  - auto-dismiss timeout
  - display rules: hover, first-use, blocked-state, or explicit trigger

### Why

- The app already has tooltip/popover capability.
- A shared primitive prevents every page from inventing its own hint behavior and timing.

## 6. Security and Runtime Boundaries

### Current Code Risks

- `contextIsolation: true` and `nodeIntegration: false` are already enabled in desktop main window creation. This is good.
- `sandbox: false` is currently set.
- `webSecurity` is disabled when loading the bundled file renderer.

### Architectural Consequence

- v2.2 should not only package and publish the app; it should also tighten the packaged desktop runtime boundary.
- “避免核心代码泄露” should be handled as:
  - signed release artifacts
  - reduced renderer privilege
  - minimized exposed preload API
  - less direct extraction/reuse of sensitive runtime assets
  - better release pipeline control

It should not be framed as “JavaScript desktop code becomes impossible to inspect”.

## Primary Sources

- [electron-builder Auto Update](https://www.electron.build/auto-update.html)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
