# Phase 35: Material Intake & Diagnostic Card - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

把当前阅读板块从“输入后立即黑盒 rewrite”升级为“先展示材料诊断台，再由用户确认生成”的前置阶段。该 phase 只定义材料进入阅读生成流程前的诊断、目标等级调节、确认入口和诊断结果续接，不负责后续分阶段生成 orchestration，也不负责阅读包资产页和学习接力。

</domain>

<decisions>
## Implementation Decisions

### Intake Flow
- **D-01:** 用户提交材料后，必须先进入独立的“材料诊断卡 / 诊断台”，而不是直接开始 rewrite 或生成。
- **D-02:** 当前 `ReadingPage` 的自动 rewrite 行为要被前置诊断确认替代。生成动作从诊断台触发，不再由输入提交自动触发。
- **D-03:** 诊断台是阅读生成流程的正式入口，不是临时弹窗或次级面板。

### Layout & Presentation
- **D-04:** 诊断台采用左右布局：左侧保留原文预览，右侧是诊断仪表板和操作区。
- **D-05:** 视觉方向偏比赛展示型“诊断仪表板 / 记分牌”，而不是简洁预检卡片。
- **D-06:** 首屏必须突出展示以下三类信息：材料难度 vs 用户当前等级 vs 建议目标等级；i+1 词 / 超纲表达 / 改写影响统计；可视化图表或分段条来增强展示感。

### Target Level Control
- **D-07:** 诊断台中的“建议目标等级”不仅展示，还允许用户在生成前手动修改。
- **D-08:** 目标等级可在 `A1-C2` 全量范围内切换，不限制在推荐等级上下 1 档。
- **D-09:** 系统仍然要给出推荐等级，用户手动改动属于覆盖推荐，而不是取消推荐机制。

### Resume & Persistence
- **D-10:** 已诊断但尚未生成完成的材料，用户重新打开时应直接回到上次诊断台继续，而不是回到可编辑输入态重新诊断。
- **D-11:** 对这类“已诊断未生成”材料，诊断台主按钮直接显示“继续生成”。
- **D-12:** 诊断摘要必须和草稿材料会话一起持久化，支持离开后返回继续。

### the agent's Discretion
- **D-13:** 比赛展示型图表的具体实现形式可由后续规划决定，只要满足“首屏可视化、可快速理解诊断结果”这一约束。
- **D-14:** 原文预览区是整段预览、摘要预览还是支持展开滚动，由后续规划结合现有阅读布局决定。
- **D-15:** 推荐等级解释文案的精确措辞和图表细节由后续阶段决定，但不能削弱诊断台的展示感和信息可读性。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Scope
- `.planning/ROADMAP.md` — Phase 35 的目标、成功标准，以及与 Phase 36 / 37 的边界
- `.planning/REQUIREMENTS.md` — `DIAG-01` 到 `DIAG-04` 的正式需求定义
- `.planning/PROJECT.md` — v2.8 产品叙事、OpenMAIC 参考边界、local-first 约束
- `.planning/STATE.md` — 当前 milestone 状态，以及 v2.8 已锁定的 narrative 决策

### Prior Reading Decisions
- `.planning/phases/24-cefr-infra/24-CONTEXT.md` — 用户 CEFR 等级来源、localStorage 持久化、词汇分析基础设施
- `.planning/phases/25-cefr-display/25-CONTEXT.md` — CEFR / i+1 / 超纲的展示语义与历史卡片分布条模式
- `.planning/phases/33-rewrite-ui-enhancement/33-CONTEXT.md` — 阅读模块现有 rewrite 展示契约，避免与新诊断流冲突

### Reading Workspace Code
- `frontend/src/features/reading/ReadingPage.jsx` — 当前阅读页入口、自动 rewrite 触发点、左右栏主布局
- `frontend/src/features/reading/LeftPanel.jsx` — 输入模式 / 阅读模式切换、`Unlock` 提交行为
- `frontend/src/features/reading/AnalysisPanel.jsx` — 现有右侧分析面板、难度分布条、词汇统计展示资产
- `frontend/src/features/reading/HistoryPanel.jsx` — 阅读历史、重开材料、顶部卡片入口
- `frontend/src/features/reading/ArticlePanel.jsx` — 原文渲染、CEFR 标注、rewrite 映射显示

### Persistence & CEFR Runtime
- `frontend/src/hooks/useReadingRewrite.js` — 当前 rewrite 状态机、token 估算、生成前后状态切换
- `frontend/src/features/reading/readingRewriteDB.js` — IndexedDB 中的 rewrite 持久化结构，Phase 35 续接逻辑需要基于此演进
- `frontend/src/app/authStorage.js` — 用户 CEFR 等级本地读取入口
- `frontend/src/utils/vocabAnalyzer.js` — 本地 CEFR 词汇分析能力，诊断卡统计应尽量复用

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ReadingPage.jsx` 已有左侧主内容 + 右侧分析栏 + 顶部历史记录的阅读布局，可作为诊断台容器基础。
- `AnalysisPanel.jsx` 已有 CEFR 分布条、等级标签、统计可视化入口，适合演进为比赛展示型诊断仪表板。
- `HistoryPanel.jsx` 已有本地历史记录重开能力，可扩展为“已诊断未生成”的回流入口。
- `useReadingRewrite.js` 已有 token 估算、目标等级计算、IndexedDB 读写和生成状态切换逻辑，可拆分出“诊断前”和“确认生成后”两个阶段。
- `readingRewriteDB.js` 已持久化 `originalText`、`validI1Words`、`validAboveI1Words`、`wordLevels`、`viewMode` 等字段，为诊断摘要落盘提供现成结构。
- `authStorage.js` 已有 `readCefrLevel()`，可直接作为诊断卡中的用户等级来源。
- `vocabAnalyzer.js` 与现有阅读富文本布局逻辑已能本地做 CEFR 词汇分析，符合 local-first 约束。

### Established Patterns
- 阅读模块当前是“输入材料 -> 立刻触发 rewrite -> 进入阅读态”的同步流，Phase 35 需要把它拆成“输入 -> 诊断 -> 确认生成”。
- 用户等级来源已经固定为前端本地读取 + 服务端持久化同步，不应在本 phase 重新设计等级来源。
- CEFR / i+1 / above-i+1 语义在前序 phase 已锁定，Phase 35 只能复用这些定义，不能改判定标准。
- 历史 / rewrite 相关数据优先存在 IndexedDB，本地恢复优先于服务端往返，符合现有阅读模块架构。

### Integration Points
- `ReadingPage.jsx` 的 `handleArticleSubmit` 是当前自动进入 rewrite 的关键入口，需要改成先产出诊断态。
- `HistoryPanel.jsx` 的选中历史材料逻辑需要支持“回到诊断台继续生成”的中间状态。
- `useReadingRewrite.js` 和 `readingRewriteDB.js` 之间的持久化契约需要扩展到“诊断摘要 / 诊断状态 / 目标等级选择”。
- `AnalysisPanel.jsx` 与 `ArticlePanel.jsx` 可以分别承接右侧诊断仪表板和左侧原文预览。

</code_context>

<specifics>
## Specific Ideas

- 诊断台应该有明显的“比赛展示”气质，而不是把现有分析面板稍微换个标题。
- 首屏信息重心不是词汇列表本身，而是“这篇材料对当前用户有多难、推荐生成到什么级别、生成后会改变多少”。
- 用户可以全量改目标等级，说明产品需要允许“偏保守生成”和“偏挑战生成”两种使用心智共存。
- 重新打开未完成材料时直接回到上次诊断台，这意味着诊断结果本身必须成为一个可恢复状态，而不只是一次性计算结果。

</specifics>

<deferred>
## Deferred Ideas

- 显式的分阶段生成流程、阶段进度、失败恢复文案属于 Phase 36，不在本 phase 内实现。
- 阅读包资产化、原文 / i+1 / 逐句对照视图属于 Phase 36。
- 词汇解释面板、学习接力、阅读包历史库属于 Phase 37。
- 多 target-level variants、题目生成、更多输入源扩展是后续 requirements，不在 Phase 35 内定义。

</deferred>

---

*Phase: 35-material-intake-diagnostic-card*
*Context gathered: 2026-04-10*
