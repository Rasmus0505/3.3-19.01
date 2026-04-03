# Phase 25: CEFR 沉浸式展示与历史徽章 - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

沉浸式学习页面实时展示词汇 CEFR 等级色块（当前句字母级下划线 + 上一句词块级色带），历史记录列表标注课程难度徽章，词选加入生词本提供流畅动画反馈。Phase 24 的词汇预处理基础设施（vocabAnalyzer、cefrLevel 状态、localStorage 缓存）是本 phase 的数据前提。

</domain>

<decisions>
## Implementation Decisions

### CEFR 视觉契约（统一色规）

**所有色规全局统一（当前句 + 上一句）：**
- **≤ i 水平**（已掌握）：无色块 / 无色下划线（当前句保持灰色默认下划线，上一句无色带）
- **i+1**（踮脚够得到）：绿色
- **> i+1**（太难）：红色

**两种句式的表现形式不同：**
- **当前句**（打字句）：每个单词下方有**字母级短下划线**，下划线颜色 = CEFR 等级。**不管用户有没有填到那个词**，下划线始终显示对应颜色。
- **上一句**（回顾句）：每个词块下方有**色带**（1-2px 横向条），色带颜色 = CEFR 等级。

**UI-SPEC 要求（CEFR-09）：** 具体渲染代码写之前，必须先通过 `/gsd-ui-phase 25` 生成 UI-SPEC.md 视觉契约，定义：badge 色值精确 hex/z-index/形状。

### 历史徽章数据存储（纯本地方案）

- CEFR 分析结果取自 `localStorage` 中的 `cefr_analysis_v1:{lessonId}` 缓存（Phase 24 基础设施）
- 打开历史列表时，从 `localStorage` 批量读取分析结果，计算 CEFR 分布，写入 `lessonCardMetaMap`
- 无服务端改动，纯前端实现
- 首次访问未分析课程：后台自动触发分析，显示 loading 条；后续体验与 Phase 24 toast 保持一致

**历史卡片 badge 样式：**
- 显示 CEFR **分布条**（类似横向彩色分段进度条，每段代表一个 CEFR 等级比例）
- 同时在卡片上放一个**代表性色块** + 占比文字（如 B1: 45%）
- 用蓝色/红色/灰色（或青色）对应 i+1/高难度/已掌握分段

### 词选动画反馈

- 点击"加入生词本"按钮 → 选中词块 **scale 1.0→1.08→回弹 1.0**（200ms ease-out）
- 同时：**绿色边框闪烁**（成功反馈），与 CEFR 色条（绿/红）明显区分
- scale 动画触发点是点击"加入生词本"按钮，不是选词瞬间

### 上一句交互状态叠加

上一句词块有以下状态，可组合叠加：
1. **普通态**：`bg-slate-100/80`，hover 变深
2. **选中态**：`bg-slate-200` + shadow-sm（词被选中准备入生词本）
3. **CEFR 色带**：词块底部色带（绿/红/无），渲染层级在灰色背景**上方**，不被覆盖
4. **加入成功**：scale 动画 + 绿色边框闪烁

状态 2 和 3 可共存（选中态 + CEFR 色带），无视觉冲突。

### Claude's Discretion

- 字母级短下划线的具体宽度/间距/padding，实现时参照现有 answer box 的下划线样式
- 历史卡片的 badge 具体位置（卡片底部/右上角）
- 绿色边框闪烁的持续时间（建议 300-400ms）
- `lessonCardMetaMap` 中存储 CEFR 分布数据的具体字段名
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 24 Context (prerequisite)
- `.planning/phases/24-cefr-infra/24-CONTEXT.md` — Phase 24 的所有决策，userCefrLevel 状态来源、localStorage 键、`VocabAnalyzer` API、AccountPanel CEFR 选择器均来自此

### Immersive Page (rendering location)
- `frontend/src/features/immersive/ImmersiveLessonPage.jsx` — 当前句 tokens（`currentSentenceTokens`）渲染于 answer box 输入框区域，上一句 tokens（`wordbookSentenceTokens`）渲染于 `immersive-previous-sentence` 区块（第 3880-3960 行）
- `frontend/src/features/immersive/immersive.css` — 沉浸式页面 CSS，CEFR badge/色带样式加在这里

### Wordbook Interaction
- `frontend/src/features/immersive/ImmersiveLessonPage.jsx` — `handleWordbookTokenPointerDown`、`collectWordbookEntry` 函数，选词 → 选中态 → 加入生词本流程（第 1777-1970 行）

### Lesson History
- `frontend/src/features/lessons/LessonList.jsx` — 历史课程列表，使用 `Card` 组件，CEFR badge 加在这里
- `frontend/src/store/slices/lessonSlice.ts` — `lessonCardMetaMap`，CEFR 分布数据存储位置

### State Management
- `frontend/src/store/slices/authSlice.ts` — `cefrLevel` 状态，`setCefrLevel` action，Phase 25 共用此状态
- `frontend/src/app/authStorage.js` — `readCefrLevel` / `writeCefrLevel`，本地 cefr 水平读写

### CEFR Infrastructure
- `app/frontend/src/utils/vocabAnalyzer.js` — `analyzeVideo()` / `analyzeSentence()` API，`checkFit()` 方法

### UI Spec (MUST generate before implementing)
- `.planning/phases/25-cefr-display/UI-SPEC.md` — CEFR 视觉契约，色值 hex、z-index、badge 形状，通过 `/gsd-ui-phase 25` 生成

</canonical_refs>

<codebase_context>
## Existing Code Insights

### Reusable Assets
- `VocabAnalyzer` — 已有 `analyzeVideo(sentences[], userLevel?)` 和 `checkFit(report, userLevel)` 方法，Phase 25 复用这些 API
- `authSlice.ts` — `cefrLevel` 已存在，Phase 25 直接 `useAppStore((s) => s.cefrLevel)` 读取
- `authStorage.js` — `readCefrLevel()` / `writeCefrLevel()` 已存在
- `lessonCardMetaMap` — `mergeLessonCardMeta(lessonId, patch)` 已存在，Phase 25 用来存 CEFR 分布

### Established Patterns
- Word token rendering: 上一句词块是 `<button>` 带 `data-wordbook-token-index` 属性（第 3898-3918 行）
- Answer box: 当前句 token 渲染为 `<input>`，每个 token 下有单字母级下划线（需确认具体实现）
- Toast 提示: 项目已有 `sonner` toast 系统（Phase 24 用 toast 报告分析完成）
- CSS animation: Tailwind `transition-transform` / `animate-` 系列

### Integration Points
- `ImmersiveLessonPage` — `currentSentenceTokens` 和 `previousSentenceTokens` 是 CEFR 渲染的主入口
- `LessonList.jsx` — `lessons[]` 数组渲染卡片，CEFR badge 加在 `Card` 内
- `localStorage` — `cefr_analysis_v1:{lessonId}` 缓存，历史列表读取的源数据
</codebase_context>

<specifics>
## Specific Ideas

### CEFR 颜色语义（统一）
- ≤ i 水平：无色（干净无变化）
- i+1：绿色（green）— 踮脚够得到
- > i+1：红色（red）— 太难
- SUPER 词：默认 SUPER 等级，显示红色色条

### 历史卡片 badge
- 横向彩色分段条 + 右上角色块 + 占比文字（如 "B1: 45%"）
- 首次未分析时显示 loading 条，后台自动触发分析

### 词选动画
- 触发点：点击"加入生词本"按钮
- 效果：scale 1.0→1.08→回弹 1.0（200ms ease-out） + 绿色边框闪烁
- 绿色边框 = 成功反馈，与 CEFR 绿/红色条区分开
</specifics>

<deferred>
## Deferred Ideas

None — all requirements (CEFR-05 through CEFR-11, CEFR-16 through CEFR-18) discussed and decided.

</deferred>

---

*Phase: 25-cefr-display*
*Context gathered: 2026-04-03*
