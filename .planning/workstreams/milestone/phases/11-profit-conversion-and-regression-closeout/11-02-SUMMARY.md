---
phase: 11-conversion-rollout-and-regression-closeout
plan: "02"
subsystem: frontend
tags: [numeric-inputs, shared-ui, pricing]
requires: []
provides:
  - Shared number-input editing buffer
  - Natural clear-and-retype behavior for zero-valued money/quantity fields
affects: [frontend/shared-ui, frontend/admin-rates, frontend/admin-redeem]
tech-stack:
  added: []
  patterns: [focused-number-buffer, submit-time-normalization]
key-files:
  created: []
  modified:
    - frontend/src/components/ui/input.jsx
    - frontend/src/features/admin-rates/AdminRatesTab.jsx
    - frontend/src/features/admin-redeem/AdminRedeemBatchesTab.jsx
    - tests/contracts/test_phase11_surface_contract.py
key-decisions:
  - "数字输入框允许在 focused 状态下临时为空，再由 blur 或外部值同步。"
  - "价格与数量仍在提交时做数值归一化，不在编辑过程中强制跳回 0。"
requirements-completed: [GROW-01]
duration: 14 min
completed: 2026-03-29
---

# Phase 11 Plan 02 Summary

全局数字输入框在关键金额和数量场景里已经能先清空再重输，不会再因为默认值 `0` 抢回输入。

## Accomplishments

- 在共享 `Input` 组件里为 `type="number"` 增加 focused 编辑缓冲，允许临时空值。
- 移除价格 token 字段里的即时 `Number(... || 0)` 强制回写。
- 把兑换批次数量输入改成编辑态字符串，提交时再归一化成整数。
- 扩展 contract test，锁住 number 输入修复合同。

## Verification

- `python -m pytest tests/contracts/test_phase11_surface_contract.py -q`
- `npm --prefix frontend run build`
