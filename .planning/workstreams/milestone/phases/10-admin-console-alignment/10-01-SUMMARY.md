---
phase: 10-admin-console-alignment
plan: "01"
subsystem: frontend
tags: [admin-nav, deep-links, troubleshooting]
requires: []
provides:
  - Three-entry Chinese-first admin navigation
  - `/admin/security` compatibility under troubleshooting semantics
affects: [frontend/admin-shell, frontend/admin-nav]
tech-stack:
  added: []
  patterns: [compat-route-preservation, chinese-first-operator-nav]
key-files:
  created: []
  modified:
    - frontend/src/shared/lib/adminSearchParams.js
    - frontend/src/features/admin-workspaces/AdminMonitoringWorkspace.jsx
    - frontend/src/features/admin-pages/AdminSecurityPage.jsx
key-decisions:
  - "一级导航收口为 `用户运营 / 活动兑换 / 排障中心`，不再保留独立 `安全中心` 顶级入口。"
  - "旧 `/admin/security` 深链继续可访问，但统一归到排障中心语义下。"
requirements-completed: [ADM-03]
duration: 18 min
completed: 2026-03-29
---

# Phase 10 Plan 01 Summary

管理台顶层信息架构已收口为三条主线，并保留旧深链兼容。

## Accomplishments

- 删除独立 `安全中心` 一级导航项，统一由 `排障中心` 承接健康、失败、安全维护与操作审计。
- 保留 `/admin/security` 路由兼容，同时让页面表面语义明确归属于排障中心。
- 调整排障中心与安全页文案，消除独立顶级区域暗示。

## Verification

- `npm --prefix frontend run build`

