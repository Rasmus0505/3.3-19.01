# Phase 10: 管理台前后端收口 - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

重构管理台信息架构和接口展示语义，统一中文表达、元优先金额语义，以及 `Bottle 1.0 / Bottle 2.0` 的主命名层级。这个阶段覆盖运营侧导航收口、旧深链兼容、金额展示语义、模型主次命名，以及“安全中心并入排障中心”的后台收口；不改变底层存储语义，不新增运行时调优能力，也不改动用户侧产品边界。

本阶段以 `.planning/workstreams/milestone/ROADMAP.md` 的 Phase 10 为 scope anchor。虽然 `.planning/workstreams/milestone/REQUIREMENTS.md` 的追踪表仍把 `ADM-*` 挂在 Phase 11，但 Phase 10 规划和实现应以 roadmap 的管理台收口范围为准。

</domain>

<decisions>
## Implementation Decisions

### 中文优先表面与深链兼容
- **D-01:** 管理台对运营人员可见的导航、标题、按钮、字段标签和说明文案保持中文优先。
- **D-02:** 本阶段不强行把后台 URL、query 参数或深链语义整体中文化；现有英文路由和旧深链继续兼容。
- **D-03:** “中文优先”在本阶段指运营可见表面和信息架构中文化，而不是替换 `/admin/...`、`tab`、`panel` 这类现有兼容契约。

### 顶层信息架构
- **D-04:** 管理台一级入口从当前四项收口为三项，把“安全中心”并入“排障中心”，不再长期保留独立一级导航。
- **D-05:** 一级结构继续保持“用户运营 / 活动兑换 / 排障中心”三条主线，其中用户运营承担业务日常入口，排障中心承担诊断、安全状态和高权限维护入口。
- **D-06:** 旧的 `/admin/security` 入口和相关深链必须继续可访问，但应归入排障中心语义下，而不是维持独立顶层信息架构。

### 金额与计费语义
- **D-07:** 管理台金额展示采用“元优先”。
- **D-08:** 当页面确实需要保留技术上下文时，可以用更次级的小字或说明补充 `points / cents / token` 等技术值，但不能抢占主金额语义。
- **D-09:** 本阶段只统一展示和编辑语义，不改动余额、费率、兑换面额等底层存储或兼容字段设计。

### Bottle 命名层级
- **D-10:** 用户侧页面继续只显示 `Bottle 1.0 / Bottle 2.0` 这套产品名，不向用户重新暴露技术模型名。
- **D-11:** 管理台中模型主标题也使用 `Bottle 1.0 / Bottle 2.0`；技术模型名可以保留，但放在模型主名下方作为次级说明。
- **D-12:** 技术名不应继续与 Bottle 名并列争抢主标题位置；它们只用于排障、计费、接口对照等后台需要技术上下文的场景。

### the agent's Discretion
- 排障中心内“安全 / 系统 / 任务 / 审计”各层级的具体中文命名和排序。
- 哪些页面必须保留技术名次级说明，哪些页面可以完全省略技术名。
- “元优先 + 技术值次级补充”的具体组件样式和信息密度。
- 旧 `/admin/security`、`/admin/health` 等入口并入排障中心时的 redirect 和 alias 细节。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 里程碑合同与 Phase 10 范围
- `.planning/PROJECT.md` - v2.1 的产品边界、运营后台方向、中文优先和元优先约束
- `.planning/workstreams/milestone/ROADMAP.md` - Phase 10 的目标与四条计划项，是本阶段的主 scope anchor
- `.planning/workstreams/milestone/REQUIREMENTS.md` - `ADM-01` 到 `ADM-04` 的需求合同，以及当前 traceability 的阶段挂载现状
- `.planning/workstreams/milestone/STATE.md` - 当前里程碑推进状态，确认 Phase 10 承接 Phase 9/10 前序工作

### 先前阶段已锁定的约束
- `.planning/workstreams/milestone/phases/05-billing-and-admin-alignment/05-CONTEXT.md` - 用户优先、排障分离、计费只改价格不暴露运行时调优
- `.planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-CONTEXT.md` - `Bottle 1.0 / Bottle 2.0` 主命名与产品语言合同
- `.planning/workstreams/milestone/phases/09-wordbook-account-and-web-bottle-boundary/09-CONTEXT.md` - 用户侧只保留 Bottle 命名、旧技术词不回到用户表面

### 代码库约定与结构
- `.planning/codebase/CONVENTIONS.md` - brownfield 前后端分层、共享前端与命名约定
- `.planning/codebase/STRUCTURE.md` - `frontend/src/features/admin-*`、`app/api/routers/admin*` 的结构地图
- `.planning/codebase/STACK.md` - React/Vite + FastAPI 栈约束，以及网页静态产物同步背景

### 当前管理台前端收口入口
- `frontend/src/AdminApp.jsx` - 当前一级路由、旧深链跳转和顶层入口归类
- `frontend/src/shared/lib/adminSearchParams.js` - 一级导航定义、路径映射和 query 参数兼容
- `frontend/src/features/admin-workspaces/AdminUsersWorkspace.jsx` - 用户优先业务工作台与 `rates` 子页挂载
- `frontend/src/features/admin-workspaces/AdminMonitoringWorkspace.jsx` - 排障中心现有 tab/panel 结构与深链模式
- `frontend/src/features/admin-pages/AdminRedeemPage.jsx` - 活动兑换独立 workspace 和跨 workspace 返回链路
- `frontend/src/features/admin-pages/AdminSecurityPage.jsx` - 当前独立安全中心，Phase 10 需要把它并入排障语义
- `frontend/src/features/admin-overview/AdminOverviewTab.jsx` - 总览卡片、金额指标和跳转入口
- `frontend/src/features/admin-system/AdminSystemTab.jsx` - Bottle 运行就绪度与系统检查展示
- `frontend/src/features/admin-rates/AdminRatesTab.jsx` - 元字段、技术单位、模型主次标题的主要编辑面
- `frontend/src/features/admin-users/AdminUsersTab.jsx` - 用户活跃、余额展示和调账输入体验
- `frontend/src/shared/lib/money.js` - 当前元/分格式化基础函数

### 当前管理台后端契约
- `app/api/routers/admin/router.py` - 管理台业务接口、计费、运行就绪度、用户与兑换 API
- `app/api/routers/admin/console.py` - 总览、任务失败、操作日志和用户活跃 API
- `app/api/serializers.py` - `display_name / model_name`、元字段与 legacy 字段的序列化层级

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/AdminApp.jsx` 与 `frontend/src/shared/lib/adminSearchParams.js`: 已经把顶层导航、旧路径跳转和 query 深链集中管理，适合做“三入口 + 旧深链兼容”收口。
- `frontend/src/features/admin-workspaces/AdminUsersWorkspace.jsx`: 已有“用户 + 钱包 + 计费”用户优先工作台，可继续作为业务主入口。
- `frontend/src/features/admin-workspaces/AdminMonitoringWorkspace.jsx`、`frontend/src/features/admin-overview/AdminOverviewTab.jsx`、`frontend/src/features/admin-system/AdminSystemTab.jsx`: 已具备排障中心骨架，适合吸收安全中心内容。
- `frontend/src/features/admin-pages/AdminSecurityPage.jsx`: 已经把数据库、权限、导出保护和媒体路径安全收成独立页面，便于并入排障中心而不是从零重做。
- `frontend/src/features/admin-rates/AdminRatesTab.jsx` 与 `frontend/src/shared/lib/money.js`: 已具备元格式化与价格编辑基础，但仍混有 token/points/cents 技术语义。
- `app/api/serializers.py`: 已支持 `display_name` 作为主展示名、`model_name` 作为技术标识，适合统一模型主次命名层级。

### Established Patterns
- 管理台已经形成“中文标签 + 英文路由/深链”的混合模式；本阶段更适合保留兼容路径而不是整体改 URL。
- 业务工作流与排障工作流在结构上已经分离，只是“安全中心”仍然单独悬挂在一级导航。
- 计费与余额底层同时保留 yuan 与 legacy cents/points 兼容字段；Phase 10 需要收口展示语义，而不是重写存储模型。
- 后台模型展示已存在 `display_name` + `model_name` 的双层信息，只需把 Bottle 名稳定提升为主标题、把技术名压到次级说明。

### Integration Points
- 在 `frontend/src/AdminApp.jsx`、`frontend/src/shared/lib/adminSearchParams.js` 和安全页入口上完成“三入口 + 安全并入排障”的导航收口。
- 在 `AdminOverviewTab`、`AdminUsersTab`、`AdminRedeemPage`、`AdminRatesTab`、`AdminSecurityPage` 等页面统一“元优先 + 技术值次级补充”的金额模式。
- 通过 `app/api/serializers.py`、`AdminRatesTab.jsx`、`AdminSystemTab.jsx` 等实现管理台中 `Bottle 名主显示 + 技术名次级说明` 的一致层级。
- 通过 redirect/alias 保留 `/admin/security`、`/admin/health` 和旧 query 面板深链，不打断现有排障和运营分享链接。

</code_context>

<specifics>
## Specific Ideas

- “保持中文”
- “页面内容全部中文，网址先不强行改中文，旧链接继续能用”
- “金额元优先，必要时小字补充技术值”
- “用户页面只显示模型名也即是 bottle”
- “管理台上方模型名下方技术名”
- 安全中心应并入排障中心，一级导航收口成三条主线
- 下游规划时要注意：Phase 10 以 roadmap 为准，不要被 requirements traceability 里仍写着 Phase 11 的旧挂载误导

</specifics>

<deferred>
## Deferred Ideas

- 全局数字输入框体验问题：当默认值是 `0` 时，当前输入体验不便于直接清空并从头输入，应作为单独的全局 UI 修复处理，而不是并入 Phase 10 的管理台收口实现范围。

</deferred>

---

*Phase: 10-admin-console-alignment*
*Context gathered: 2026-03-28*
