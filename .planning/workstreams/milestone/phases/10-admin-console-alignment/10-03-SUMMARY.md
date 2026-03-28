---
phase: 10-admin-console-alignment
plan: "03"
subsystem: fullstack
tags: [admin-model-labels, bottle-naming, serializer]
requires: []
provides:
  - Stable Bottle-first billing-rate labels
  - Bottle-primary admin pricing/runtime surfaces with technical secondary notes
affects: [api/admin-serializers, frontend/admin-rates, frontend/admin-system]
tech-stack:
  added: []
  patterns: [product-name-primary, technical-name-secondary]
key-files:
  created: []
  modified:
    - app/api/serializers.py
    - frontend/src/features/admin-rates/AdminRatesTab.jsx
    - frontend/src/features/admin-system/AdminSystemTab.jsx
    - tests/integration/test_admin_console_api.py
key-decisions:
  - "Bottle 1.0 / Bottle 2.0 成为后台价格与运行状态页面的主展示名。"
  - "技术模型名保留为次级说明，并继续作为更新接口的稳定键。"
requirements-completed: [ADM-02]
duration: 16 min
completed: 2026-03-29
---

# Phase 10 Plan 03 Summary

后台模型命名层级已经收口为 Bottle 名优先、技术名次级说明。

## Accomplishments

- 在序列化层为 `faster-whisper-medium` 和 `qwen3-asr-flash-filetrans` 增加 Bottle 主显示名兜底。
- 在计费页显式强调 `Bottle 1.0 / Bottle 2.0` 为主标题，并把技术模型名保持在次级位置。
- 在系统运行页补充技术标识展示，避免排障时丢失精确模型上下文。
- 新增 admin 集成断言，锁定 `billing-rates` 的主显示名契约。

## Verification

- `python -m pytest tests/integration/test_admin_console_api.py -q`
- `npm --prefix frontend run build`

