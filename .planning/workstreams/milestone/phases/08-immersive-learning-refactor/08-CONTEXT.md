# Phase 8: 沉浸学习重构 - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

把沉浸学习收口成稳定的播放/输入状态机，明确单句循环、固定倍速、句子推进、快捷键冲突、全屏和字幕遮挡板之间的状态合同，避免历史上“一个操作改坏另一个状态”的连锁问题。这个阶段聚焦沉浸学习本身，不扩展到生词本复习逻辑、SRS 设计或新的学习模式。

</domain>

<decisions>
## Implementation Decisions

### 句子停留与推进规则
- **D-01:** 关闭单句循环时，用户答对当前句后不立即跳句；应先完成当前句的既定播放流程，再把当前句完整回放 1 次，然后自动进入下一句。
- **D-02:** 开启单句循环时，当前句应持续循环播放并停留在本句，直到用户主动关闭循环，或手动触发上一句 / 下一句。
- **D-03:** 单句循环是跨课程、跨进入次数的全局记忆偏好；下次进入沉浸学习时沿用上一次的循环开关状态。

### 操作冲突优先级
- **D-04:** 用户在播放中或暂停中按上一句 / 下一句时，应硬中断当前播放、暂停、答后回放和循环状态，立即切到目标句，并自动播放目标句。
- **D-05:** 用户在播放中按揭示字母 / 揭示单词时，揭示应立即生效，但不得暂停、重启或改写当前音频播放。
- **D-06:** 点击“上一句”区域右侧唯一的喇叭按钮时，应硬中断当前句状态，完整播放上一句 1 次；播放结束后回到当前句待命，不自动恢复当前句播放或循环。

### 控制面与记忆范围
- **D-07:** 单句循环和倍速控件只需要在影院全屏的答题板块常驻可见；不必把这组控件扩展成一个单独的非全屏主交互面。
- **D-08:** 倍速只提供固定档位 `0.75x / 0.90x / 1.00x`。
- **D-09:** 倍速仅在当前一次沉浸学习会话内保持；退出沉浸学习后恢复默认 `1.00x`，但在同一次沉浸会话内切句、切全屏、开关遮挡板都不得重置当前倍速。

### 全屏、上一句与字幕遮挡板稳定性
- **D-10:** 进入 / 退出全屏、显示 / 隐藏上一句、开关字幕遮挡板、拖动字幕遮挡板位置，都只能改变显示层，不得重置当前句索引、当前输入内容、已揭示进度、循环开关、当前会话倍速或句子完成状态。
- **D-11:** “显示 / 隐藏上一句”是需要持久化的用户偏好，下次进入沉浸学习时沿用上一次的显示状态。
- **D-12:** 字幕遮挡板的开关状态和拖拽后的位置都需要持久化，下次进入沉浸学习时恢复。

### 上一句回听入口
- **D-13:** “上一句”区域的回听入口收口为右侧单个喇叭按钮，不再扩展为额外文案按钮或多组操作。

### the agent's Discretion
- 状态机 / reducer 的具体事件命名、内部切分方式，以及播放状态与输入状态的模块拆分边界。
- 全屏答题板块中循环与倍速控件的具体排版、图标、文案密度，只要保持“常驻可见且不干扰答题”。
- 上一句区域与喇叭按钮的视觉样式、hover/disabled 反馈，以及播放上一句时的提示方式。
- 非全屏 fallback 视图是否保留轻量状态提示，只要不把它做成新的主控件面板。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 里程碑合同与研究结论
- `.planning/PROJECT.md` — v2.1 的学习体验目标、沉浸学习稳定化方向和整体产品边界
- `.planning/workstreams/milestone/ROADMAP.md` — Phase 8 目标与四条计划项，定义本阶段只做状态机、循环、倍速和组合交互收口
- `.planning/workstreams/milestone/REQUIREMENTS.md` — Phase 8 对应需求 `IMM-01`、`IMM-02`、`IMM-03`、`IMM-04`、`IMM-05`
- `.planning/workstreams/milestone/STATE.md` — 当前里程碑推进状态，确认 Phase 8 是 Phase 7 之后的下一阶段
- `.planning/research/SUMMARY.md` — 已锁定“单句循环 + 固定倍速 + 解决 replay/pause/next/fullscreen/mask 冲突”的研究结论
- `.planning/research/STACK.md` — 明确建议用状态机 / reducer 风格重构沉浸学习，而不是继续叠加临时状态

### 上一阶段带来的延续约束
- `.planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-CONTEXT.md` — Phase 7 已锁定 Bottle 产品叙事与后续阶段的统一规范，本阶段只处理学习体验，不引入新的产品面扩张

### 代码基线与集成入口
- `.planning/codebase/CONVENTIONS.md` — 前端 feature 分层、共享状态和 brownfield 改造约定
- `.planning/codebase/STRUCTURE.md` — 前端 `features/immersive`、`app/learning-shell` 与整体仓库结构说明
- `.planning/codebase/STACK.md` — 当前 React/Vite + Electron 共享渲染层与构建约束
- `frontend/src/features/immersive/ImmersiveLessonPage.jsx` — 当前沉浸学习主实现，播放、输入、快捷键、全屏、遮挡板和句子推进状态集中在这里
- `frontend/src/features/immersive/useSentencePlayback.js` — 现有可复用的句子播放、暂停 / 继续、速率计划执行入口
- `frontend/src/features/immersive/learningSettings.js` — 快捷键、播放偏好、上一句显示偏好和字幕遮挡板持久化入口
- `frontend/src/app/learning-shell/LearningShellPanelContent.jsx` — 沉浸学习页的主挂载点
- `frontend/src/app/learning-shell/LearningShellContainer.jsx` — 沉浸学习进入 / 退出、进度同步与学习壳布局切换入口

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/features/immersive/useSentencePlayback.js`: 已把句子级播放、暂停 / 继续、速率计划执行和播放完成回调抽出来，适合作为状态机里的播放执行层，而不是重写底层媒体控制。
- `frontend/src/features/immersive/learningSettings.js`: 已有快捷键映射、`autoReplayAnsweredSentence`、上一句显示偏好和字幕遮挡板持久化能力，可直接承接新的会话 / 全局记忆规则。
- `frontend/src/features/immersive/ImmersiveLessonPage.jsx`: 已有上一句展示、回放辅助、字幕遮挡板几何计算、影院全屏处理、移动端键盘适配和输入态快照逻辑，说明 Phase 8 更适合收口状态合同，而不是删光重写。
- `frontend/src/app/learning-shell/LearningShellContainer.jsx`: 已负责沉浸模式开关、退出返回、课程详情加载和 `onProgressSynced`，是句子推进与壳层同步的现成接线点。

### Established Patterns
- 学习壳与沉浸页共享同一套 React 渲染层；网页端与桌面端不会分成两套独立沉浸学习实现。
- 学习偏好通过 `learningSettings` 的 localStorage + 自定义事件同步，适合继续挂载循环开关、上一句显示和遮挡板持久化。
- 当前沉浸页已经把播放、输入、推进、全屏、遮挡板、快捷键都堆在单组件内；本阶段的核心不是“再加状态”，而是把它们整理成明确的状态迁移规则。
- 当前实现会自动尝试进入影院全屏，所以用户主路径基本是全屏答题板块；非全屏更多是失败 / 退出后的 fallback，而不是单独的主要学习表面。

### Integration Points
- `frontend/src/features/immersive/ImmersiveLessonPage.jsx` 是 Phase 8 的主要重构面，尤其是 `phase`、播放回调、句子推进、全屏与遮挡板副作用。
- `frontend/src/features/immersive/useSentencePlayback.js` 需要与新的状态机事件对齐，确保“中断 / 回放 / 循环 / 暂停继续”的合同一致。
- `frontend/src/features/immersive/learningSettings.js` 需要新增或调整循环开关、倍速会话态与 UI 偏好的持久化边界。
- `frontend/src/app/learning-shell/LearningShellPanelContent.jsx` 和 `frontend/src/app/learning-shell/LearningShellContainer.jsx` 需要继续承接沉浸入口、退出与进度刷新，但不应重新吸收沉浸页内部状态。

</code_context>

<specifics>
## Specific Ideas

- 用户明确要求：“上一句”句子区域右侧只保留一个喇叭按钮，用它来听上一句。
- 用户的使用心智是“沉浸学习默认就是全屏答题板块”，因此循环和倍速控件只需要围绕全屏答题区设计，不需要额外打造一个常态非全屏控制面。
- 倍速退出沉浸学习后回到 `1.00x`，但在一次沉浸会话内不能因为切句、切全屏或开关遮挡板而丢失。
- 需要把“显示 / 隐藏上一句”和“字幕遮挡板开关 / 位置”当成稳定偏好，而不是临时 UI 状态。

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-immersive-learning-refactor*
*Context gathered: 2026-03-28*
