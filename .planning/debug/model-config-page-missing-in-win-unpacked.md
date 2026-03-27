---
status: awaiting_human_verify
trigger: "Investigate issue: model-config-page-missing-in-win-unpacked\n\n**Summary:** In `D:\\3.3-19.01\\desktop-client\\dist\\win-unpacked`, the backend/admin area no longer shows the model configuration page. User suspects it may be database-related."
created: 2026-03-27T00:00:00+08:00
updated: 2026-03-27T00:38:00+08:00
---

## Current Focus

hypothesis: The model configuration UI became unreachable because the current admin router removed the dedicated models route and nav entry, leaving only unrelated admin pages plus redirects back to health.
test: Verify the rebuilt `win-unpacked` app shows the restored models page in the real desktop admin workflow.
expecting: The backend/admin area should now expose a `模型配置` entry leading to the restored page, and legacy model-related links should resolve into it.
next_action: Ask the user to open the rebuilt `dist\win-unpacked` app and confirm the model configuration page is visible and usable.

## Symptoms

expected: The backend/admin UI should include the model configuration page and allow viewing/editing model settings.
actual: The model configuration page is missing in the packaged `dist\\win-unpacked` app.
errors: unknown; user did not report a specific error yet.
reproduction: Launch the packaged desktop app from `D:\\3.3-19.01\\desktop-client\\dist\\win-unpacked` and navigate to the backend/admin area; model configuration page is not present.
started: Reported on 2026-03-27. Prior working state is unknown.

## Eliminated

## Evidence

- timestamp: 2026-03-27T00:05:00+08:00
  checked: Project debug knowledge base
  found: `.planning/debug/knowledge-base.md` does not exist in `D:\3.3-19.01\desktop-client`
  implication: No prior resolved pattern is available; investigation must proceed from direct evidence.

- timestamp: 2026-03-27T00:10:00+08:00
  checked: `package.json`, `electron/main.mjs`, `electron/runtime-config.mjs`, `scripts/package-win.mjs`
  found: The Electron app loads `.cache/frontend-dist/index.html` into the renderer; `package:win` first runs `scripts/build.mjs`, then packages `.cache/frontend-dist/**/*` into the app.
  implication: The missing page originates in the bundled frontend artifact or its runtime configuration, not in Electron window code itself.

- timestamp: 2026-03-27T00:16:00+08:00
  checked: `frontend/src/pages/AdminPage.jsx`, `frontend/src/shared/lib/adminSearchParams.js`, frontend admin feature directories
  found: `ADMIN_NAV_ITEMS` only includes `health`, `security`, `users`, and `redeem`; no model-configuration item is registered, while admin feature modules such as `admin-sensevoice-settings` and `admin-subtitle-settings` still exist in source.
  implication: The packaged app is missing the page because the current frontend route/navigation configuration no longer exposes it, not because Electron packaging stripped the entire admin area.

- timestamp: 2026-03-27T00:22:00+08:00
  checked: `frontend/src/AdminApp.jsx`, `frontend/src/app/AdminShellStandalone.jsx`, `frontend/src/features/admin-workspaces/AdminPipelineWorkspace.jsx`
  found: `AdminApp` only routes `health`, `security`, `users`, and `redeem`; `/admin/rates` and `/admin/subtitle-settings` are redirected to `/admin/health`, and `/admin/models` is not routed at all even though `AdminPipelineWorkspace` still links to `/admin/models?tab=billing`.
  implication: Root cause is a frontend routing regression, not database state. Existing deep links to model configuration now land on a nonexistent route and fall back away from the intended page.

- timestamp: 2026-03-27T00:30:00+08:00
  checked: Frontend source patch
  found: Added `frontend/src/features/admin-pages/AdminModelsPage.jsx`, restored `/admin/models` in `frontend/src/AdminApp.jsx`, restored a `models` admin nav item in `frontend/src/shared/lib/adminSearchParams.js`, and redirected legacy `rates`/`subtitle-settings` paths into `/admin/models`.
  implication: The missing page now has a real routed entry point and is reachable from admin navigation plus old deep links.

- timestamp: 2026-03-27T00:38:00+08:00
  checked: `npm run package:win` in `D:\3.3-19.01\desktop-client` and bundle string search in `.cache/frontend-dist`, `frontend/dist`, and `dist\win-unpacked`
  found: Packaging succeeded and the rebuilt bundled frontend contains `/admin/models`, `模型配置`, `默认策略`, `计费配置`, and `Legacy ASR` strings inside the packaged `LearningShell-qRMd19Su.js` asset.
  implication: The fix is present in the rebuilt `win-unpacked` artifact, not just in source code.

## Eliminated

- hypothesis: The packaged Electron build removed the page because of database/runtime configuration in `win-unpacked`.
  evidence: The frontend source itself no longer exposes a models route/nav entry, and the packaged build is generated directly from that current source bundle.
  timestamp: 2026-03-27T00:22:00+08:00

## Resolution

root_cause: The frontend admin router and navigation no longer exposed a model configuration page. `AdminApp` removed any `/admin/models` route, `ADMIN_NAV_ITEMS` omitted a models entry, and legacy model-related paths were redirected to `/admin/health`, so the packaged Electron app could not show the page.
fix: Restored a supported `/admin/models` page in the frontend, backed by existing `AdminSubtitleSettingsTab`, `AdminRatesTab`, and legacy ASR notice components; added the models entry back into admin navigation; and redirected legacy `rates`/`subtitle-settings` paths to the new models page.
verification:
  - `npm run package:win` completed successfully in `D:\3.3-19.01\desktop-client`, rebuilding `dist\win-unpacked`.
  - Packaged frontend assets under `dist\win-unpacked\resources\app.asar.unpacked\.cache\frontend-dist` contain the restored `/admin/models` route and model-settings page strings.
files_changed:
  - D:/3.3-19.01/frontend/src/features/admin-pages/AdminModelsPage.jsx
  - D:/3.3-19.01/frontend/src/AdminApp.jsx
  - D:/3.3-19.01/frontend/src/shared/lib/adminSearchParams.js
