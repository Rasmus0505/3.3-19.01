---
status: investigating
trigger: "Investigate issue: admin-console-model-config-page-missing"
created: 2026-03-27T20:08:26.5028212+08:00
updated: 2026-03-27T20:10:55.0000000+08:00
---

## Current Focus

hypothesis: AdminModelsPage was intentionally removed and its remaining editable subset survives only as `AdminRatesTab`, but the current `AdminUsersPage` no longer mounts that tab, making the old route redirect to a non-equivalent page.
test: Compare deleted `AdminModelsPage` and current `AdminUsersPage`/`AdminRatesTab`, then inspect the removal commits for stated replacement path.
expecting: If this is a regression, the replacement commit chain will say rates moved into `/admin/users?tab=rates` while current `AdminUsersPage` no longer supports `tab=rates`.
next_action: inspect historical AdminModelsPage content and current admin page composition

## Symptoms

expected: 管理台里能看到或进入独立的“模型配置”页面。
actual: 现在管理台没有这个页面了。
errors: 未提供前端报错；从代码初查发现 `/admin/rates` 和 `/admin/subtitle-settings` 现在都重定向到 `/admin/users?tab=rates`。
reproduction: 打开管理台，查看导航和模型相关入口；访问旧地址 `/admin/rates` / `/admin/subtitle-settings`。
started: 用户当前在 2026-03-27 提问；git 历史显示 2026-03-27 有 `bcc44b12 feat(02.1): remove AdminModelsPage and faster-whisper-settings`，更早有 `4ad5b01a 管理台模型页收敛与去伪功能`、`77a6351b 管理台模型计费与参数页收敛`、`ae793e8f fix(02.1): finish admin billing cleanup frontend removal`。

## Eliminated

## Evidence

- timestamp: 2026-03-27T20:09:40.0000000+08:00
  checked: frontend/src/AdminApp.jsx
  found: `/admin/rates` and `/admin/subtitle-settings` are explicit redirects to `/admin/users?tab=rates`; there is no standalone models route.
  implication: The dedicated page is gone in current routing, but old links were expected to land on a replacement location.

- timestamp: 2026-03-27T20:09:40.0000000+08:00
  checked: frontend/src/shared/lib/adminSearchParams.js
  found: top-level admin nav keys only include `health`, `security`, `users`, and `redeem`; legacy `/admin/rates` resolves under `users`.
  implication: Product navigation intentionally stopped exposing a separate model/config page.

- timestamp: 2026-03-27T20:09:40.0000000+08:00
  checked: frontend/src/features/admin-workspaces/AdminUsersWorkspace.jsx and frontend/src/features/admin-workspaces/AdminBusinessWorkspace.jsx
  found: both workspaces still define a `rates` panel labeled `计费配置` using `AdminRatesTab`.
  implication: Some model-related configuration UI still exists, but only as an embedded panel/tab rather than a dedicated page.

- timestamp: 2026-03-27T20:10:10.0000000+08:00
  checked: frontend/src/features/admin-pages/AdminUsersPage.jsx
  found: current users page renders only `AdminUsersTab` and `AdminLogsTab`; it does not mount `AdminUsersWorkspace` or `AdminRatesTab`.
  implication: Redirecting `/admin/rates` to `/admin/users?tab=rates` currently drops the user onto a page that cannot render the intended replacement tab.

- timestamp: 2026-03-27T20:10:20.0000000+08:00
  checked: git history for frontend/src/features/admin-pages/AdminModelsPage.jsx and commits `4ad5b01a`, `77a6351b`, `bcc44b12`
  found: commit messages explicitly describe admin model page consolidation and final removal of `AdminModelsPage`, with stated replacement by other admin pages.
  implication: Removal was intentional, but the intended replacement path still needs verification against the live code.

## Resolution

root_cause:
fix:
verification:
files_changed: []
