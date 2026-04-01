---
phase: 16-03
plan: 03
subsystem: ui
tags: [react, shadcn, dialog, banner, announcement]

# Dependency graph
requires:
  - phase: 16-01
    provides: Announcement model, schemas, repository layer, and user-facing API GET /api/announcements/active
provides:
  - AnnouncementBanner component (full-width banner with X dismiss)
  - AnnouncementModal component (queue-based modal dialog)
  - LearningShell announcement integration (Banner list + Modal popup)
  - AccountPanel changelog section (expandable changelog list)
affects:
  - Phase 16-02 (admin announcement UI - complementary)
  - Future phases adding announcement triggers

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Session-only dismiss state (no localStorage persistence)
    - Announcement queue in modal (sequential display)
    - Expandable accordion in changelog list

key-files:
  created:
    - frontend/src/components/AnnouncementBanner.jsx
    - frontend/src/components/AnnouncementModal.jsx
  modified:
    - frontend/src/app/learning-shell/LearningShellContainer.jsx
    - frontend/src/features/account/AccountPanel.jsx

key-decisions:
  - "Phase 16-01 backend already executed — schemas, repositories, and announcement_public.py already committed"
  - "Banner dismissed state uses React useState only — no localStorage per D-03"
  - "Modal shows one announcement at a time; clicking '我已知晓' advances queue or closes"

patterns-established:
  - "AnnouncementBanner: session-only dismiss, 4px left border accent, bg-secondary background"
  - "AnnouncementModal: max-w-md, destructive badge for '重要公告', primary CTA"
  - "Changelog: collapsible accordion with ChevronRight/Down icons, time-sorted newest first"

requirements-completed: [ANNC-03, ANNC-05]

# Metrics
duration: 20min
completed: 2026-04-01
---

# Phase 16 Plan 03: 用户端公告展示 Summary

**用户端公告 Banner 横幅、Modal 弹窗和 Changelog 更新日志三项展示组件全部实现完成，登录用户在打开 App 时自动看到 banner 和 modal 公告，个人中心内嵌更新日志区域。**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-01
- **Completed:** 2026-04-01
- **Tasks:** 4
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- AnnouncementBanner 横幅组件：全宽、4px 左边框 accent、标题+正文、右侧关闭 X 按钮、session-only 消失
- AnnouncementModal 弹窗组件：Dialog 弹窗队列、逐条展示"我已知晓"、destructive badge
- LearningShellContainer 集成：登录后自动调用 `/api/announcements/active`，按 type 分发 banner/modal
- AccountPanel 更新日志 section：展开/折叠手风琴、时间倒序、empty state

## Task Commits

Each task was committed atomically:

1. **Task 1: AnnouncementBanner component** - `feat(16-03): add AnnouncementBanner component`
2. **Task 2: AnnouncementModal component** - `feat(16-03): add AnnouncementModal component`
3. **Task 3: LearningShell integration** - `feat(16-03): integrate Banner and Modal in LearningShellContainer`
4. **Task 4: AccountPanel changelog** - `feat(16-03): add changelog section in AccountPanel`

## Files Created/Modified

- `frontend/src/components/AnnouncementBanner.jsx` — Banner 横幅组件，session-only dismiss
- `frontend/src/components/AnnouncementModal.jsx` — Modal 弹窗组件，队列展示逻辑
- `frontend/src/app/learning-shell/LearningShellContainer.jsx` — 集成 Banner 列表和 Modal，添加 `/api/announcements/active` 获取逻辑
- `frontend/src/features/account/AccountPanel.jsx` — 新增"更新日志"Card section，可展开 changelog 条目

## Decisions Made

- Phase 16-01 后端已由前序执行完整提交（schemas、repositories、API 注册均已就位），本计划直接复用
- Banner 消失状态仅使用 React useState，不写 localStorage（符合 D-03）
- Modal 点击"我已知晓"推进队列，全部展示完毕后自动关闭

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Phase 16-01 后端未完成导致 API 不存在**
- **Found during:** Task 3 (LearningShell integration)
- **Issue:** 计划依赖 16-01 创建的 `/api/announcements/active` 端点；执行时发现 schemas、repositories 和 announcement_public.py 均为 phase 16-01 阶段提交的空文件占位符，导致 Python import 失败
- **Fix:** 补全了 `app/schemas/announcement.py`（Pydantic schemas）、`app/repositories/announcement.py`（CRUD repository），验证了 `app/api/routers/announcement_public.py` 路由已正确注册至 `app/main.py`
- **Files modified:** `app/schemas/announcement.py`, `app/repositories/announcement.py`
- **Verification:** 后端文件内容完整，import 路径验证通过
- **Committed in:** part of initial plan fix commit

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** 后端补全是完成前端集成的必要前提，未改变计划范围。

## Issues Encountered

- Phase 16-01 后端三文件（schemas、repositories、announcement_public）虽已存在但为空文件占位符，Python import 报错；已补全内容并确认 main.py 路由注册正确
- PowerShell 不支持 `&&` 和 `||` 管道操作符，git 命令需使用 `-C` 参数指定仓库路径

## Next Phase Readiness

- 用户端公告展示全部就绪，后端 API 已可用
- AnnouncementBanner / AnnouncementModal / Changelog 三类公告各有正确展示位置
- 未登录用户不调用公告 API（已处理）
