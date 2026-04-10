# Phase 36: Pipeline Orchestrator & Reading Pack - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

把阅读生成从“诊断后直接进入普通 rewrite 态”升级为“显式阶段生成 + 阅读包产物”。该 phase 负责阶段化生成展示、生成中断恢复、阅读包持久化，以及阅读包中的原文 / i+1 / 逐句对照三种阅读模式。它不负责词汇解释面板、收词接力、pack library 卡片化历史和后续学习动作，这些属于 Phase 37。

</domain>

<decisions>
## Implementation Decisions

### Generation Stage Experience
- **D-01:** 生成过程采用更强的“舞台式主视图”，而不是继续沿用当前普通阅读页骨架上叠一个弱覆盖层。
- **D-02:** 舞台式主视图必须显式展示以下命名阶段：`parsing`、`difficulty judgment`、`simplification planning`、`text rewriting`、`reading-pack assembly`。
- **D-03:** 生成中的主要视觉重心是“当前正在推进哪一个阶段、上一步完成了什么、下一步将产出什么”，而不是只显示一个通用 loading spinner。

### Reading Pack Surface
- **D-04:** 生成成功后进入独立的“阅读包资产页”结果态，而不是简单回到当前阅读工作台并把它当作普通 rewrite 结果。
- **D-05:** 阅读包页顶部需要有明确的 pack 头部，至少包含材料状态、目标等级、诊断摘要入口或概览，以及这是一个“已生成资产”而不是临时结果的信号。
- **D-06:** 阅读包是本 phase 的持久化单位，现有 `reading_rewrites_v3` 记录结构应向 reading pack 演进，而不是另起一套完全独立的结果模型。

### Compare Mode & Word-Level Explanation
- **D-07:** 阅读包内保留三种阅读模式：`original`、`i+1`、`sentence-by-sentence comparison`，以满足 Phase 36 的正式范围。
- **D-08:** `sentence-by-sentence comparison` 采用“句子卡片式”对照，而不是纯左右并排表格或简单上下堆叠。
- **D-09:** 逐句对照视图的用途是展示整句 before/after 变化，帮助用户理解系统整体保留了什么、改动了什么；它不是用来替代词级提示。
- **D-10:** 被改写后的词仍然保留 hover 查看原文的轻量交互，用于词级即时对照；句级对照与词级 hover 同时存在，不做二选一。

### Recovery & Failure Handling
- **D-11:** 交互原则优先级为“最少丢失上下文、最容易继续”，因此刷新或离开后应优先恢复到最近一次已持久化的阶段状态，而不是让用户回到空白输入态重来。
- **D-12:** 如果已有完成的 reading pack，重新打开材料时应直接进入对应阅读包，而不是重新播放整个生成流程。
- **D-13:** 如果生成在中途被打断，重新进入时应回到舞台式主视图，并明确显示最近完成到哪一阶段，同时提供“继续生成”入口。
- **D-14:** 如果某一阶段失败，界面必须说明失败发生在哪个阶段，并保留原文可读 / 可回退能力；失败不应让用户失去已完成的诊断和已保存的材料上下文。

### the agent's Discretion
- **D-15:** 舞台式主视图内部是横向 stage rail、卡片栈还是中心舞台 + 侧边阶段列表，可由后续规划根据现有布局成本决定，只要“阶段可见性”和“比赛展示感”不被削弱。
- **D-16:** 阅读包头部中诊断摘要是做成固定摘要条、折叠卡还是轻量信息区，可由后续规划决定。
- **D-17:** 中断恢复是自动续跑还是默认停在最近已完成阶段等待用户点击继续，可由后续规划按可靠性权衡，但不能让用户无感丢状态。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Scope
- `.planning/ROADMAP.md` — Phase 36 的目标、成功标准，以及与 Phase 35 / 37 的边界
- `.planning/REQUIREMENTS.md` — `PIPE-01` 到 `PIPE-03`、`PACK-01`、`PACK-02` 的正式需求定义
- `.planning/PROJECT.md` — v2.8 的比赛叙事、OpenMAIC 参考边界、local-first 约束
- `.planning/STATE.md` — 当前 milestone 叙事、reading pack 作为资产单位的已锁定方向

### Prior Reading Decisions
- `.planning/phases/35-material-intake-diagnostic-card/35-CONTEXT.md` — 诊断前置、目标等级调节、诊断快照持久化与恢复入口
- `.planning/phases/33-rewrite-ui-enhancement/33-CONTEXT.md` — rewrite highlight、tooltip 原词对照、原文/重写版切换的既有契约
- `.planning/phases/25-cefr-display/25-CONTEXT.md` — CEFR / i+1 / above-i+1 展示语义与历史条带展示模式
- `.planning/phases/24-cefr-infra/24-CONTEXT.md` — 用户 CEFR 等级来源与本地持久化边界

### Reading Runtime Code
- `frontend/src/features/reading/ReadingPage.jsx` — 当前诊断态、阅读态、历史回流和视图切换总入口
- `frontend/src/features/reading/DiagnosticPanel.jsx` — Phase 35 诊断台，可复用为 reading pack 头部的诊断摘要来源
- `frontend/src/features/reading/HistoryPanel.jsx` — 历史记录入口，已能识别“待生成 / 已生成”状态
- `frontend/src/features/reading/ArticlePanel.jsx` — 原文/重写版渲染、rewrite tooltip、词级高亮逻辑
- `frontend/src/features/reading/AnalysisPanel.jsx` — 当前词汇侧栏与 rewrite summary，便于判断本 phase 与 Phase 37 的边界
- `frontend/src/hooks/useReadingRewrite.js` — `diagnosticSnapshot`、`flowStatus`、重写执行和 IndexedDB 读写主状态机
- `frontend/src/features/reading/readingRewriteDB.js` — `reading_rewrites_v3` 持久化结构，Phase 36 要从此演进成 reading pack 记录
- `frontend/src/features/reading/readingDiagnostics.js` — 诊断快照结构、目标等级变更和统计派生逻辑
- `frontend/src/features/reading/api/readingRewriteApi.js` — 词形提取、token 估算、词汇简化 API 契约

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ReadingPage.jsx` 已经把阅读流程拆成 `input` / `diagnostic` / `reading` 三态，Phase 36 可在此基础上新增更明确的 pipeline / pack 结果态。
- `useReadingRewrite.js` 已有 `diagnosticSnapshot`、`flowStatus`、`rewrittenText`、`rewriteMappings` 的本地持久化能力，是 reading pack 状态机的直接演进点。
- `readingRewriteDB.js` 已把单篇材料的原文、重写结果、诊断快照、视图偏好绑定到同一条记录，适合扩展为 pack 级记录。
- `HistoryPanel.jsx` 已能根据 `diagnosticSnapshot` 和 `rewrittenText` 区分“待生成 / 已生成”，为 pack 恢复入口提供现成载体。
- `ArticlePanel.jsx` 已支持词级 rewrite tooltip 和原文 / 重写版渲染，可直接复用到 reading pack 内的 `original` 和 `i+1` 模式。

### Established Patterns
- 现有 reading 模块的数据主轴仍然是“以 articleId 为 key 的本地记录”，Phase 36 应继续遵守这一条，而不是引入脱节的新持久化主键模型。
- 原文和重写版视图已经有清晰的高亮契约，逐句对照视图需要复用这些 mapping 精度，而不是重做另一套不一致的标注规则。
- 历史 / 恢复路径优先走 IndexedDB 本地数据，不应把中断恢复依赖到服务端会话。
- 诊断阶段和生成阶段已经被拆成两个动作，Phase 36 只需要把中间过程显式化，而不是推翻 Phase 35 的入口设计。

### Integration Points
- `ReadingPage.jsx` 里的 `handleContinueGeneration` 是当前“诊断 -> 生成”的关键衔接点，需要升级为阶段式 orchestration 入口。
- `useReadingRewrite.js` 的 `flowStatus` 目前只有 `idle | diagnosed | generated`，Phase 36 需要把它扩展成可表达 stage 进度和恢复点的状态。
- `readingRewriteDB.js` 的 record 需要补足 reading pack 元数据、阶段恢复信息和 compare view 所需结构。
- `HistoryPanel.jsx` 需要继续承接“打开已完成 pack”与“恢复未完成 pipeline”两种入口，但真正的 pack library 卡片化增强留给 Phase 37。

</code_context>

<specifics>
## Specific Ideas

- 生成态要有明显“比赛展示”气质，用户一眼能看出系统正从原材料推进到成品阅读包，而不是普通 loading。
- 阅读包结果态应该给用户“这已经是一份可回看的资产”的心理预期，而不是临时生成结果。
- 逐句对照视图是句级解释层，hover 原文是词级解释层，两者并存能同时服务展示感和实际阅读理解。
- 对于恢复与失败，优先保证用户能继续，而不是追求自动化到让状态变化难以理解。

</specifics>

<deferred>
## Deferred Ideas

- 结构化词汇解释面板（保留 i+1 词 / 被简化表达分栏解释）属于 Phase 37。
- 从 reading pack 直接加入生词本、继续学习、进入历史 pack library 的学习接力属于 Phase 37。
- 历史列表升级为正式 reading pack 资产卡片库属于 Phase 37。
- 同一材料多 target-level variants 和阅读后题目生成属于后续 requirements，不在 Phase 36 内锁定。

</deferred>

---

*Phase: 36-pipeline-orchestrator-reading-pack*
*Context gathered: 2026-04-10*
