---
phase: 11-conversion-rollout-and-regression-closeout
plan: "01"
subsystem: frontend
tags: [upload-surface, conversion-copy, blocked-cta]
requires: []
provides:
  - Final Phase 11 upload model-card copy and layout
  - Exact blocked-state CTA wording for recharge and desktop guidance
affects: [frontend/upload-panel, frontend/upload-contracts]
tech-stack:
  added: []
  patterns: [context-locked-copy, user-facing-bottle-only]
key-files:
  created:
    - tests/contracts/test_phase11_surface_contract.py
  modified:
    - frontend/src/features/upload/UploadPanel.jsx
key-decisions:
  - "模型卡只按用户给定文案和布局实现，不额外加副标题。"
  - "复杂素材提示使用 `当前素材推荐使用客户端生成，效果和稳定性更好`，次按钮改为 `继续生成素材`。"
  - "余额不足继续用 `充值后生成`，并补上 `稍后再试` 次动作。"
requirements-completed: [GROW-01]
duration: 22 min
completed: 2026-03-29
---

# Phase 11 Plan 01 Summary

上传页的模型卡和受阻场景文案已经收口到 Phase 11 context 指定版本。

## Accomplishments

- 把上传页标题从“选择字幕生成方式”改成“选择学习素材质量”。
- 将 `Bottle 1.0 / Bottle 2.0` 两张模型卡改成用户指定的固定文案和布局，不再额外展示副标题段落。
- 收口余额不足、Bottle 1.0 网页不可执行、链接导入和复杂素材推荐的按钮词与提示语。
- 增加 contract test，锁住本阶段的上传页文案合同。

## Verification

- `python -m pytest tests/contracts/test_phase11_surface_contract.py -q`
- `npm --prefix frontend run build`
