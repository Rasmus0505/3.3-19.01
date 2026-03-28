# Phase 7: 竞品研究与产品规范 - Research

**Research Date:** 2026-03-28  
**Status:** Ready for planning

## 研究目标

研究如何把 Phase 7 拆成可执行的规范产出，让后续网页端体验改造、管理台命名收口和盈利转化改动都建立在同一套 benchmark-backed 产品叙事上，而不是继续在代码里零散改文案。

## 核心发现

### 1. 已有里程碑研究足够支撑 Phase 7 的竞品起步集

当前仓库已经沉淀了官方来源的基准参考：

- LingQ 官方套餐页与注册页
- Migaku 官方定价页
- FluentU 官方定价页
- Glossika 官方套餐页与帮助文档

这些来源已经足够作为 Phase 7 竞品矩阵的起始样本，但 Phase 7 的矩阵不能只停在“直接对手”层面。根据 CONTEXT.md 的锁定决策，矩阵必须覆盖四类口径：

- 直接英语学习产品
- 沉浸式学习工具
- 内容驱动学习产品
- 会影响定位、定价锚点或转化路径的相邻参考

结论：Phase 7 的第一份正式交付物应该是“官方来源竞品矩阵”，并且把“官方来源”作为硬性字段，而不是写成二手摘要。

### 2. 当前产品表面已经出现明显的命名和叙事裂缝

现状并不是“完全没有 Bottle 命名”，而是不同表面已经开始分叉：

- `frontend/src/shared/lib/asrModels.js` 与 `app/services/asr_model_registry.py` 已经把云端路径命名为 `Bottle 2.0`
- `frontend/src/features/admin-system/AdminSystemTab.jsx` 已经使用 `Bottle 运行就绪度`
- `frontend/src/features/upload/UploadPanel.jsx` 仍然展示 `选择字幕生成方式`、`本机识别`、`云端识别`
- `Docx/产品介绍.md` 仍然保留偏旧的“模型管理 / 技术路径导向”叙事

结论：Phase 7 不是重新发明定位，而是把已经开始出现的 Bottle 命名收束成统一的主叙事，并提供一套能覆盖网页端、管理台、排障说明和产品介绍的标准文案。

### 3. 网页端分流逻辑已经是“场景驱动”，但缺少规范包

代码里已经存在多个场景驱动动作：

- 大文件 / 长时长素材会推荐桌面端
- `充值后生成` 已经作为余额不足的恢复动作存在
- Bottle 1.0 与链接导入已经具备桌面端引导语义
- `asrStrategy.js` 已经集中管理受阻场景消息

问题不在于“没有分流”，而在于这些分流点还没有统一规范：

- 什么时候主 CTA 应该切成 `下载桌面端`
- 什么时候主 CTA 必须保持 `充值后生成`
- 哪些场景允许网页继续
- 哪些旧词仍可作为副文案保留，而不能再做主标签

结论：Phase 7 的第二份正式交付物应该是“网页端 CTA + 文案规范包”，并直接映射到现有文件表面，而不是只写抽象原则。

### 4. Phase 7 应交付“规范包”，不是代码修补

CONTEXT.md 已经明确锁定：

- 本阶段不新增运行能力
- 不改变计费模型
- 不把网页端变成 Bottle 1.0 的可执行入口
- 必须留下带示例文案的成品稿

因此，最合理的阶段拆分是：

- `07-01`：完成官方竞品矩阵与 Bottle 1.0 / 2.0 定位规范
- `07-02`：完成网页端 CTA、受阻场景、防守边界和可复用 copy deck

### 5. 当前代码与文档说明了 Phase 7 的下游消费者是谁

Phase 7 不是只给策划看的文档。它的规范必须能直接喂给后续执行阶段，因此需要覆盖这些明确的消费端：

- `frontend/src/features/upload/UploadPanel.jsx`
- `frontend/src/features/upload/asrStrategy.js`
- `frontend/src/shared/lib/asrModels.js`
- `app/services/asr_model_registry.py`
- `frontend/src/features/admin-system/AdminSystemTab.jsx`
- `Docx/产品介绍.md`

结论：Phase 7 文档需要把“哪条话术落到哪个文件/表面”写清楚，否则后续阶段仍然会各写各的。

## 建议的 Phase 7 交付物

| 文件 | 作用 | 归属计划 |
|------|------|----------|
| `07-COMPETITOR-MATRIX.md` | 官方来源竞品矩阵，沉淀定位、平台边界、付费触发与参考启发 | 07-01 |
| `07-PRODUCT-POSITIONING-SPEC.md` | Bottle 1.0 / 2.0 标准定位、主命名、主叙事与 benchmark-backed monetization summary | 07-01 |
| `07-WEB-CTA-SPEC.md` | 场景分流规则、主次 CTA 表、具体表面映射 | 07-02 |
| `07-COPY-DECK.md` | 模型卡文案、受阻场景文案、旧词到新词映射、可直接复用样稿 | 07-02 |

## 规划建议

### 推荐波次

- **Wave 1:** `07-01`
- **Wave 2:** `07-02` 依赖 `07-01`

理由：

- CTA 规范必须依赖前一份定位稿，否则“什么时候主推网页、什么时候主推桌面”会继续漂移
- 受阻文案和模型卡 copy 必须以标准主文案为前提，否则执行阶段还会争论 `本机识别/云端识别` 是否继续做主标题

### 推荐边界

- 做：研究矩阵、标准定位、规范文案、CTA 规则、下游表面映射
- 不做：直接改 `UploadPanel.jsx`、直接改 admin 代码、改计费模型、引入订阅

## 风险与未知项

- “高风险素材”阈值需要沿用当前启发式方向，不能在 Phase 7 发明与现有代码完全脱节的新阈值体系
- 竞品矩阵必须继续使用官方页面，不能被社区测评或二手博客替代
- `Docx/产品介绍.md` 等旧文档在 Phase 7 结束时可能仍未同步，但规范包必须明确把它列为后续消费端
- 不能因为 Phase 7 涉及“网页转化”就偷跑到 Phase 11 的实现工作

## Validation Architecture

Phase 7 的验证重点不是单元测试，而是“规范是否完整、可执行、可追踪”。

### 1. 文档完整性验证

每个交付文件都必须有可 grep 的固定结构和固定字符串：

- `07-COMPETITOR-MATRIX.md` 必须包含官方来源字段和四类竞品口径
- `07-PRODUCT-POSITIONING-SPEC.md` 必须包含 Bottle 1.0 / 2.0 的标准示例文案
- `07-WEB-CTA-SPEC.md` 必须包含场景到主次 CTA 的决策表
- `07-COPY-DECK.md` 必须包含 `选择学习素材质量`、`下载桌面端`、`充值后生成`

### 2. 范围边界验证

规范包必须明确写出这些禁止项：

- 网页端不得执行 Bottle 1.0
- `余额不足` 是付费阻塞，不得改写成桌面端能力分流
- v2.1 不引入订阅

### 3. 下游可追踪性验证

每份规范至少要映射到一个真实消费表面：

- `UploadPanel.jsx`
- `asrStrategy.js`
- `asrModels.js`
- `asr_model_registry.py`
- `AdminSystemTab.jsx`
- `Docx/产品介绍.md`

### 4. 反馈采样方式

本阶段使用“文本断言 + 人工审阅”而非代码测试：

- 文本断言：检查关键标题、固定文案、文件映射、禁止项
- 人工审阅：确认 CTA 规则没有把 Bottle 1.0 写成网页可执行路径，也没有把余额阻塞误判成能力边界

## 来源

### 本地上下文

- `.planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-CONTEXT.md`
- `.planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-DISCUSSION-LOG.md`
- `.planning/research/STACK.md`
- `.planning/research/SUMMARY.md`
- `.planning/research/FEATURES.md`
- `.planning/research/PITFALLS.md`
- `frontend/src/features/upload/UploadPanel.jsx`
- `frontend/src/features/upload/asrStrategy.js`
- `frontend/src/shared/lib/asrModels.js`
- `app/services/asr_model_registry.py`
- `frontend/src/features/admin-system/AdminSystemTab.jsx`
- `Docx/产品介绍.md`

### 官方参考起点

- https://www.lingq.com/en/learn/en/web/plans/
- https://www.lingq.com/en/signup/
- https://migaku.com/ja/pricing
- https://www.fluentu.com/en/pricing/
- https://ai.glossika.com/plans
- https://help.glossika.com/en/articles/6281457-%E5%A4%8D%E4%B9%A0%E6%A8%A1%E5%BC%8F-glossika-%E6%80%8E%E9%BA%BD%E5%B8%AE%E6%88%91%E5%B0%87%E5%AD%B8%E9%81%8E%E7%9A%84%E5%8F%A5%E5%AD%90%E8%BD%89%E7%82%BA%E9%95%B7%E6%9C%9F%E8%A8%98%E6%86%B6

---

*Phase: 07-competitive-research-and-product-specs*  
*Research completed: 2026-03-28*
