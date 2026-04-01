---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: 桌面发布与体验收口
status: phase 14 context gathered; phase 13 release verification still pending
last_updated: "2026-04-01T00:00:00+08:00"
last_activity: 2026-04-01
progress:
  total_milestones: 4
  completed_milestones: 3
  total_phases: 16
  completed_phases: 15
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-31)

**Core value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.
**Current focus:** v2.2 — Phase 14 context gathered; Phase 13 release verification still pending

## Current Position

Milestone: v2.2
Phase: 14
Status: Phase 14 context gathered and ready for planning; Phase 13 manual release verification still required
Next: run `$gsd-plan-phase 14`, then continue `13-RELEASE-CHECKLIST.md` verification for the signed stable release

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

## Next Step

1. **计划 Phase 14** — 运行 `$gsd-plan-phase 14`，把更新入口、程序更新健康路径、模型增量更新和资产边界清单拆成执行计划。
2. **继续手工验证 Phase 13 发布流程** — 按 `.planning/workstreams/milestone/phases/13-/13-RELEASE-CHECKLIST.md` 验证 stable / preview / 签名 / 安装器体验
