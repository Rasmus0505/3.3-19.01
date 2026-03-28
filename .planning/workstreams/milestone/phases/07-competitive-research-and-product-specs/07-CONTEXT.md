# Phase 7: 竞品研究与产品规范 - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

固定 v2.1 的产品定位、官方竞品参考、Bottle 1.0 / Bottle 2.0 的标准命名与示例文案，以及网页端的转化分流规则，让后续学习体验、网页端边界、管理台命名和盈利转化改造都基于同一套产品叙事推进，而不是继续各写各的文案或各自定义 CTA。这个阶段沉淀的是研究结论和可直接执行的规范包，不新增运行能力、不改变计费模型，也不把网页端变成 Bottle 1.0 的可执行入口。

</domain>

<decisions>
## Implementation Decisions

### 竞品研究口径
- **D-01:** Phase 7 的官方竞品矩阵必须纳入所有潜在竞品，而不是只看直接替代品。研究范围应同时覆盖直接英语学习产品、沉浸式学习工具、内容驱动学习产品、以及能影响 Bottle 定位与转化话术的相邻参考。
- **D-02:** 竞品矩阵至少要比较这些维度：目标用户/任务场景、素材来源与导入方式、平台边界（网页/桌面/移动端）、句子学习与生词/复习闭环、价格/付费门槛、以及各产品把用户推向付费或升级动作的触发方式。
- **D-03:** 竞品研究应尽量引用官方页面、官方定价页、官方帮助文档等一手材料，而不是只保留二手摘要。

### Bottle 1.0 / 2.0 命名与模型卡文案
- **D-04:** 模型卡和选择区的产品问题应从“选择字幕生成方式”改为 **“选择学习素材质量”**。
- **D-05:** `Bottle 1.0` 的标准示例文案为：**“生成速度一般，字幕质量较好（客户端专属）”**。
- **D-06:** `Bottle 2.0` 的标准示例文案为：**“生成速度快，字幕质量好”**。
- **D-07:** `Bottle 1.0 / Bottle 2.0` 是跨网页端、管理台、运行诊断和排障说明的主命名；`本机识别 / 云端识别` 可以保留为解释性副文案，但不再作为用户首先看到的主标签。

### 网页端转化分流
- **D-08:** 网页端转化规则采用“按场景分流”，而不是固定的网页优先或桌面优先。
- **D-09:** 当素材和场景适合网页端稳定执行时，主 CTA 继续保持在网页端当前流程，例如 `开始生成` 或等价的站内继续动作。
- **D-10:** 当场景命中能力边界或高风险素材时，主 CTA 应切换为 `下载桌面端`；网页继续入口可以保留，但应降为次级按钮或次级文字入口。
- **D-11:** 需要把 `下载桌面端` 提升为主 CTA 的典型场景包括：Bottle 1.0、链接导入、其他桌面端专属能力，以及超大文件、长时长素材、网络不稳定等明显更适合桌面端处理的高风险素材。
- **D-12:** `余额不足` 属于付费阻塞，不属于能力边界；在该状态下主恢复动作继续使用 `充值后生成`，不改成 `下载桌面端`。
- **D-13:** 网页端可以展示 Bottle 1.0 的价值与适用场景，并用它作为桌面端转化锚点，但网页端不得把 Bottle 1.0 呈现成可直接执行的浏览器流程。

### Phase 7 交付物结构
- **D-14:** Phase 7 不是轻量研究记录，而是重交付规范包。
- **D-15:** 该规范包至少应包含：竞品矩阵、产品定位结论、Bottle 1.0 / 2.0 标准命名与模型卡文案、网页端 CTA 分流规则、关键受阻场景文案规则，以及供后续阶段复用的统一话术边界。
- **D-16:** Phase 7 产物必须附带可直接复用的示例文案成品稿，而不只是抽象规则。
- **D-17:** 关键受阻场景文案规则至少覆盖：Bottle 1.0 网页不可执行、桌面端专属能力、链接导入、高风险素材推荐桌面端、以及余额不足后的恢复路径。

### the agent's Discretion
- 竞品矩阵的具体排版形式、优先级排序方式和可视化样式。
- “高风险素材”的最终阈值写法和提示分层，只要保留“能力边界 + 高风险素材”这条主分流原则，并与现有大文件/长时长启发式一致。
- 除主文案外的补充说明、说明性副标题和按钮旁注，只要不破坏 Bottle 1.0 / 2.0 的主命名和主次 CTA 规则。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 里程碑合同与产品边界
- `.planning/PROJECT.md` — v2.1 目标、运行时分层、Bottle 1.0 桌面专属边界、转化和运营方向
- `.planning/workstreams/milestone/ROADMAP.md` — Phase 7 目标、两条计划项，以及与后续阶段的依赖关系
- `.planning/workstreams/milestone/REQUIREMENTS.md` — Phase 7 对应需求 `WEB-01`、`WEB-02`、`WEB-03`、`GROW-01`、`GROW-02`
- `.planning/workstreams/milestone/STATE.md` — 当前活跃工作流状态，确认 Phase 7 仍处于需求/规划起点

### 先前阶段已经锁定的约束
- `.planning/workstreams/milestone/phases/01-shared-cloud-generation/01-CONTEXT.md` — Bottle 2.0 网页可执行、Bottle 1.0 相关桌面引导、桌面端说明弹窗与 CTA 的前置边界
- `.planning/workstreams/milestone/phases/05-billing-and-admin-alignment/05-CONTEXT.md` — 管理台必须以 Bottle 1.0 / 2.0 为主命名，且业务语言优先于技术实现标签
- `.planning/workstreams/milestone/phases/06-product-polish-and-fallbacks/06-CONTEXT.md` — `充值后生成` 已是余额不足的恢复动作；网页端 fallback 应该解释边界，而不是暴露技术细节

### 现有研究与一手参考聚合
- `.planning/research/STACK.md` — v2.1 “research + copy + conversion path” 默认策略，以及官方竞品参考链接聚合
- `.planning/research/SUMMARY.md` — 已沉淀的里程碑级结论：Bottle 1.0 可见但网页不可执行、Bottle 2.0 为网页默认路径、盈利改动聚焦文案与引导
- `.planning/research/FEATURES.md` — 市场模式提炼：快默认路径 vs 高价值高级路径、受阻动作恢复、平台边界表达方式
- `.planning/research/PITFALLS.md` — 不要把 Bottle 1.0 桌面专属做成“看不见”，以及不要在 copy/计费路径没收口前扩展订阅实验

### 当前需要统一的活跃产品表面
- `frontend/src/features/upload/UploadPanel.jsx` — 现有模型卡、主/次 CTA、桌面端引导弹窗、大文件推荐、`充值后生成`、以及上传流程中的主要用户文案
- `frontend/src/features/upload/asrStrategy.js` — 离线、云端不可用、本机降级、模型不可用等受阻场景消息的集中映射
- `frontend/src/shared/lib/asrModels.js` — 前端默认 Bottle 2.0 展示名称与副文案
- `app/services/asr_model_registry.py` — 后端模型元数据与 Bottle 1.0 / Bottle 2.0 的主显示名来源
- `app/api/routers/admin.py` — 管理台相关费率/模型展示接口，保证 Bottle 命名在运营端也一致
- `frontend/src/features/admin-system/AdminSystemTab.jsx` — 管理台 Bottle 运行就绪度展示，验证命名和诊断文案需要与网页端统一

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/features/upload/UploadPanel.jsx`: 已经集中承载模型卡标题/副标题、主按钮切换、`充值后生成`、桌面端引导弹窗、大文件推荐逻辑和任务状态文案，是 Phase 7 最直接的实施入口。
- `frontend/src/features/upload/asrStrategy.js`: 已经集中封装离线、云端不可用、本机降级和模型错误等提示语，适合承接 Phase 7 的受阻场景标准话术。
- `frontend/src/shared/lib/asrModels.js` 与 `app/services/asr_model_registry.py`: 已有前后端共享的 `display_name / subtitle / note` 元数据结构，可以作为 Bottle 1.0 / 2.0 标准命名和副文案的统一源。
- `frontend/src/features/admin-system/AdminSystemTab.jsx`: 已有 Bottle 运行就绪度卡片，天然需要吃到统一命名和说明文案。

### Established Patterns
- 网页端和桌面端共用同一套前端渲染层，差别主要通过运行时桥接和能力 gating 体现，而不是两个完全独立的产品壳。
- 当前产品已经把 Bottle 2.0 作为浏览器内可执行的默认路径，把 Bottle 1.0 作为桌面端本地能力；Phase 7 需要做的是统一“怎么说”，不是重写这条边界。
- 当前上传流已经区分了几种不同恢复路径：桌面专属说明、大文件推荐桌面端、余额不足去充值、离线/云端不可用提示，这说明 CTA 分流本来就是场景驱动的。
- 管理台和后端接口已经倾向使用 `Bottle 1.0 / Bottle 2.0`，而上传面板仍残留 `本机识别 / 云端识别` 为主标签，这正是需要本阶段收口的口径裂缝。

### Integration Points
- Phase 7 的规范产物会首先约束 `frontend/src/features/upload/UploadPanel.jsx` 中的模型卡文案、主次 CTA 切换、桌面引导弹窗和受阻状态文案。
- 命名和副文案应同步流向 `frontend/src/shared/lib/asrModels.js`、`app/services/asr_model_registry.py`、`app/api/routers/admin.py` 和 `frontend/src/features/admin-system/AdminSystemTab.jsx`，确保网页端、管理台和诊断面板使用同一套产品语言。
- 任何网页端文案或路由相关实现都必须继续遵守 `.planning/PROJECT.md` 里的交付约束：修改 `frontend/src` 后同步并验证 `app/static`。

</code_context>

<specifics>
## Specific Ideas

- 用户想让模型卡表达的不是“技术上走哪条 ASR 路线”，而是“学习素材质量怎么选”。
- `Bottle 1.0` 应承担“桌面端专属、质量更高、适合更重/更复杂素材”的价值锚点，而 `Bottle 2.0` 应承担“网页即用、起步更快”的默认路径角色。
- Phase 7 的最终产物不能只停在规则摘要，应包含可直接复制到后续实施阶段的示例文案成品稿。
- 竞品矩阵不能只看传统直接竞品；任何可能影响 Bottle 定位、定价锚点或转化路径的潜在竞品都应纳入。

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-competitive-research-and-product-specs*
*Context gathered: 2026-03-28*
