# Phase 9: 生词本、账号与网页模型边界 - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

把生词本从“收词列表”升级为真正可进入的复习入口，并补齐用户名注册/修改、轻量个人中心，以及网页端 Bottle 1.0 / Bottle 2.0 的最终命名收口。这个阶段做的是“已有能力的行为和表面收口”，不是引入用户名登录、完整自定义 SRS 引擎、或重新定义 Bottle 1.0 的网页执行边界。

本阶段的账号范围以 `.planning/workstreams/milestone/ROADMAP.md` 为准：虽然 `REQUIREMENTS.md` 的追踪表仍把 `ACC-*` 挂在 Phase 10，但 Phase 9 规划和实现应把用户名注册、改名、当前用户读取与个人中心视为本阶段 scope。

</domain>

<decisions>
## Implementation Decisions

### 生词本入口与列表信息
- **D-01:** 生词本顶部必须提供独立的“开始复习”入口，显示当前到期数量，并进入专门复习流；不能只是在完整列表里加一个“仅看到期”筛选。
- **D-02:** 生词本列表默认主信息只展示：最新中英语境、下次复习时间、复习次数、记忆率百分比。
- **D-03:** 生词本列表默认不展示“单词 / 短语”标签。
- **D-04:** `source_count` 与 `wrong_count` 仍保留为可见数据，但降到次级信息，不占据默认主信息位。

### 复习反馈与调度
- **D-05:** Phase 9 不采用手写固定阶梯（如 `1 天 / 3 天 / 7 天`）作为主调度规则，而采用保守版动态复习调度：系统根据词条历史和当前记忆状态动态计算 `next_review_at`。
- **D-06:** 动态调度的默认目标记忆率为 **`0.85`**。
- **D-07:** 复习反馈使用四档中文按钮：**`重来 / 很吃力 / 想起来了 / 很轻松`**。
- **D-08:** 生词本的“掌握状态”默认不用“新收录 / 复习中”之类的文字标签，而是显示预测记忆率百分比；当词条预测记忆率达到或超过 `0.85` 时，才显示 **`已掌握`**。

### 用户名与个人中心
- **D-09:** 用户名是唯一身份标识，但不是登录凭证；它应允许比技术账号更自由的昵称风格，而不是只限英文下划线式用户名。
- **D-10:** 登录后必须提供单独的“个人中心”页面/路由，作为用户名查看/修改与轻量账户操作的承载面。
- **D-11:** 个人中心放在学习侧边栏最上方，优先于现有“历史记录 / 生词本 / 上传素材”等业务面板入口。
- **D-12:** 兑换码充值并入个人中心；现有独立的“兑换码充值”页面和侧边栏入口应删除。

### 登录 / 注册表面
- **D-13:** 登录 / 注册继续共用同一张认证卡片，但改成显式页签结构；注册页签额外展示用户名字段，登录页签仍只展示邮箱和密码。
- **D-14:** 为支撑个人中心与登录后状态恢复，后端必须提供“当前用户读取”能力，并把用户名纳入当前用户返回结构。

### 网页端 Bottle 命名边界
- **D-15:** Phase 9 收口网页端 Bottle 文案时，用户面前只保留 **`Bottle 1.0` / `Bottle 2.0`** 作为主命名。
- **D-16:** 用户明确要求进一步收紧 Phase 7 的允许范围：**`本机识别 / 云端识别` 不仅不能做主标题，也不要再作为副文案继续出现在用户可见表面。**
- **D-17:** Bottle 1.0 仍然保持“网页可解释、可引导下载桌面端、但不可执行”的边界；Phase 9 只收口实现和文案，不推翻 Phase 7 的 CTA 分流规则。

### the agent's Discretion
- 动态复习调度的具体实现形式（例如是否直接引入 FSRS 库、是否做本地参数封装、数据库字段切分方式），只要保持“保守动态调度 + `0.85` 目标记忆率”。
- 记忆率百分比的具体呈现方式（保留几位、小圆环/进度条/数字文案、与“已掌握”的切换动画）。
- 用户名的精确字符白名单、规范化策略和冲突文案，只要满足“唯一昵称标识、非登录凭证、不要收窄成技术账号风格”。
- 个人中心的页面排版，以及 `source_count` / `wrong_count` 在生词本卡片中的次级展示方式。
- Bottle 1.0 / 2.0 的补充说明文案，只要不再向用户暴露 `本机识别 / 云端识别` 旧词。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 里程碑合同与 Phase 9 范围
- `.planning/PROJECT.md` — v2.1 的学习体验、账号风险控制、网页/桌面分层、以及 Bottle 边界总合同
- `.planning/workstreams/milestone/ROADMAP.md` — Phase 9 的目标与四条计划项，尤其是 `09-01` 到 `09-04` 的 scope anchor
- `.planning/workstreams/milestone/REQUIREMENTS.md` — Phase 9 需要覆盖的 `WBK-*`，以及账号需求 `ACC-*` 的现有追踪现状
- `.planning/workstreams/milestone/STATE.md` — 当前里程碑推进状态，确认 Phase 9 承接 Phase 8 之后进入

### 先前阶段已锁定的约束
- `.planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-CONTEXT.md` — Bottle 1.0 / 2.0 定位、网页转化路径、以及网页边界的已锁定结论
- `.planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-WEB-CTA-SPEC.md` — 网页端不同场景下的主次 CTA 规则，确认 Bottle 1.0 不可网页执行
- `.planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-PRODUCT-POSITIONING-SPEC.md` — Bottle 主命名和旧词替换合同；Phase 9 在此基础上进一步移除旧词
- `.planning/workstreams/milestone/phases/08-immersive-learning-refactor/08-CONTEXT.md` — 沉浸学习的现有状态合同，说明生词收集仍从沉浸学习里发起，不在本阶段新增其他学习模式

### 生词本与复习基线代码
- `.planning/codebase/CONVENTIONS.md` — brownfield 前后端分层约定与共享状态约定
- `.planning/codebase/STRUCTURE.md` — `features/wordbook`、`features/immersive`、`app/api/routers`、`app/models` 的结构地图
- `.planning/codebase/STACK.md` — React/Vite + FastAPI 的现有栈约束
- `frontend/src/features/wordbook/WordbookPanel.jsx` — 当前生词本列表、过滤、状态切换和删除入口
- `frontend/src/features/immersive/ImmersiveLessonPage.jsx` — 当前沉浸学习里的收词触发入口和交互手势
- `app/api/routers/wordbook.py` — 生词本列表、收词、状态修改和删除接口
- `app/services/wordbook_service.py` — 当前生词本收词逻辑、词条状态和 payload 组装
- `app/repositories/wordbook.py` — 生词本列表查询、来源次数聚合和词条读取方式
- `app/models/lesson.py` — `WordbookEntry` / `WordbookEntrySource` 当前字段，确认已有语境与来源链路但尚无复习字段
- `app/schemas/wordbook.py` — 当前生词本响应结构，确认尚未暴露复习时间、复习次数、错题次数、记忆率

### 账号与个人中心基线代码
- `app/models/user.py` — 当前用户模型，确认尚未存在用户名字段
- `app/api/routers/auth.py` — 当前注册/登录/刷新/桌面登录接口，只支持邮箱密码
- `app/schemas/auth.py` — 当前认证请求/响应结构，不含用户名与当前用户扩展字段
- `app/api/serializers.py` — 当前 `UserResponse` 序列化逻辑
- `frontend/src/features/auth/shared/SharedAuthPanel.tsx` — 现有共享登录/注册卡片，需要改成页签式并支持注册用户名
- `frontend/src/features/auth/components/AuthPanel.jsx` — 当前学习壳认证接线点
- `frontend/src/store/slices/authSlice.ts` — 当前前端认证持久化只保存 `id/email/is_admin`
- `frontend/src/app/learning-shell/LearningShellPanelContent.jsx` — 认证卡片、Wordbook、Upload、Redeem 等面板挂载点
- `frontend/src/app/learning-shell/LearningShellSidebar.jsx` — 侧边栏顺序、个人中心插入点、以及现有 `兑换码充值` 导航入口

### 网页端 Bottle 命名与边界实现基线
- `frontend/src/features/upload/UploadPanel.jsx` — 当前仍残留 `本机识别 / 云端识别` 的模型卡标题与桌面端引导弹窗
- `frontend/src/shared/lib/asrModels.js` — 前端 Bottle 模型展示元数据
- `app/services/asr_model_registry.py` — 后端 Bottle 模型显示名和运行时元数据

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/features/immersive/ImmersiveLessonPage.jsx` 已经支持在沉浸学习中按单词/连续短语收词，并把刷新事件抛回生词本；Phase 9 可以直接在这个链路上补“收后复习”而不是重开新的收词入口。
- `app/services/wordbook_service.py`、`app/repositories/wordbook.py`、`app/models/lesson.py` 已经具备词条去重、最新语境更新、来源次数聚合和课程过滤能力，适合在现有 `WordbookEntry` 基础上追加复习字段与到期查询。
- `frontend/src/features/auth/shared/SharedAuthPanel.tsx` 已经把登录/注册共用卡片抽出来，适合演进成“登录 / 注册”页签，而不是重写一整套认证壳。
- `frontend/src/app/learning-shell/LearningShellSidebar.jsx` 与 `frontend/src/app/learning-shell/LearningShellPanelContent.jsx` 已经集中控制学习侧边栏和子面板，天然适合插入“个人中心”、删除独立充值入口。
- `frontend/src/features/upload/UploadPanel.jsx`、`frontend/src/shared/lib/asrModels.js`、`app/services/asr_model_registry.py` 已经是 Bottle 命名和 CTA 逻辑的主入口，Phase 9 只需继续做文本与可见表面收口。

### Established Patterns
- Web 和 desktop 共享同一套前端渲染层；Phase 9 的个人中心、生词本、Bottle 文案收口都应在共享前端里完成，而不是拆分两套实现。
- 当前前端认证持久化只保存 `id/email/is_admin`，这意味着一旦要在侧边栏或个人中心显示用户名，就必须同步扩充 `UserResponse`、本地 auth storage 和 `authSlice`。
- 当前生词本只有简单的 `active / mastered` 词条状态；Phase 9 需要在这条链路上升级成“动态复习 + 记忆率展示”，而不是另起一个完全独立的 SRS 子系统。
- Phase 7 已经把 Bottle 1.0 网页不可执行、Bottle 2.0 为网页默认路径、余额不足继续走充值恢复这些边界锁住；Phase 9 只处理实现收口和旧词移除。
- 凡涉及网页端前端行为或路由的改动，仍需遵守 `.planning/PROJECT.md` 里的交付约束：修改 `frontend/src` 后同步并验证 `app/static`。

### Integration Points
- 后端需要在 `app/models/user.py`、`app/schemas/auth.py`、`app/api/routers/auth.py`、`app/api/serializers.py` 上补用户名、当前用户读取和改名接口。
- 前端需要在 `SharedAuthPanel.tsx`、`AuthPanel.jsx`、`authSlice.ts`、`LearningShellSidebar.jsx`、`LearningShellPanelContent.jsx` 上接入注册用户名、个人中心和新的认证返回结构。
- 生词本复习需要在 `WordbookEntry` / `WordbookEntrySource` schema 基础上新增复习字段、到期查询接口、复习动作接口和列表/复习 UI。
- 网页端 Bottle 命名收口首先落在 `UploadPanel.jsx`，并向 `asrModels.js` 与 `asr_model_registry.py` 对齐，确保用户看不到旧词。

</code_context>

<specifics>
## Specific Ideas

- 用户明确要求生词本先学习现有成熟同类产品的复习模式，不接受拍脑袋固定阶梯；Phase 9 应做“保守版动态调度”，而不是自创一套 `1 天 / 3 天 / 7 天`。
- 复习方向参考了现代 SRS / FSRS 路线的公开资料，但本阶段不把算法细节暴露给用户，也不做高级参数配置界面；重点是先把“到期复习入口 + 动态 next_review_at + 记忆率展示”落地。
- 用户希望“掌握状态”更像概率而不是标签：默认显示一个记忆率百分比，例如 `56%`；直到达到 `0.85` 目标记忆率时才切成 `已掌握`。
- 用户明确要求复习反馈不能只有两档，最终按钮文案固定为：`重来 / 很吃力 / 想起来了 / 很轻松`。
- 用户名应是更接近昵称的唯一身份，而不是技术账号；是否允许中文、空格或部分符号可以由实现阶段收口，但不能退回到窄字符集账号思路。
- 个人中心要放在学习侧边栏最上方，并把“兑换码充值”并入其中，删除当前独立充值入口。
- 用户明确要求：网页端不要再向用户显示 `本机识别 / 云端识别`，即使作为副文案也不要保留；用户面对的命名只保留 `Bottle 1.0 / Bottle 2.0`。

</specifics>

<deferred>
## Deferred Ideas

- 用户名作为登录凭证：仍然属于未来项，不在 Phase 9 落地。
- 完整可调的高级 SRS / FSRS 参数界面、弱项专项训练、标签体系和多模式复习：超出 Phase 9 范围。
- 若后续需要把 `source_count`、`wrong_count` 提升为默认主信息，或提供用户可配置的信息密度，可在后续学习强化阶段再讨论。

</deferred>

---

*Phase: 09-wordbook-account-and-web-bottle-boundary*
*Context gathered: 2026-03-28*
