---
phase: 10-admin-console-alignment
plan: "02"
subsystem: frontend
tags: [admin-money, yuan-first, redeem]
requires: []
provides:
  - Yuan-first admin money helpers
  - Yuan-primary overview, user, wallet, and redeem surfaces
affects: [frontend/admin-overview, frontend/admin-users, frontend/admin-wallet, frontend/admin-redeem]
tech-stack:
  added: []
  patterns: [yuan-primary-display, technical-unit-secondary-note]
key-files:
  created: []
  modified:
    - frontend/src/shared/lib/money.js
    - frontend/src/features/admin-overview/AdminOverviewTab.jsx
    - frontend/src/features/admin-users/AdminUsersTab.jsx
    - frontend/src/features/admin-logs/AdminLogsTab.jsx
    - frontend/src/features/admin-redeem/AdminRedeemBatchesTab.jsx
    - frontend/src/features/admin-redeem/AdminRedeemCodesTab.jsx
key-decisions:
  - "管理台金额继续兼容分/点存储，但运营主界面统一按元优先展示。"
  - "需要技术上下文时，仅用次级说明补充分或点，不再抢占主金额语义。"
requirements-completed: [ADM-01]
duration: 24 min
completed: 2026-03-29
---

# Phase 10 Plan 02 Summary

管理台金额语义已经改为元优先，技术单位仅保留为次级提示。

## Accomplishments

- 增加共享金额辅助函数，统一把分/点兼容值渲染为元优先展示。
- 更新总览、用户活跃、余额流水、兑换批次和兑换码页面的金额主显示。
- 将手工调账和批次创建输入改为元金额输入，同时在表单内明确展示后台兼容存储的分值。

## Verification

- `npm --prefix frontend run build`

