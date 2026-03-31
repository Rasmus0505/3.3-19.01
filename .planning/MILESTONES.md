# Milestones

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
