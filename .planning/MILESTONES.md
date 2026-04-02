# Milestones

## v2.2 桌面发布与体验收口 (Shipped: 2026-04-02)

**Phases completed:** 6 phases, 14 plans, 33 tasks

**Key accomplishments:**

- Phase 13: 桌面下载页改用 stable-only 渠道，关闭 preview.json，下载页 redirect 到飞计盘正式链接，建立完整的版本元数据合约
- Phase 14: 桌面程序增量更新产品化——版本检测、程序更新流程、ASR 模型 delta 更新、失败恢复全部完成并验证
- Phase 15: preload 暴露面审核完成（31 个方法全部有调用方），正式版 sandbox=true，openExternalUrl 白名单落地，运行时边界契约验证通过
- Phase 16: 管理台公告 CRUD API、公告类型（changelog/banner/modal）、置顶排序、公开端点全部实现并在 web/desktop 表面接入
- Phase 17: 生词本复习主流程重做——到期入口突出、记忆率显示、遗忘曲线间隔预览、复习间隔变化反馈、语境回看弹窗沉浸学习
- Phase 18: 生词本批量操作后端（批量删除/移动/翻译）、 TranslationDialog 局部翻译、TooltipHint 轻提示组件覆盖沉浸学习按钮

---

## v2.1 优化学习体验和管理体验 (Shipped: 2026-03-31)

**Phases completed:** 7 phases, 22 plans, 15 tasks

**Key accomplishments:**

- Official competitor matrix and Bottle positioning spec that lock the v2.1 naming, boundary, and monetization narrative
- Scenario-based CTA spec and reusable copy deck that fix Bottle web boundaries, recharge recovery, and admin/runtime naming
- 固定了 Memo 模式复刻的桌面工作流规范、支持承诺与内部诊断边界，为后续代码和测试收口提供单一来源。
- 把公开链接 promise、失败分流和产品介绍统一收口到了真实产品表面与 helper contract。
- 为 07.1 增加了可执行的自动化回归和手工发布检查，锁住公开链接 promise、runtime 边界和 canonical learning handoff。
- Reducer-driven immersive session state and shared controller helpers now coordinate sentence playback, answer completion, and navigation from one local contract
- Single-sentence loop and fixed 0.75x / 0.90x / 1.00x playback controls now persist and run directly inside the fullscreen immersive answer board
- Fullscreen, translation-mask, and previous-sentence controls now preserve the active immersive session while a single speaker button previews the previous sentence through the shared interrupt path
- Phase 08 now has dedicated immersive contract coverage, refreshed lesson-progress smoke assertions, and a synced `app/static` bundle containing the new loop, rate, and previous-sentence controls

---

## v2.1 优化学习体验和管理体验 (Shipped: 2026-03-31)

**Phases completed:** 7 phases, 21 plans, 13 tasks

**Key accomplishments:**

- Official competitor matrix and Bottle positioning spec that lock the v2.1 naming, boundary, and monetization narrative
- Scenario-based CTA spec and reusable copy deck that fix Bottle web boundaries, recharge recovery, and admin/runtime naming
- 固定了 Memo 模式复刻的桌面工作流规范、支持承诺与内部诊断边界，为后续代码和测试收口提供单一来源。
- 把公开链接 promise、失败分流和产品介绍统一收口到了真实产品表面与 helper contract。
- 为 07.1 增加了可执行的自动化回归和手工发布检查，锁住公开链接 promise、runtime 边界和 canonical learning handoff。
- Reducer-driven immersive session state and shared controller helpers now coordinate sentence playback, answer completion, and navigation from one local contract
- Single-sentence loop and fixed 0.75x / 0.90x / 1.00x playback controls now persist and run directly inside the fullscreen immersive answer board
- Fullscreen, translation-mask, and previous-sentence controls now preserve the active immersive session while a single speaker button previews the previous sentence through the shared interrupt path
- Phase 08 now has dedicated immersive contract coverage, refreshed lesson-progress smoke assertions, and a synced `app/static` bundle containing the new loop, rate, and previous-sentence controls

---

## v2.0 Billing, Admin & Polish (Shipped: 2026-03-28)

**Phases completed:** 5 phases, 13 plans, 28 tasks

**Key accomplishments:**

- Frontend-only cleanup of admin pages and billing entry points:
- Aligned local/cloud learner-facing lesson result metadata and removed duplicate task schema declarations so Phase 03 now has one canonical lesson/task contract to build on.
- Removed learner-facing source exposure from history cards and added lazy history-menu recovery actions for translation completion and manual lesson completion.
- Finished the shared generation-state cleanup by making upload success/degraded-success rendering use the canonical display snapshot and by adding regression coverage for partial-success task fields.
- Shipped the Phase 04 desktop link-import entry flow with explicit source tabs, yt-dlp-backed page-link ingestion, and contract coverage for noisy pasted links plus SnapAny fallback behavior.
- Completed the imported-link handoff by renaming imported lessons through the canonical lesson record and entering learning directly through the existing learning shell.

---
