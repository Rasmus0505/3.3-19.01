---
gsd_state_version: 1.0
milestone: v2.3
milestone_name: 学习体验与导入流程优化
status: verifying
last_updated: "2026-04-03T07:01:35.407Z"
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 14
  completed_plans: 15
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-02)

**Core value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.
**Current focus:** Phase 23 (字幕遮挡板与链接恢复) — COMPLETE

## Current Position

Milestone: v2.3
Phase: 23
Plan: 2 of 2 complete
Status: Phase complete — ready for verification

v2.3 started 2026-04-02:

- Phase 19: 沉浸式学习 Bug 修复 — completed
- Phase 20: 生词本词条增强 — completed
- Phase 21: 素材导入 UX 优化 — completed
- Phase 21.1: 后台管理用户运营优化 — INSERTED (URGENT)
- Phase 22: 字幕遮挡板与链接恢复 — COMPLETED (2026-04-03)
  - 22-01: 遮挡板居中 + 宽度自适应 ✅
  - 22-02: 链接恢复增强（MASK-04）✅

## Next Step

1. **Phase 21.1 — 后台管理用户运营优化** — `/gsd-plan-phase 21.1`

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
  - 14-01: Complete (badgeVisible, acknowledge IPC, banner in UploadPanel) ✅
  - 14-02: Complete (download orchestration, progress tracking, restart trigger) ✅
  - 14-03: Complete (model delta update with progress, file count N/M, current filename, plain-language errors, retry UI, asset boundary contract SECU-03) ✅
  - 14.1: Complete (gap closure: DESK-02 version card, auto-check default) ✅
  - 14.2: Complete (gap closure: contract tests DESK-02/03/04/05, optional chaining fix, baseline copy delegation) ✅
- Phase 15 context captured decisions:
  - 正式版强制开启 sandbox，开发模式保持关闭
  - openExternalUrl 改为白名单模式，当前包含 snapany.com + 官方下载域名
  - preload 暴露面审核纳入 Phase 15 交付，清理范围由审核决定
  - 正式版 webSecurity 边界加测试验证，结果记录到 15-VALIDATION.md

- Phase 16 context captured decisions:
  - **公告术语全中文化** — changelog / banner / modal 所有文案改为中文运营人员可理解的术语
  - **Banner 消失方式** — 手动关闭（X 按钮），关闭后当前会话不再出现
  - **"重要公告"定义** — 服务器维护 / 系统故障 / 账号安全等需即时知晓的事件
  - **Banner 触发** — 登录/打开 App 时自动弹出
  - **Modal 范围** — 所有标记为 modal 的公告都弹出
  - **Changelog 位置** — 个人中心/设置页面内嵌，不占独立路由
  - **Admin 入口** — 管理台新增独立「公告管理」Tab
  - **存储** — 后端数据库，登录用户专属，user_id 记录已读
  - **数据模型** — 最简版（title/content/type/status），ANNC-06 定时投放将来迁移
  - **16-01 完成** — 后端公告数据层与 API（Announcement 模型、Schema、Repository、Admin CRUD、Public 端点）
  - **16-02 完成** — AdminAnnouncementsPage + 后端 CRUD API 已交付
  - **16-03 完成** — 用户端公告展示（AnnouncementBanner + AnnouncementModal + AccountPanel Changelog section）

- Phase 18 context captured decisions:
  - **批量操作**: 使用混合模式（Checkbox + Shift 多选）
  - **顶部悬浮工具栏**: FloatingToolbar at viewport top
  - **局部翻译**: 调用翻译 API 重新获取，非查看已存储翻译
  - **轻提示组件**: 新建半透明悬浮样式组件
  - **轻提示触发**: Hover
  - **沉浸式学习按钮**: 都加上轻提示
  - **shadcn 风格收口**: 列表 + 复习视图
  - **局部翻译 API**: 使用 qwen-mt-flash 模型

- Phase 18 execution progress:
  - 18-01: Complete (batch API endpoints) ✅
  - 18-02: Complete (frontend batch selection + FloatingToolbar) ✅
  - 18-03: Complete (tooltip system enhancement) ✅
  - 18-04: Complete (translation dialog & local translation) ✅

## Decisions

| Decision | Phase | Summary |
|----------|-------|---------|
| Bundled model is read-only baseline | 14-03 | Delta computation integrity |
| Model writes go to user-data only | 14-03 | Protects bundled assets |
| Error messages use plain-language categories | 14-03 | User-friendly recovery |
| Export copyDirectory from model-updater.mjs | 14.2 | Reuse for baseline copy in main.mjs |
| Double optional chaining on desktopRuntime bridge | 14.2 | Prevents TypeError when bridge unavailable |
| Sandbox enabled in production builds | 15 | Defense-in-depth, no iframe usage |
| openExternalUrl uses whitelist | 15 | Only snapany.com + official domains allowed |
| Preload surface audited in Phase 15 | 15 | Historical methods reviewed for removal |
| webSecurity prod mode tested with validation doc | 15 | SECU-02 evidence |
| Announcement: Chinese terms only | 16 | Operator comprehension |
| Banner: auto-popup, manual X, session-only | 16 | Non-intrusive |
| Modal: all marked, no priority filter | 16 | Simpler logic |
| Changelog: in profile/settings, no route | 16 | Convenient |
| Admin: new Announcements tab | 16 | Clear entry |
| Announce DB: backend, login-required | 16 | Cross-device |
| Announce model: minimal | 16 | ANNC-06 later |
| Admin UI + API built in 16-02 | 16-02 | Backend-first approach |
| Announcement CRUD API: FastAPI + SQLAlchemy | 16-02 | API pattern matches existing admin routes |
| Announcement model: now_shanghai_naive for timestamps | 16-01 | Consistent with other models |
| Public /api/announcements/active is unauthenticated | 16-01 | Frontend controls login-gated visibility |
| Admin endpoints via admin.py include_router | 16-01 | Keeps admin routes centralized |
| Mask: horizontal center on new lessonId | 23-01 | buildDefaultTranslationMaskRect on lessonId change |
| Mask: width only expands upward within session | 23-01 | sessionMaxWidthRatioRef tracks max, only setState when larger |
| Mask: enabled state persists via localStorage | 23-01 | Verified — existing code already implements D-03 |
| Link restore: unified entry with source_url check | 23-02 | openRestorePicker checks lesson?.source_url |
| Link restore: cache check before yt-dlp trigger | 23-02 | hasLessonMedia(lesson.id) before download |

- [Phase ?]: D-01: 用户列表增加用户名列（User.username 字段）
- [Phase ?]: D-02: 用户列表增加注册时间列（User.created_at，北京时间格式化）

## Next Step

1. **Phase 23 — 字幕遮挡板与链接恢复** — completed 2026-04-03
   - MASK-01: 新视频遮挡板水平居中 + 宽度自适应 ✅
   - MASK-02: 遮挡板启用状态跨视频记忆 ✅
   - MASK-04: 链接恢复增强（弹窗 + yt-dlp）✅
