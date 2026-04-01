# Phase 16: 公告与更新日志系统 - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

在管理台建立一套面向 web/desktop 的统一公告系统，支持更新日志、横幅和弹窗。管理员可以创建、排序、置顶和删除公告，单条公告可配置为 changelog、banner 或 modal 展示方式，用户在对应表面只看到当前有效且匹配端能力的公告内容。

本阶段覆盖 ANNC-01 至 ANNC-05 的全部验收标准。不包含 ANNC-06（定时投放、人群定向）的实现。

</domain>

<decisions>
## Implementation Decisions

### 术语规范
- **D-01:** 所有运营文案采用中文术语：公告类型中文标注，界面文案中文，不出现 "changelog"、"banner"、"modal" 等英文词汇。

### Banner 类型行为
- **D-02:** Banner 在用户登录/打开 App 时自动弹出。
- **D-03:** Banner 需用户手动点击 X 按钮关闭；关闭后当前会话不再出现。
- **D-04:** 重要公告定义：服务器维护、系统故障、账号安全事件才使用 modal 弹窗，其余按 banner 或 changelog 处理。

### Modal 类型行为
- **D-05:** 所有标记为 modal 类型的公告都会弹出弹窗。

### Changelog 展示位置
- **D-06:** Changelog 类型公告展示在个人中心/设置页面内嵌区域，不占用独立路由。

### Admin 公告管理入口
- **D-07:** 在管理台新增独立的「公告管理」Tab 页面，运营人员可在此创建、编辑、删除和排序公告。

### 公告存储与权限
- **D-08:** 公告数据存于后端数据库（SQLite/PostgreSQL），支持跨设备同步和已读状态记录。
- **D-09:** 公告为登录用户专属内容，按 user_id 记录已读状态。

### 公告数据模型（最简版）
- **D-10:** 公告字段仅包含：标题（title）、内容（content，支持 Markdown）、类型（type: changelog / banner / modal）、状态（status: active / inactive）。
- **D-11:** 当前阶段不实现发布时间、结束时间、排序权重字段；ANNC-06 定时投放将来需迁移 schema。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 阶段目标与上游约束
- `.planning/PROJECT.md` - v2.2 目标、管理台中文优先原则
- `.planning/workstreams/milestone/REQUIREMENTS.md` - ANNC-01, ANNC-02, ANNC-03, ANNC-04, ANNC-05
- `.planning/workstreams/milestone/ROADMAP.md` - Phase 16 goal, success criteria, 16-01/02/03 plan split
- `.planning/workstreams/milestone/STATE.md` - Phase 16 context captured decisions

### Admin 管理后台现有结构
- `app/api/routers/admin/router.py` - admin 主路由基础结构
- `app/api/routers/admin/console.py` - admin console API 模式参考
- `frontend/src/features/admin-pages/AdminHealthPage.jsx` - admin tab 页面参考结构
- `frontend/src/features/admin-pages/AdminSecurityPage.jsx` - admin tab 页面参考结构
- `frontend/src/shared/components/AdminErrorNotice.jsx` - 现有 admin 通知组件参考

### 公告用户端现有展示基础
- `frontend/src/features/upload/UploadPanel.jsx` - 现有 banner/modal 展示模式参考（Phase 14 更新横幅）
- `frontend/src/features/upload/uploadStatusTheme.js` - 前端样式主题参考

### 数据模型与存储
- `app/database.py` 或 `app/models/` - 数据库模型定义位置（确认 SQLite 还是 PostgreSQL）
- `app/api/routers/` - API 路由组织方式

</canonical_refs>

<codebase>
## Existing Code Insights

### Reusable Assets
- `AdminHealthPage.jsx` / `AdminSecurityPage.jsx`: admin tab 页面结构，可参考新建公告管理 Tab
- `AdminErrorNotice.jsx`: admin 侧错误通知组件，可参考公告管理的反馈设计
- `UploadPanel.jsx` 中的 banner 样式: Phase 14 的更新横幅已有展示逻辑，可复用样式

### Established Patterns
- Admin API 集中在 `app/api/routers/admin/` 目录，新增 router 参考现有结构
- Admin 前端页面采用 tab 页签模式，新公告 Tab 遵循同一模式
- 个人中心在 `frontend/src/features/` 下，通过子路由或内嵌区域展示

### Integration Points
- 公告 API: 新增 `/api/admin/announcements/` 路由
- 用户端 banner/modal: 在 app layout 层或路由入口注入
- Changelog: 在个人中心页面内嵌展示区域

</codebase>

<specifics>
## Specific Ideas

- 用户明确表示运营人员看不懂英文，需要全中文界面。
- Banner 的「重要公告」仅限服务器维护/系统故障/账号安全三类。
- 公告系统是 Phase 16 的全部内容，ANNC-06 定时投放等将来再做。

</specifics>

<deferred>
## Deferred Ideas

- ANNC-06（定时投放、结束时间、排序权重、精细化人群定向）— 需要 schema 迁移，放在 Future Requirements
- 发音/音标可行性评估 — 归入 Phase 17/18 词本相关 deferred

</deferred>

---

*Phase: 16-announcement-system*
*Context gathered: 2026-04-01*
