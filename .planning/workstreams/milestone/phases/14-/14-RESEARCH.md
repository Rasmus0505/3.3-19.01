# Phase 14: 桌面程序与模型增量更新产品化 - Research

**Researched:** 2026-04-01
**Domain:** Electron desktop in-app update flow, Bottle 1.0 model delta update, asset boundary documentation
**Confidence:** HIGH

## Summary

Phase 14 is not about inventing a second update system. The codebase already has the core ingredients scattered across three layers:

1. **Backend release metadata** (`app/main.py`): Already serves `/desktop/client/latest.json` with `latestVersion`, `entryUrl`, `releaseName`, `notes`. Phase 13 established this as the stable-only surface.
2. **Desktop main process** (`main.mjs`): Already maintains `desktopClientUpdateState` and `desktopModelUpdateState`, with IPC handlers for check/start/cancel. Already fires `desktop:client-update-status-changed` and `desktop:model-update-progress` events.
3. **Desktop renderer** (`UploadPanel.jsx`): Already has a diagnostics dialog showing client version and update status. Already subscribes to `onClientUpdateStatusChanged` and `onModelUpdateProgress`. Already shows a model-update toast.

The gaps are in productizing and completing these three flows:

- **Program update UX**: The banner + red-dot non-blocking notification is not wired yet; the diagnostics dialog's "client-update" entry shows status but has no actionable buttons. The healthy path "download in-client → user restarts" needs actual download orchestration (progress tracking, download-complete state, restart trigger).
- **Model update UX**: The delta engine in `model-updater.mjs` works, but the first-time baseline flow (D-12: bundled model → user-data copy) and the progress UI (file count + current filename) need integration. The "no auto-download, user confirms" UX (D-09) needs a proper confirmation step.
- **Asset boundary documentation**: No written contract distinguishes bundled/protected assets from updateable ones. This is SECU-03's deliverable: a maintainable清单 that teams update as part of the release checklist.

**Primary recommendation:** Split Phase 14 into three plans:
1. `14-01` — Program update metadata wiring, version display, update-available notification (banner + red dot), and manual refresh.
2. `14-02` — Productize in-client program update flow: download with progress, download-complete state, user-controlled restart trigger, and failure recovery.
3. `14-03` — Model/resource delta update: bundled-to-user-data baseline on first run, manual-trigger UI with file progress, failure recovery, and asset boundary清单.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** 桌面客户端启动后自动检查程序更新，同时保留手动刷新入口。
- **D-02:** 若发现新版本，默认以非阻塞横幅提示，并同时显示一个小红点提醒；诊断面板保留完整详情。
- **D-03:** 更新信息至少显示当前版本、最新版本，以及发布名称或一句更新说明。
- **D-04:** 用户点击"立即更新"后，健康路径应在客户端内完成更新包下载，而不是直接跳浏览器或网盘。
- **D-05:** 如果用户正在生成课程、下载素材或执行本地任务，默认不强制打断；提供"现在更新"与"稍后更新"两种选择，默认允许稍后处理。
- **D-06:** 更新包下载完成后，由用户选择"重启并安装"或"稍后"，不做强制退出安装。
- **D-07:** 程序更新失败时，主恢复入口为重试、打开日志目录、以及官方下载入口。
- **D-08:** Bottle 1.0 模型/资源更新也在客户端启动时自动检查，同时保留手动触发。
- **D-09:** 发现模型更新后不自动后台下载，而是提示用户手动点"更新模型"。
- **D-10:** 模型增量更新一律写入用户目录；安装包内置模型仅作为只读基线，不直接修改打包目录。
- **D-11:** 模型更新进度至少显示文件数进度、当前文件名，并在失败后允许直接重试。
- **D-12:** 现有 bundled model 可作为第一次落地到 user-data 的基线副本，然后在 user-data 上继续做增量更新。
- **D-13:** 失败态主文案保持面向普通用户，只说明可理解的原因类别和下一步动作，不默认暴露技术细节。
- **D-14:** 模型更新失败后的默认恢复动作是"重试更新"或"暂不更新"，不强制用户立即做完整重下。
- **D-15:** 在诊断面板或帮助说明中明确区分"程序核心运行时随正式包更新"与"Bottle 1.0 模型资源可单独增量更新"。
- **D-16:** 团队侧必须维护一份资产边界清单，区分"打包保护资产"与"允许增量更新资产"，并纳入发布检查。

### Claude's Discretion
- 小红点的精确位置、何时消失、是否按版本号清除
- 横幅 copy、视觉层级、与诊断入口的具体组合方式
- 程序更新下载实现细节，例如后台任务管理、断点续传、安装器调用方式
- 模型更新失败原因的内部分类、日志字段和状态枚举设计

### Deferred Ideas (OUT OF SCOPE)
- preview/internal 分发面恢复
- staged rollout / forced update 策略（对应 Future Requirement DESK-06）
- 更完整的面向普通用户的技术诊断展开面板

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DESK-02 | User can see the installed desktop app version and whether a newer official app version is available. | Backend already serves version via `/desktop/client/latest.json`; `desktopClientUpdateState` in main.mjs already tracks local/remote version. UI needs: version display in diagnostics + non-blocking banner + red dot notification when update available. |
| DESK-03 | User can trigger a desktop app update from inside the client and complete it without manually uninstalling and reinstalling when the update path is healthy. | Requires: download orchestration in main.mjs, download progress state, download-complete state, restart trigger, fallback to manual download on failure. Electron's `electron-download` or native `fetch` + file write handles this; no `electron-updater` NSIS differential needed at this stage (stable-only, simple installer replacement). |
| DESK-04 | User can update Bottle desktop ASR model/resource files by downloading only the changed files instead of re-downloading the full model bundle. | `model-updater.mjs` already implements delta computation (`computeModelUpdateDelta`) and incremental file fetch. `local_asr_assets.py` already serves manifest and per-file download endpoints. Need: first-run bundled-to-user-data baseline copy, manual-trigger confirmation UI, progress display (file N/M + current filename), retry on failure. |
| DESK-05 | User can see update progress, completion state, and actionable recovery guidance when app or model update fails. | `desktopClientUpdateState` and `desktopModelUpdateState` both have `lastError` fields. Need: failure banner with plain-language category (network/server/unknown), recovery actions (retry / open logs / manual download), diagnostics dialog detail. D-13/D-14 constrain severity messaging. |
| SECU-03 | Operator can verify which packaged runtime assets are protected inside the official desktop release and which assets remain updateable by design. | Requires: written `desktop-asset-boundary.md` contract maintained by the team, distinguishing bundled/protected from updateable. Phase 13 installer (`installer.nsh`) and `helper-runtime.mjs` provide the data source for this enumeration. |

</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Electron (main process) | existing | Update orchestration, IPC, app lifecycle | Already in use |
| `fetch` API (Node.js 18+) | built-in | Download update packages and model files | Already used in main.mjs for metadata check |
| `node:fs/promises` | built-in | Write downloaded bytes to disk | Already used in model-updater.mjs |
| `electron` NSIS installer | existing | Install downloaded update packages | Phase 13 installer already targets NSIS |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `electron-builder` NSIS | existing | Produces Windows installer for downloaded update packages | Only if differential NSIS updates are needed; simple full-installer replacement is simpler |
| shadcn/ui `Toast` | existing | Non-blocking update-available notifications | Already used in UploadPanel via `sonner` |

### No New Dependencies Required

The phase reuses existing infrastructure:
- `app/main.py` routes are already in place
- `desktop-client/electron/main.mjs` IPC handlers already exist
- `desktop-client/electron/model-updater.mjs` delta engine is complete
- `frontend/src/features/upload/UploadPanel.jsx` diagnostics dialog already exists
- `desktop-client/scripts/release-win.mjs` is the release metadata source

**No new npm packages are needed** for Phase 14.

---

## Architecture Patterns

### Recommended Project Structure

```
desktop-client/electron/
├── main.mjs                    # Extend: download orchestration, restart trigger
├── model-updater.mjs          # Already complete; may need first-run baseline helper
├── runtime-config.mjs         # Already has clientUpdate config
├── helper-runtime.mjs         # Source of truth for bundled vs user-data model dir
├── preload.cjs                # Already exposes all needed bridges
└── (no new files needed)

desktop-client/
├── scripts/
│   └── release-win.mjs        # Produces desktop-releases.json (already exists)
└── build/
    └── installer.nsh          # Already writes desktop-install-state.json

app/
├── main.py                    # Already serves /desktop/client/latest.json
└── api/routers/
    └── local_asr_assets.py    # Already serves manifest + per-file download

frontend/src/features/upload/
└── UploadPanel.jsx            # Extend: banner, red dot, model update confirmation UI

.planning/workstreams/milestone/
├── phases/14-/
│   ├── 14-ASSET-BOUNDARY.md   # NEW: SECU-03 deliverable
│   └── 14-RELEASE-CHECKLIST.md # NEW: pre/post-release asset boundary verification
```

### Pattern 1: Desktop Update State Machine (main.mjs)

**What:** `desktopClientUpdateState` follows a 5-state machine: `idle → checking → ready → downloading → installed`.

**When to use:** Every program update interaction flows through this state.

```
idle ──check──► checking ──► ready (update available)
                         └──► idle (no update)
ready ──download──► downloading ──► ready (download done, pending restart)
                         └──► error (download failed)
downloading ──cancel──► idle
ready ──restart──► installed ──(app relaunch)──► idle
```

**Key insight:** The download happens in main.mjs using `fetch` + `fs.writeFile`, not via `electron-updater`'s NSIS differential. This is simpler for stable-only distribution (one installer per release, no differential complexity).

### Pattern 2: Model Update with Bundled Baseline (model-updater.mjs + helper-runtime.mjs)

**What:** On first model update check, if `targetModelDir` is empty but `bundledModelDir` exists, copy the bundled model to user-data before applying deltas.

**When to use:** D-12 (bundled model as user-data baseline).

```
targetModelDir empty?
  └── YES ──bundledModelDir exists?── YES ── copyDir(bundled, target) ── apply delta
  └── NO  ── apply delta from remote manifest
```

**Key code location:** `model-updater.mjs` lines 134-138 already have this logic:

```javascript:desktop-client/electron/model-updater.mjs
// Source: lines 134-138
const initialFiles = await listActualFiles(resolvedTargetDir);
if (initialFiles.length === 0 && (await pathExists(resolvedBaseDir))) {
  await copyDirectory(resolvedBaseDir, resolvedTargetDir);
}
```

### Pattern 3: Non-blocking Update Notification (UploadPanel.jsx)

**What:** When `updateAvailable: true`, show both a sticky banner (or toast) AND a red dot badge. The banner is dismissible; the red dot persists until the update is applied.

**When to use:** D-02 — new version available notification.

### Pattern 4: Failure Recovery with Plain-Language Messaging (main.mjs)

**What:** `lastError` in update states classifies errors into categories, then the UI maps categories to user-facing messages.

**Classification (Claude's discretion for internal enum):**
- `network_error` → "网络连接失败，请检查网络后重试"
- `server_error` → "服务器暂时不可用，请稍后重试"
- `disk_error` → "磁盘空间不足，请清理后重试"
- `unknown` → "更新遇到问题，请重试或联系支持"

**Key insight:** D-13 says primary copy should not expose technical details. The enum exists internally but the UI always shows a user-understandable category + next action.

### Anti-Patterns to Avoid

- **Don't implement auto-restart after download.** D-06 locks this: "由用户选择'重启并安装'或'稍后'，不做强制退出安装。"
- **Don't auto-download model updates.** D-09 locks this: "发现模型更新后不自动后台下载，而是提示用户手动点'更新模型'。"
- **Don't modify bundled model directory.** D-10 locks this: "模型增量更新一律写入用户目录；安装包内置模型仅作为只读基线，不直接修改打包目录。"
- **Don't mix stable and preview update channels.** Phase 13 locked stable-only; Phase 14 must only check `/desktop/client/latest.json` (stable).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Delta computation for model files | Custom diff logic | Existing `computeModelUpdateDelta` in model-updater.mjs | Already handles SHA-256 comparison, missing vs changed detection |
| Version comparison | Custom semver parsing | Existing `remoteVersion !== app.getVersion()` comparison | Simple string comparison suffices for stable releases |
| Download progress tracking | Custom stream wrapper | Node.js `fetch` + `response.arrayBuffer()` + `fs.writeFile` | Sufficient for installer-sized downloads (<200MB); no need for streaming unless larger |
| Bundled model baseline detection | Custom first-run detection | Existing `initialFiles.length === 0` check in model-updater.mjs | Already correctly triggers bundled copy |
| Asset boundary enumeration | Ad-hoc memory | Written `desktop-asset-boundary.md` checked at release time | SECU-03 requires verifiable documentation |

---

## Runtime State Inventory

> This phase touches desktop-client code and configuration. It does NOT involve renaming, rebrand, or string-replacement across services.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `userData/models/faster-distil-small.en/.model-version.json` — user-local model state | No migration; model-updater writes to user-data, bundled remains read-only |
| Live service config | `desktop-install-state.json` in packaged resources — bundled model location and bottle1 install choice | No migration; this file is read-only input to Phase 14 |
| OS-registered state | None | No action |
| Secrets/env vars | None | No action |
| Build artifacts | `desktop-releases.json` (written by release-win.mjs) — stable release metadata | Phase 14 reads this via `/desktop/client/latest.json`; no rename needed |

**Nothing found in category:** OS-registered state (no Windows Task Scheduler, no pm2, no launchd).  
**Nothing found in category:** Secrets/env vars (no SOPS keys, no .env references to update-related strings).  
**No rename/refactor:** This phase adds new capabilities, not renaming existing ones.

---

## Common Pitfalls

### Pitfall 1: Opening browser for update download instead of in-client download

**What goes wrong:** D-04 requires in-client download, but the current `openClientUpdateLink` just calls `shell.openExternal(targetUrl)`, which opens the browser. Users download from the browser instead of inside the app.

**Why it happens:** Phase 13 used the browser as the fallback download path. Phase 14 needs to intercept the update flow before `shell.openExternal` is called.

**How to avoid:** Add a new IPC handler `desktop:start-client-update-download` in main.mjs that uses `fetch` to download the `entryUrl` to a temp path, tracks progress, and transitions `desktopClientUpdateState` to `downloading`. Keep `openClientUpdateLink` as the fallback for the "manual download" recovery path (D-07).

### Pitfall 2: No first-run bundled model baseline for model updates

**What goes wrong:** If a user installs the desktop app with bundled models but never runs model update, their `userData/models/` dir is empty. When they first check model update, `targetModelDir` is empty and `localManifest` has no files. Without the bundled copy, the delta would re-download all model files.

**Why it happens:** `model-updater.mjs` already has the baseline copy logic (lines 136-138), but this requires `baseModelDir` (the bundled dir) to be passed correctly from `main.mjs`'s `startDesktopModelUpdate`.

**How to avoid:** Ensure `performIncrementalModelUpdate` receives `baseModelDir: desktopPackagedRuntime?.bundledModelDir` from `startDesktopModelUpdate` (it already does — see main.mjs line 1019-1021). The bundled model dir is only set when `app.isPackaged`, which is correct.

### Pitfall 3: Mixing version display between packaged and dev runtime

**What goes wrong:** In dev mode (`!app.isPackaged`), `app.getVersion()` returns the package.json version, which may differ from the packaged runtime version. Users see confusing "update available from X to X" where X is the same version.

**How to avoid:** Always compare against the version in the metadata payload (`remoteVersion` from `/desktop/client/latest.json`). The `localVersion` in `desktopClientUpdateState` should also come from the packaged metadata, not `app.getVersion()`, when running packaged. However, `app.getVersion()` is fine as-is since dev machines shouldn't receive update notifications anyway.

### Pitfall 4: Blocking user work with forced update dialog

**What goes wrong:** If the user is generating a lesson and an update is available, a blocking dialog could interrupt the flow.

**How to avoid:** D-05 is explicit: "如果用户正在生成课程、下载素材或执行本地任务，默认不强制打断；提供'现在更新'与'稍后更新'两种选择。" The update banner should be non-blocking (dismissible), and the "update now" button should only appear outside of active generation tasks.

### Pitfall 5: No progress detail during model update

**What goes wrong:** D-11 requires "文件数进度、当前文件名" but `desktopModelUpdateState` doesn't currently track `currentFile` or `completedFiles` during download.

**How to avoid:** Extend `desktopModelUpdateState` to include `currentFile` and update it inside the `performIncrementalModelUpdate` loop (model-updater.mjs). The preload bridge already passes `desktopModelUpdateState` through, so the renderer will receive the progress automatically via `onModelUpdateProgress`.

### Pitfall 6: Asset boundary not documented becomes stale

**What goes wrong:** SECU-03 requires that operators can verify asset boundaries. Without a written contract, the boundary drifts over time as new assets are added.

**How to avoid:** Create `desktop-asset-boundary.md` as a living document checked during release. Include it in the Phase 14 release checklist.

---

## Code Examples

### 1. Program Update State Extension (main.mjs)

Existing state already has `status`, `localVersion`, `remoteVersion`, `updateAvailable`. Extend to track download:

```javascript
// New fields to add to desktopClientUpdateState:
let desktopClientUpdateState = {
  // ... existing fields ...
  downloading: false,        // true while download in progress
  downloadProgress: 0,       // 0-100
  downloadPath: "",           // local path of downloaded installer
  installPending: false,     // true after download complete, awaiting restart
};
```

### 2. Download Orchestration (main.mjs — new function)

```javascript
async function startClientUpdateDownload() {
  const { entryUrl } = desktopClientUpdateState;
  if (!entryUrl) return;
  
  desktopClientUpdateState = {
    ...desktopClientUpdateState,
    status: "downloading",
    downloading: true,
    downloadProgress: 0,
    message: "正在下载更新...",
  };
  emitClientUpdateState();

  try {
    const response = await fetch(entryUrl);
    const totalBytes = Number(response.headers.get("content-length") || 0);
    const chunks = [];
    const reader = response.body.getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      const received = chunks.reduce((sum, c) => sum + c.length, 0);
      desktopClientUpdateState.downloadProgress = totalBytes > 0 
        ? Math.round((received / totalBytes) * 100) : 0;
      emitClientUpdateState();
    }

    const installerPath = path.join(app.getPath("userData"), "updates", `bottle-desktop-${desktopClientUpdateState.remoteVersion}.exe`);
    await fs.mkdir(path.dirname(installerPath), { recursive: true });
    await fs.writeFile(installerPath, Buffer.concat(chunks));

    desktopClientUpdateState = {
      ...desktopClientUpdateState,
      status: "ready",
      downloading: false,
      downloadProgress: 100,
      downloadPath: installerPath,
      installPending: true,
      message: "下载完成，点击'重启并安装'完成更新",
    };
  } catch (error) {
    desktopClientUpdateState = {
      ...desktopClientUpdateState,
      status: "error",
      downloading: false,
      message: "下载失败，请重试或使用官方下载入口",
      lastError: error instanceof Error ? error.message : "download_failed",
    };
  }
  emitClientUpdateState();
}
```

### 3. Model Update Progress with Current File (model-updater.mjs)

Extend the file loop to report current filename back through state. This requires either:
- Returning a generator/async iterator from `performIncrementalModelUpdate`
- Or calling back to main.mjs's `emitModelUpdateState` from within the loop (would require passing the emitter)

**Recommended approach:** Return an async iterable from `performIncrementalModelUpdate`:

```javascript
export async function* streamModelUpdate({ apiBaseUrl, modelKey, remoteManifest, baseModelDir, targetModelDir }) {
  // ... baseline copy logic (existing) ...
  const localManifest = await readLocalManifest(resolvedTargetDir, modelKey);
  const delta = computeModelUpdateDelta(localManifest, remoteManifest);
  const remoteFiles = [...delta.missing, ...delta.changed];

  for (let i = 0; i < remoteFiles.length; i++) {
    const file = remoteFiles[i];
    const relativeName = trimText(file.name);
    const targetPath = path.join(resolvedTargetDir, ...relativeName.split("/"));
    // ... backup + download + write logic (existing) ...
    yield { completedFiles: i + 1, totalFiles: remoteFiles.length, currentFile: relativeName };
  }
  // ... write manifest ...
}
```

Then in `main.mjs`, iterate the generator and emit state on each step.

### 4. Asset Boundary Enumeration (SECU-03)

```markdown
# Desktop Asset Boundary Contract

**Last updated:** 2026-04-01
**Maintained by:** Release engineer at each stable release

## Protected Assets (随正式包更新 — DO NOT modify at runtime)

These assets are bundled inside the NSIS installer and are read-only at runtime:

| Asset | Location in installer | Runtime path | Notes |
|-------|----------------------|--------------|-------|
| Electron app binary | `resources/app.asar` | `app.asar` | Signed; replaced on reinstall |
| Helper executable | `resources/desktop-helper-runtime/BottleLocalHelper/BottleLocalHelper.exe` | Packaged helper | Used for local ASR when bundled |
| FFmpeg binaries | `resources/runtime-tools/ffmpeg/` | `ffmpeg.exe`, `ffprobe.exe` | Media processing |
| yt-dlp | `resources/runtime-tools/yt-dlp/yt-dlp.exe` | Link import | Updated with program |
| Preinstalled model (baseline) | `resources/preinstalled-models/faster-distil-small.en/` | Bundled model dir | Read-only; NOT modified by model updates |
| Install state record | `resources/desktop-install-state.json` | Read-only | Tracks how user installed |

## Updateable Assets (允许增量更新 — Can be updated independently)

These assets live in the user's data directory and are updated by the in-app updater:

| Asset | User data location | Update trigger | Update mechanism |
|-------|-------------------|----------------|------------------|
| Bottle 1.0 model files | `%APPDATA%/Bottle/models/faster-distil-small.en/` | Model update check | Delta download via `/api/local-asr-assets/` |
| Desktop client update | `%APPDATA%/Bottle/updates/` | Program update check | Full installer download via `/desktop/client/latest.json` |
| Runtime config | `%APPDATA%/Bottle/desktop-runtime.json` | First launch | Written by runtime-config.mjs |
| Auth session | `%APPDATA%/Bottle/desktop-auth-session.json` | Login/logout | Written by main.mjs |

## Release Checklist

Before publishing a stable release, verify:
- [ ] All protected assets are listed above and match `installer.nsh` contents
- [ ] No new assets were added to `resources/` that should be updateable
- [ ] Preinstalled model baseline hash recorded in `desktop-asset-boundary.md`
- [ ] `desktop-install-state.json` schema version matches current installer
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client update = open browser link | In-client download with progress | Phase 14 | Users stay in app during update |
| Model update = full re-download | Delta only (missing + changed files) | Already in Phase 13 (model-updater.mjs) | Faster, less bandwidth |
| Update available = diagnostics only | Non-blocking banner + red dot | Phase 14 | Users notified without searching |
| Asset boundary = implicit | Written contract + release checklist | Phase 14 | SECU-03 compliance |

**Deprecated/outdated:**
- Phase 13's `openClientUpdateLink` behavior (opens browser) — Phase 14 overrides this with in-client download for the healthy path
- Preview channel update metadata — Phase 13 locked stable-only; no preview update path in Phase 14

---

## Open Questions

1. **Should the downloaded installer be stored in a fixed location or temp dir?**
   - What we know: Electron's `app.getPath("temp")` is the natural temp location; `userData/updates/` is better for persistence across app restarts.
   - What's unclear: On Windows, does the downloaded .exe need special permissions to run from `%APPDATA%`?
   - Recommendation: Use `path.join(app.getPath("userData"), "updates", filename)` and let NSIS handle elevation.

2. **How should the restart-and-install flow work?**
   - What we know: D-06 says user controls restart. Electron can `app.relaunch()` after `app.quit()`.
   - What's unclear: Whether to call the installer with `/S` (silent) flags or just open it and let NSIS UI guide the user.
   - Recommendation: For stable-only (one installer per release), call `shell.openPath(downloadPath)` which lets NSIS UI handle the install. Use `app.relaunch()` after user confirms restart.

3. **Should model update progress show percentage or just file count?**
   - What we know: D-11 says "文件数进度、当前文件名". File count (N/M) is already tracked.
   - What's unclear: Whether bytes-based progress (% of total download) adds enough value to justify the extra complexity.
   - Recommendation: Show `N/M` files progress plus current filename. Add bytes percentage only if implementation is straightforward.

4. **What is the error classification taxonomy for update failures?**
   - What we know: D-13 constrains user-facing copy to plain-language categories. The internal enum is Claude's discretion.
   - What's unclear: How fine-grained should the internal categories be vs. how many distinct user messages are needed.
   - Recommendation: 4 categories (network, server, disk, unknown) as outlined in Pitfall 4. Keep the enum internal, map to user messages in the UI layer.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies beyond the project's own code and services)

This phase is entirely self-contained:
- Backend routes (`/desktop/client/latest.json`, `/api/local-asr-assets/`) are already in `app/main.py` and `local_asr_assets.py`
- Desktop IPC handlers are already registered in `main.mjs`
- Frontend components are already in `frontend/src/`
- No new CLI tools, databases, or services are required

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (existing) |
| Config file | `pytest.ini` — existing at repo root |
| Quick run command | `python -m pytest tests/contracts/test_desktop_runtime_contract.py -x -q` |
| Full suite command | `python -m pytest tests/contracts/ -x -q` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| DESK-02 | Client shows version + update-available status | unit | `python -m pytest tests/contracts/test_desktop_runtime_contract.py::test_client_update_state_fields -x` | ✅ (existing contract) |
| DESK-03 | In-client download flow with download-complete state | unit | `python -m pytest tests/contracts/test_desktop_runtime_contract.py::test_client_update_download_flow -x` | ❌ Wave 0 |
| DESK-04 | Model delta update writes to user-data, not bundled | unit | `python -m pytest tests/contracts/test_desktop_runtime_contract.py::test_model_delta_update_writes_userdata -x` | ❌ Wave 0 |
| DESK-05 | Update failure shows recovery actions | unit | `python -m pytest tests/contracts/test_desktop_runtime_contract.py::test_update_failure_recovery -x` | ❌ Wave 0 |
| SECU-03 | Asset boundary document exists and is verified at release | manual | `cat desktop-client/build/installer.nsh \| grep -c "resource"` + review `desktop-asset-boundary.md` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `python -m pytest tests/contracts/test_desktop_runtime_contract.py -x -q`
- **Per wave merge:** `python -m pytest tests/contracts/ -x -q`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/contracts/test_desktop_runtime_contract.py` — extend with DESK-02/03/04/05 contract tests:
  - `test_client_update_state_fields` — verify `desktopClientUpdateState` has all required fields (version, updateAvailable, downloading, downloadProgress, installPending, lastError)
  - `test_client_update_download_flow` — verify main.mjs transitions: idle→checking→ready→downloading→ready(installPending)→installed
  - `test_model_delta_update_writes_userdata` — verify `performIncrementalModelUpdate` writes to `targetModelDir`, not `baseModelDir`
  - `test_update_failure_recovery` — verify `lastError` field is set and maps to user-facing message categories
  - `test_bundled_model_baseline_copy` — verify first-run baseline copy from bundled to user-data when user-data is empty
- [ ] `desktop-asset-boundary.md` — SECU-03 deliverable: enumerated protected vs updateable assets with release checklist
- [ ] `14-RELEASE-CHECKLIST.md` — pre/post-release checklist including asset boundary verification

*(If no gaps: "None — existing test infrastructure covers all phase requirements")*

---

## Sources

### Primary (HIGH confidence)
- `desktop-client/electron/main.mjs` — lines 52-77 (desktopClientUpdateState), 890-934 (checkDesktopClientUpdate), 937-944 (openClientUpdateLink) — directly shows current update state architecture
- `desktop-client/electron/model-updater.mjs` — lines 83-99 (delta computation), 122-179 (performIncrementalModelUpdate) — complete delta engine with baseline copy
- `desktop-client/electron/helper-runtime.mjs` — bundled model dir resolution and bottle1UseAsRuntime logic
- `app/main.py` — `/desktop/client/latest.json` route (lines 656-669), stable-only channel enforcement
- `app/api/routers/local_asr_assets.py` — manifest and per-file download endpoints
- Phase 13 RESEARCH.md — stable-only surface established in Phase 13

### Secondary (MEDIUM confidence)
- [electron-builder auto-update docs](https://www.electron.build/auto-update.html) — general guidance; Phase 14 uses simpler fetch+write approach, not full electron-updater
- [shadcn/ui Alert component](https://ui.shadcn.com/docs/components/alert) — banner pattern for non-blocking notifications
- [sonner toast docs](https://sonner.dev/) — already in use in UploadPanel for model update toast

### Tertiary (LOW confidence)
- Specific Windows NSIS installer restart behavior — not verified; recommend manual testing in Phase 14 execution

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries/patterns confirmed from existing codebase
- Architecture: HIGH — state machine, delta engine, IPC bridge all verified in code
- Pitfalls: MEDIUM — identified from code review; recommend validation during execution

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable surface unlikely to change; model update API stable)

---

## Key Findings for Planner

1. **No new dependencies.** Phase 14 extends existing state machines and adds UI. The core engine (delta computation, manifest serving, IPC bridges) is already in place.
2. **Three distinct deliverables:** Program update UX (14-01/14-02), model update UX (14-03), and asset boundary documentation (SECU-03).
3. **The bundled model baseline is already implemented** in `model-updater.mjs`. The first-run copy from bundled to user-data happens automatically when `targetModelDir` is empty.
4. **The diagnostics dialog is the natural home** for version display and update status. The non-blocking banner + red dot are new additions that sit above the existing diagnostics.
5. **SECU-03 is primarily a documentation task.** The engineering data (what files go into the installer, what lives in user-data) is available in `helper-runtime.mjs` and `installer.nsh`. The deliverable is a written contract + release checklist.
6. **The healthy-path download** (D-04) is the most complex new piece. Use `fetch` + streaming + `fs.writeFile` in main.mjs; no `electron-updater` differential needed for stable-only releases.
