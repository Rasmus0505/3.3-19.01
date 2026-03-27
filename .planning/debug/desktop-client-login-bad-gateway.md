---
status: investigating
trigger: "桌面端使用的时候登陆页面提示 Bad Gateway"
created: 2026-03-27T10:00:00Z
updated: 2026-03-27T10:30:00Z
---

## Current Focus
hypothesis: "DESKTOP_CLOUD_API_BASE_URL not configured during packaging, causing empty API base URL in packaged desktop client, leading to HTTP 502 Bad Gateway when frontend tries to call cloud API"
test: "Check runtime-defaults.json in desktop-client/.cache/ for empty cloud config"
expecting: "If apiBaseUrl is empty string, desktop will make requests to invalid URL"
next_action: "Verify the runtime-defaults.json is empty, confirm fix approach"

## Symptoms
expected: "Login page should load normally, user can enter credentials and log in"
actual: "Login page displays 'Bad Gateway' error immediately upon opening"
errors: ["Bad Gateway"]
reproduction: "Opening desktop client (Electron app) → login page shows Bad Gateway"
started: "Unknown when it started, currently happening"

## Eliminated
- hypothesis: "Bad Gateway" string is hardcoded in frontend app code
  evidence: Search found only one reference in frontend/src/features/upload/asrStrategy.js for ASR error classification, not login page
  timestamp: 2026-03-27T10:15:00Z
- hypothesis: "Bad Gateway" comes from desktop local helper (run_desktop_backend.py)
  evidence: Local helper runs on port 18765 with routes /api/local-asr/* and /api/desktop-asr/* only. Login goes to /api/auth/login which is NOT a local helper route. Requests go to CLOUD_API_BASE_URL via IPC bridge.
  timestamp: 2026-03-27T10:20:00Z
- hypothesis: Error comes from the packaged Electron app's main process
  evidence: main.mjs properly handles empty URL with try/catch, throws descriptive error, doesn't produce "Bad Gateway"
  timestamp: 2026-03-27T10:25:00Z
- hypothesis: "Bad Gateway" is displayed by the login page during session restore
  evidence: AuthPanel calls restoreDesktopSession on mount. If restoreCachedAuthSession returns "anonymous" with empty message, no status message is shown. The error must come from a failed HTTP request.
  timestamp: 2026-03-27T10:30:00Z

## Evidence
- timestamp: 2026-03-27T10:05:00Z
  checked: "Bad Gateway" string search across entire codebase
  found: Only found in asrStrategy.js for ASR error classification, not in login flow
  implication: "Bad Gateway" is an HTTP response status (502), not an app error message

- timestamp: 2026-03-27T10:10:00Z
  checked: desktop-client/electron/main.mjs requestCloudApi function
  found: Uses runtimeCloudBaseUrl() which reads desktopRuntimeConfig.cloud.apiBaseUrl. Priority: DESKTOP_CLOUD_API_BASE_URL env > user desktop-runtime.json > runtime-defaults.json
  implication: If all three are empty/unset, apiBaseUrl will be empty string

- timestamp: 2026-03-27T10:15:00Z
  checked: desktop-client/electron/runtime-config.mjs
  found: resolveDesktopRuntimeConfig resolves cloudApiBaseUrl from env, stored config, or default config. If all empty, apiBaseUrl is empty string.
  implication: Empty apiBaseUrl causes requests to fail

- timestamp: 2026-03-27T10:20:00Z
  checked: desktop-client/scripts/write-runtime-defaults.mjs
  found: Reads DESKTOP_CLOUD_API_BASE_URL env var at PACKAGE TIME. If not set during packaging, runtime-defaults.json gets empty string for apiBaseUrl.
  implication: Packaged clients without DESKTOP_CLOUD_API_BASE_URL set during packaging will have empty defaults

- timestamp: 2026-03-27T10:25:00Z
  checked: desktop-client/.cache/runtime-defaults.json
  found: '{"schemaVersion":1,"cloud":{"appBaseUrl":"","apiBaseUrl":""},"clientUpdate":{"metadataUrl":"","entryUrl":"","checkOnLaunch":true}}'
  implication: CONFIRMED - apiBaseUrl is empty string in the runtime defaults

- timestamp: 2026-03-27T10:28:00Z
  checked: backend app/main.py auth router and nginx.conf.template
  found: Backend FastAPI auth endpoints (login, register, refresh) return proper JSON responses. Nginx proxy at admin-web/nginx.conf.template forwards /api/ to UPSTREAM_API_BASE_URL. If upstream is down or unreachable, nginx returns 502.
  implication: The 502 could come from nginx reverse proxy if backend is down, OR from frontend making requests to wrong/missing URL

- timestamp: 2026-03-27T10:30:00Z
  checked: frontend/src/app/authStorage.js and authSlice.ts
  found: restoreCachedAuthSession uses desktop bridge (if available). For desktop, it calls desktopRuntime.auth.restoreSession which goes through IPC to main.mjs. If session restore fails (network error), it returns "anonymous" or "expired" status.
  implication: Session restore failure alone shouldn't show "Bad Gateway" - that requires an actual HTTP request to fail with 502

## Resolution
root_cause: "DESKTOP_CLOUD_API_BASE_URL was not set during desktop client packaging, leaving runtime-defaults.json with empty cloud.apiBaseUrl. When the packaged desktop client launches without an existing desktop-runtime.json in AppData, requests to /api/auth/login go to an empty/invalid URL, producing HTTP 502 Bad Gateway."
fix: "Set DESKTOP_CLOUD_API_BASE_URL and DESKTOP_CLOUD_APP_URL before packaging. For development: set env vars before running npm script. For release packaging: set env vars before running npm run package:release."
verification: "Packaged desktop client login page loads without error, user can enter credentials and log in"
files_changed: []
