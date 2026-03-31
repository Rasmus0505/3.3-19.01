---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: 桌面发布与体验收口
status: phase 13 executed pending release verification
last_updated: "2026-03-31T20:26:30.1948841+08:00"
last_activity: 2026-03-31
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
**Current focus:** v2.2 — Phase 13 executed, pending release verification

## Current Position

Milestone: v2.2
Phase: 13
Status: Phase 13 plans executed in code; manual release verification still required
Next: run `13-RELEASE-CHECKLIST.md` and verify signed stable release

## Milestone Status

- Root `.planning/ROADMAP.md` / `.planning/REQUIREMENTS.md` / `.planning/STATE.md` are the authoritative v2.2 planning sources.
- Workstream phase artifacts for v2.2 currently live under `.planning/workstreams/milestone/phases/13-/`.
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

## Next Step

**手工验证 Phase 13 发布流程** — 按 `.planning/workstreams/milestone/phases/13-/13-RELEASE-CHECKLIST.md` 验证 stable / preview / 签名 / 安装器体验
