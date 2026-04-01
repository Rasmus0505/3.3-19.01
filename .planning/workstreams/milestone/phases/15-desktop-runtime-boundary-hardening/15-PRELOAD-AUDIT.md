# Phase 15: preload 暴露面审核报告

**审核日期:** 2026-04-01
**审核范围:** `desktop-client/electron/preload.cjs` 全部暴露方法
**结论:** 全部 31 个方法均有产品调用路径，无需移除

---

## desktopRuntime namespace（23 个方法 + 4 个事件监听）

| # | 方法 | IPC Channel | 调用方文件 | 状态 |
|---|------|------------|-----------|------|
| 1 | `getRuntimeInfo()` | `desktop:get-runtime-info` | `frontend/src/shared/api/client.js:31` | ✅ 保留 |
| 2 | `requestCloudApi(request)` | `desktop:request-cloud-api` | `frontend/src/shared/api/client.js:252` | ✅ 保留 |
| 3 | `cancelCloudRequest(requestId)` | `desktop:cancel-cloud-request` | `frontend/src/shared/api/client.js:240` | ✅ 保留 |
| 4 | `requestLocalHelper(request)` | `desktop:request-local-helper` | `frontend/src/features/upload/UploadPanel.jsx:277` | ✅ 保留 |
| 5 | `transcribeLocalMedia(request)` | `desktop:transcribe-local-media` | `frontend/src/features/upload/UploadPanel.jsx:299` | ✅ 保留 |
| 6 | `getHelperStatus()` | `desktop:get-helper-status` | `frontend/src/features/upload/UploadPanel.jsx:3107` | ✅ 保留 |
| 7 | `getServerStatus()` | `desktop:get-server-status` | `frontend/src/features/upload/UploadPanel.jsx:3106` | ✅ 保留 |
| 8 | `probeServerNow()` | `desktop:probe-server-now` | `frontend/src/features/upload/UploadPanel.jsx:3131`, `frontend/src/hooks/useOfflineMode.js:14` | ✅ 保留 |
| 9 | `selectLocalMediaFile(options)` | `desktop:select-local-media-file` | `frontend/src/features/upload/UploadPanel.jsx`（通过 submit flow） | ✅ 保留 |
| 10 | `readLocalMediaFile(sourcePath)` | `desktop:read-local-media-file` | `frontend/src/features/upload/UploadPanel.jsx:1516` | ✅ 保留 |
| 11 | `getPathForFile(file)` | N/A（直接调用 webUtils） | `frontend/src/features/upload/UploadPanel.jsx:1464` | ✅ 保留 |
| 12 | `openLogsDirectory()` | `desktop:open-logs-directory` | `frontend/src/features/upload/UploadPanel.jsx:1921` | ✅ 保留 |
| 13 | `getClientUpdateStatus()` | `desktop:get-client-update-status` | `frontend/src/features/upload/UploadPanel.jsx:3180` | ✅ 保留 |
| 14 | `checkClientUpdate()` | `desktop:check-client-update` | `frontend/src/features/upload/UploadPanel.jsx`（UI 触发） | ✅ 保留 |
| 15 | `startClientUpdateDownload()` | `desktop:start-client-update-download` | `frontend/src/features/upload/UploadPanel.jsx`（UI 触发） | ✅ 保留 |
| 16 | `acknowledgeClientUpdate()` | `desktop:acknowledge-client-update` | `frontend/src/features/upload/UploadPanel.jsx`（UI 触发） | ✅ 保留 |
| 17 | `restartAndInstall()` | `desktop:restart-and-install` | `frontend/src/features/upload/UploadPanel.jsx`（UI 触发） | ✅ 保留 |
| 18 | `openClientUpdateLink(preferredUrl)` | `desktop:open-client-update-link` | `frontend/src/features/upload/UploadPanel.jsx:1945` | ✅ 保留 |
| 19 | `openExternalUrl(targetUrl)` | `desktop:open-external-url` | `frontend/src/features/upload/UploadPanel.jsx:1989` | ✅ 保留（白名单收紧） |
| 20 | `getModelUpdateStatus()` | `desktop:get-model-update-status` | `frontend/src/features/upload/UploadPanel.jsx:3180` | ✅ 保留 |
| 21 | `checkModelUpdate(modelKey)` | `desktop:check-model-update` | `frontend/src/features/upload/UploadPanel.jsx:209` | ✅ 保留 |
| 22 | `startModelUpdate(modelKey)` | `desktop:start-model-update` | `frontend/src/features/upload/UploadPanel.jsx:216` | ✅ 保留 |
| 23 | `cancelModelUpdate()` | `desktop:cancel-model-update` | `frontend/src/features/upload/UploadPanel.jsx:223` | ✅ 保留 |

### 事件监听（4 个）

| # | 方法 | IPC Channel | 调用方文件 | 状态 |
|---|------|------------|-----------|------|
| 24 | `onHelperRestarting(callback)` | `desktop:helper-restarting` | `frontend/src/features/upload/UploadPanel.jsx:230` | ✅ 保留 |
| 25 | `onServerStatusChanged(callback)` | `desktop:server-status-changed` | `frontend/src/features/upload/UploadPanel.jsx:3137` | ✅ 保留 |
| 26 | `onClientUpdateStatusChanged(callback)` | `desktop:client-update-status-changed` | `frontend/src/features/upload/UploadPanel.jsx:3170` | ✅ 保留 |
| 27 | `onModelUpdateProgress(callback)` | `desktop:model-update-progress` | `frontend/src/features/upload/UploadPanel.jsx:230` | ✅ 保留 |

---

## auth namespace（3 个方法）

| # | 方法 | IPC Channel | 调用方文件 | 状态 |
|---|------|------------|-----------|------|
| 28 | `auth.cacheSession(session)` | `desktop:auth-cache-session` | `frontend/src/app/authStorage.js:87` | ✅ 保留 |
| 29 | `auth.restoreSession(options)` | `desktop:auth-restore-session` | `frontend/src/app/authStorage.js:129` | ✅ 保留 |
| 30 | `auth.clearSession()` | `desktop:auth-clear-session` | `frontend/src/app/authStorage.js:165` | ✅ 保留 |

---

## localAsr namespace（1 个方法）

| # | 方法 | IPC Channel | 调用方文件 | 状态 |
|---|------|------------|-----------|------|
| 31 | `localAsr.generateCourse(request)` | `local-asr:generate-course` | `frontend/src/features/upload/UploadPanel.jsx`（本地课程生成流程） | ✅ 保留 |

---

## 审核结论

- **总计:** 31 个暴露方法
- **有产品调用路径:** 31/31 ✅
- **候选移除:** 0
- **Phase 15 preload 行动:** 仅验证 31 个方法全部正确暴露，无需修改 preload.cjs 代码
- **openExternalUrl 收紧:** 不在此文件，改在 `main.mjs` 的白名单逻辑（Plan 15-01 Task 1.3）
