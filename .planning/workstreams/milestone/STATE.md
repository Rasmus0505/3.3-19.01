---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: 桌面发布与体验收口
status: executing
last_updated: "2026-04-01T06:20:00.000Z"
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 6
  completed_plans: 4
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-31)

**Core value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.
**Current focus:** Phase 14 — 桌面程序与模型增量更新产品化

## Current Position

Milestone: v2.2
Phase: 14 (桌面程序与模型增量更新产品化) — EXECUTING
Plan: 3 of 3 (completed)
Status: Executing Phase 14 Plan 03 — COMPLETE
Completed: 14-01 (badge + banner), 14-02 (download orchestration + restart trigger), 14-03 (model delta update + asset boundary)
Next: Execute Phase 14 Plan 04

## Milestone Status

- Root `.planning/ROADMAP.md` / `.planning/REQUIREMENTS.md` / `.planning/STATE.md` are the authoritative v2.2 planning sources.
- Workstream phase artifacts for v2.2 currently live under `.planning/workstreams/milestone/phases/13-/` and `.planning/workstreams/milestone/phases/14-/`.
- Phase 13 context captured decisions:
  - 官网统一下载桌面版页面 + 同站点 release metadata
  - 正式版完整安装包
  - 正式安装器隐藏技术选项并默认完整安装
  - `stable` / `preview` 双 channel 分离
- Phase 13 execution produced:
  - `13-RESEARCH.md`, `13-VALIDATION.md`, `13-01/02/03-PLAN.md`
  - official release surface in `app/main.py`
  - `desktop-client/scripts/release-win.mjs`
  - installer default-complete-install contract
  - `13-RELEASE-CHECKLIST.md`
- Phase 14 context captured decisions:
  - 启动自动检查程序更新，同时保留手动刷新
  - 新版本采用非阻塞横幅 + 小红点提示，诊断面板保留详情
  - 程序更新健康路径为客户端内下载，下载后由用户决定何时重启安装
  - Bottle 1.0 模型增量更新写入 user-data，bundled 模型只作为只读基线
  - 失败恢复优先给普通用户可理解的动作，并补齐资产边界说明与发布检查清单
- Phase 14 execution progress:
  - 14-01: Complete (badgeVisible, acknowledge IPC, banner in UploadPanel)
  - 14-02: Complete (download orchestration, progress tracking, restart trigger)
  - 14-03: Complete (model delta update with progress, file count N/M, current filename, plain-language errors, retry UI, asset boundary contract SECU-03)

## Decisions

| Decision | Phase | Summary |
|----------|-------|---------|
| Bundled model is read-only baseline | 14-03 | Delta computation integrity |
| Model writes go to user-data only | 14-03 | Protects bundled assets |
| Error messages use plain-language categories | 14-03 | User-friendly recovery |

## Next Step

1. **规划 Phase 14 Plan 04** — 公告能力产品化
2. **手工验证 Phase 13 发布流程** — 按 `13-RELEASE-CHECKLIST.md` 验证 stable / preview / 签名 / 安装器体验
