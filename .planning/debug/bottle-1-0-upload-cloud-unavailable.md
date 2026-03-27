---
status: awaiting_human_verify
trigger: "bottle-1.0-upload-cloud-unavailable"
created: 2026-03-27T14:35:00Z
updated: 2026-03-27T15:50:00Z
---

## Current Focus
hypothesis: "Both fixes implemented and frontend build succeeded. Awaiting human verification."
test: "Frontend build passed. Need to test desktop client packaged build."
expecting: "No more '云端识别当前不可用' for local ASR, no brief '不可用' flash at startup"
next_action: "Await human verification in packaged desktop client"

## Symptoms
expected: "Bottle 1.0 uses local Faster-Whisper recognition - no cloud error should appear"
actual: "After uploading material in bottle 1.0 mode, shows '云端识别当前不可用，请稍后重试'. Also: top-right model status shows 'unavailable' briefly on load before showing 'available'."
errors: ["云端识别当前不可用，请稍后重试", "unavailable"]
reproduction: "Windows desktop client → open app → bottle 1.0 model shows 'unavailable' briefly → then 'available'. Upload file → see '云端识别当前不可用' error"
started: "Unknown"
platform: Windows desktop client

## Eliminated
- hypothesis: "H1: Balanced mode error path"
  evidence: "submitBalanced is called when mode==='balanced', not when user selects Bottle 1.0 (faster-whisper-medium)"
  timestamp: 2026-03-27T15:05:00Z

## Evidence
- timestamp: 2026-03-27T15:00:00Z
  checked: "frontend/src/features/upload/asrStrategy.js getCloudFailureMessage (line 382-392)"
  found: "Early return: if normalizedServerStatus.reachable===false && reason, returns reason ('Connection refused') INSTEAD of using API error data"
  implication: "When cloud is unreachable, the actual API error (401/403) is IGNORED and connection error is shown"

- timestamp: 2026-03-27T15:05:00Z
  checked: "desktop-client/electron/main.mjs refreshServerStatus()"
  found: "When cloud base URL is empty, sets desktopServerStatus.reachable=false with reason='cloud_base_url_missing'"
  implication: "With empty cloud config, status shows unreachable"

- timestamp: 2026-03-27T15:07:00Z
  checked: "desktop-client/.cache/runtime-defaults.json"
  found: "File has proper content with cloud.appBaseUrl and cloud.apiBaseUrl set"
  implication: "runtime-defaults.json is configured (was empty in some previous session)"

- timestamp: 2026-03-27T15:08:00Z
  checked: "frontend/src/features/upload/UploadPanel.jsx submitDesktopLocalFast (line 4632+)"
  found: "Local ASR succeeds → cloud task creation via api() → on failure calls getCloudFailureMessage(data, desktopServerStatus)"
  implication: "Cloud task creation failure triggers getCloudFailureMessage with serverStatus"

- timestamp: 2026-03-27T15:09:00Z
  checked: "frontend/src/features/upload/UploadPanel.jsx state initialization (line 1700-1701)"
  found: "desktopServerStatus defaults to reachable:true BUT desktopHelperStatus defaults to {healthy:false, modelReady:false}"
  implication: "Helper status starts unhealthy, resolves to healthy asynchronously - causes brief 'unavailable' at startup"

- timestamp: 2026-03-27T15:10:00Z
  checked: "frontend/src/shared/api/client.js api() function"
  found: "api uses runDesktopBridgeRequest which calls window.desktopRuntime.requestCloudApi. In runFetch, if no baseUrl and hasDesktopRuntime(), throws buildDesktopApiBaseUrlMissingError()"
  implication: "The Error thrown has a specific message, but getCloudFailureMessage's early return ignores it and shows 'Connection refused' instead"

- timestamp: 2026-03-27T15:50:00Z
  checked: "Frontend build"
  found: "npm run build succeeded with exit code 0"
  implication: "Code changes compile correctly"

## Root Cause Summary

### Root Cause 1: Upload Error "云端识别当前不可用"
**Location:** `frontend/src/features/upload/UploadPanel.jsx`, `getCloudFailureMessage` function

**Mechanism:**
1. User uploads file → `submitDesktopLocalFast` does local ASR
2. Local ASR succeeds → creates cloud task via `api('/api/lessons/tasks/local-asr')`
3. Cloud task creation fails (e.g., 401/403/500)
4. `getCloudFailureMessage(data, desktopServerStatus, "创建识别任务失败")` is called
5. If `desktopServerStatus.reachable === false` (cloud unreachable for any reason):
   - Line 385-386: Early return `return reason || fallback` fires
   - The real API error data (`data`) is IGNORED
   - Only `desktopServerStatus.reason` (e.g., "Connection refused", "cloud_base_url_missing") is shown
   - This produces the wrong message for the user

### Root Cause 2: Model Status "unavailable" at Startup
**Location:** `frontend/src/features/upload/UploadPanel.jsx`, state initialization

**Mechanism:**
1. Component mounts → `desktopHelperStatus` initialized as `{ healthy: false, modelReady: false }`
2. `resolveAsrStrategy` is called → sees unhealthy helper → returns degraded cloud strategy
3. UI shows "unavailable" or "本机运行环境异常" banner
4. `refreshDesktopDiagnostics()` completes asynchronously → updates to healthy
5. UI updates to "available"

## Resolution
root_cause: "Two issues: (1) getCloudFailureMessage early-return masks real API errors when serverStatus.reachable===false; (2) desktopHelperStatus starts as unhealthy before async refresh completes, causing brief 'unavailable' display."
fix: |
  Fix 1 (frontend/src/features/upload/UploadPanel.jsx):
  - Modified getCloudFailureMessage to check if API error data exists before falling back to connection error
  - Added: const hasApiErrorData = errorLike && (typeof errorLike === "object" ? Object.keys(errorLike).length > 0 : String(errorLike).trim().length > 0);
  - Changed early return from: if (normalizedServerStatus.reachable === false && reason)
  - To: if (normalizedServerStatus.reachable === false && reason && !hasApiErrorData)

  Fix 2 (frontend/src/features/upload/UploadPanel.jsx):
  - Changed desktopHelperStatus default from {healthy: false, modelReady: false} to null
  - Added desktopBundleLoading state to track when bundle status is being fetched
  - Updated fetchDesktopBundleStatus to set loading state
  - Changed startup fetch calls from silent:true to silent:false to trigger loading state
  - Updated model card badge to show "检查中" (checking) with blue styling during loading
  - Added "检查中" (checking) state to getDesktopHelperDiagnostic when runtimeInfo is null
verification: "Frontend build passed. Awaiting packaged desktop client test."
files_changed:
  - "frontend/src/features/upload/UploadPanel.jsx"
