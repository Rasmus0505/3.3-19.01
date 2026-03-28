---
created: 2026-03-28T15:28:18.091Z
title: Fix global numeric input clearing
area: ui
files:
  - frontend/src/shared/ui
  - frontend/src/features/admin-rates/AdminRatesTab.jsx
  - frontend/src/features/admin-users/AdminUsersTab.jsx
---

## Problem

多个数字输入框在默认值为 `0` 时，用户不能顺手把 `0` 清空后从头输入新值，往往只能先在 `0` 前面补数字再删掉旧值。这个交互在计费价格、余额调账等场景里非常别扭，也容易让输入过程出错。

## Solution

排查共享数字输入行为，保证默认 `0` 的输入框也能正常清空并直接重输，同时保留现有校验和提交时的数值规范化。优先覆盖计费配置、余额调账和其他复用同类输入模式的全局数值编辑场景。
