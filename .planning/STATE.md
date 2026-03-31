---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: 优化学习体验和管理体验
status: milestone complete
last_updated: "2026-03-31T00:00:00+08:00"
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 21
  completed_plans: 21
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-31)

**Core value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.
**Current focus:** v2.1 — 优化学习体验和管理体验 — SHIPPED 2026-03-31

## Current Position

Milestone: v2.1 优化学习体验和管理体验
Status: ✅ Complete (shipped 2026-03-31)
All phases: 6 phases, 21 plans, 100%

**当前阶段：** v2.1 已完成，待规划 v2.2

## Accumulated Context

### Roadmap Evolution

- Phase 2.1 inserted after Phase 2: 删除管理台里的模型管理，拆出 Bottle 1.0 独立设置并接入计费配置，同时删除现有 Bottle 1.0 前端与实际功能代码，确保新增模型配置衔接完整 (URGENT)
- Phase 4.1 removed after roadmap cleanup: Bottle 1.0 desktop-local fidelity work no longer sits as a standalone roadmap phase
- v2.0 completed on 2026-03-28, leaving the product with a simpler pricing-only billing surface and a dedicated troubleshooting area
- Phase 7.1 inserted after Phase 7: Memo 模式复刻与桌面媒体工作流产品化
- v2.1 completed on 2026-03-31, delivering immersive learning refactor, wordbook review, username accounts, admin alignment, conversion copy, and desktop link-import bug fixes

### Working Assumptions

- 用户名是唯一身份标识，但不作为登录凭证
- 网页端可展示 Bottle 1.0 价值说明，但不能执行 Bottle 1.0
- 盈利改动只做按次付费增强，不引入会员制
- 管理台前后端一起收口，而不是只改几个页面文案
- Electron IPC 序列化不支持 Object.defineProperty 附加的属性，必须用普通数据字段

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260331-imu | 听写入口轻提示：仅保留快捷键行并置顶，增加首页修改说明，2秒自动消失 | 2026-03-31 | — | [260331-imu-2](./quick/260331-imu-2/) |
| 260331-kqa | 精听模式修复：Token 选词简化条件，播放速率固定状态在句间导航时正确处理 | 2026-03-31 | 7c89ee57 | [260331-kqa-token](./quick/260331-kqa-token/) |
| 260331-qnj | 允许沉浸式学习和管理台数字输入框清空后重输，并为倍速输入框增加0.25步进内嵌上下调节按钮 | 2026-03-31 | — | [260331-qnj-0-25](./quick/260331-qnj-0-25/) |

**Last activity:** 2026-03-31 — Completed quick task 260331-qnj: 允许沉浸式学习和管理台数字输入框清空后重输，并为倍速输入框增加0.25步进内嵌上下调节按钮

## Session Continuity

Previous milestone: v2.0 Billing, Admin & Polish (shipped 2026-03-28)
Current milestone: v2.1 优化学习体验和管理体验 (shipped 2026-03-31)
Next expected action: `/gsd-new-milestone` — start v2.2 planning
