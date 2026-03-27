# Phase 04: Desktop Link Import - Research

**Researched:** 2026-03-27
**Domain:** Electron desktop runtime + helper-backed URL import + shared upload/generation UI
**Confidence:** HIGH

## Summary

Phase 04 is an integration phase, not a greenfield build. The codebase already contains a real desktop URL-import path:

- `frontend/src/features/upload/UploadPanel.jsx` already has:
  - `desktopSourceMode === "link"`
  - `desktopLinkImporting` phase state
  - `submitDesktopLinkImport()`
  - desktop helper bridge usage
- `app/api/routers/desktop_asr.py` already exposes:
  - `POST /api/desktop-asr/url-import/tasks`
  - `GET /api/desktop-asr/url-import/tasks/{task_id}`
  - `POST /api/desktop-asr/url-import/tasks/{task_id}/cancel`
  - `GET /api/desktop-asr/url-import/tasks/{task_id}/file`
- `desktop-client/electron/main.mjs` already proxies local helper requests from the renderer
- `desktop-client/package.json` and related runtime code already package `yt-dlp`

The main gap is that the current helper path still behaves like a direct-file downloader, while the user wants the feature centered on common public video page links and a polished one-click flow.

**Primary recommendation:** split Phase 04 into two plans:

1. `04-01` — harden the link-import runtime and upload entry UX
2. `04-02` — connect imported media into the canonical lesson/history/learning flow

---

<user_constraints>
## User Constraints (from CONTEXT.md)

- Always-visible source tabs: `本地文件` / `链接导入`
- Web and desktop both show the same source selector shape, but only desktop performs in-product link import
- Prioritize common public video page links
- One link at a time only
- Sanitize pasted text automatically and keep the first valid URL
- `导入并生成课程` runs the whole chain immediately
- No URL-confirm step
- SnapAny is always visible on web and desktop, but secondary
- Every visible `SnapAny` word is clickable: copy URL + attempt to open site
- Invalid input exact wording: `未识别到可导入链接。`
- Invalid input hints include public video page examples + SnapAny
- Restriction/login links get a dedicated message and also recommend SnapAny
- Parsed title becomes default title
- Title editable during generation, and edits become the final title immediately
- Switching away from `链接导入` during active work prompts: `继续后台执行` / `取消当前链接任务`
- Success goes directly into learning
- Failure preserves cleaned link input for retry
- Imported lessons must disappear into the canonical learner flow after creation
</user_constraints>

---

## Existing Architecture

### Frontend

`frontend/src/features/upload/UploadPanel.jsx`

Already contains:
- desktop source mode
- desktop link import phase handling
- helper bridge calls
- progress/cancel UI
- success path that already knows how to navigate into learning

This is the correct entry surface for Phase 04. No new page is needed.

### Desktop runtime

`desktop-client/electron/main.mjs`

Already exposes:
- `requestLocalHelper()`
- `transcribeLocalMedia()`
- `generateLocalCourse()`
- file-selection/read bridges
- IPC endpoints used by the renderer

This means Phase 04 should extend the existing helper bridge, not invent a second desktop transport.

### Helper API

`app/api/routers/desktop_asr.py`

Already provides URL import task creation, polling, cancellation, and downloaded-file retrieval.

Important finding:
- current default implementation routes through `download_public_media()`
- the default path is direct HTTP download
- real-world common video page links will need richer handling than direct-file URLs

### Runtime tool packaging

Relevant files:
- `desktop-client/package.json`
- `desktop-client/electron/helper-runtime.mjs`
- `app/infra/runtime_tools.py`
- `tests/contracts/test_desktop_runtime_contract.py`
- `tests/contracts/test_desktop_installer_contract.py`

The project is already structurally prepared to rely on packaged `yt-dlp`.

---

## Recommended Structure

### Plan 04-01: runtime and upload entry
- `frontend/src/features/upload/UploadPanel.jsx`
- `desktop-client/electron/main.mjs`
- `app/api/routers/desktop_asr.py`
- `app/infra/runtime_tools.py`
- `tests/unit/test_desktop_local_asr.py`
- `tests/contracts/test_desktop_runtime_contract.py`

### Plan 04-02: canonical handoff and learner flow
- `frontend/src/features/upload/UploadPanel.jsx`
- `frontend/src/store/slices/lessonSlice.ts`
- `frontend/src/app/learning-shell/LearningShellContainer.jsx`
- `frontend/src/features/lessons/LessonList.jsx`
- `tests/integration/test_regression_api.py`
- `tests/e2e/test_e2e_key_flows.py`

---

## Patterns to Reuse

### Shared upload-task surface
Phase 03 already normalized:
- staged progress
- partial success
- retry/cancel
- canonical lesson handoff

Phase 04 should reuse the same task-state model for sanitation, download/import, and generation.

### Canonical lesson handoff
Imported media must feed into the same canonical lesson/history/learning contract used by file uploads.

### Desktop-only capability boundary
Web should explain the boundary and expose SnapAny, not fake browser-side import parity.

---

## Common Pitfalls

### Pitfall 1: keeping direct-HTTP assumptions
If the helper remains direct-link-only, the main user case of common public video page links will feel broken.

### Pitfall 2: leaking import identity into history
If imported lessons get special learner-facing badges or alternate flows, Phase 04 will undo Phase 03 cleanup.

### Pitfall 3: clearing input on failure
The user explicitly wants retry without re-paste.

### Pitfall 4: title edit only updates local UI
The user wants in-progress edits to become the final lesson title, so title editing must propagate through task/workspace/default lesson naming inputs.

### Pitfall 5: inconsistent SnapAny behavior
Every `SnapAny` word must behave the same way: copy + open.

---

## Validation Architecture

### Existing relevant tests
- `tests/unit/test_desktop_local_asr.py`
- `tests/contracts/test_desktop_runtime_contract.py`
- `tests/contracts/test_desktop_installer_contract.py`

### Gaps to close
1. sanitation and first-valid-URL extraction
2. restriction/login failure messaging
3. title propagation during import
4. preserved retry input
5. direct-to-learning navigation on success

### Suggested commands
- `pytest tests/unit/test_desktop_local_asr.py -q`
- `pytest tests/contracts/test_desktop_runtime_contract.py tests/contracts/test_desktop_installer_contract.py -q`
- `pytest tests/integration/test_regression_api.py -k "desktop or url_import or workspace" -q`
- `pytest tests/e2e/test_e2e_key_flows.py -k "lesson or progress" -q`

---

## Key Recommendation

Do not plan Phase 04 as “build link import from scratch”.

Plan it as:
- extend existing link-import plumbing to handle real-world user links
- align upload UX to the exact decisions already made
- preserve canonical learner flow after lesson creation

---

*Research date: 2026-03-27*
*Phase: 04-desktop-link-import*
