# Phase 41: Quiz Generation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 41-quiz-generation
**Areas discussed:** 测验触发与入口, 题型交互设计, 生成策略与成本, 结果持久化与重做

---

## 测验触发与入口

| Option | Description | Selected |
|--------|-------------|----------|
| Tab in ReadingPackPanel | 阅读包 Tabs 新增"测验"Tab | ✓ |
| Next-step action button | 阅读包下方"下一步动作"按钮进入独立视图 | |

**User's choice:** A (Tab 方式) — 用户选择了所有 4 个问题的 A 选项

| Option | Description | Selected |
|--------|-------------|----------|
| Embedded in pack page | 内嵌在阅读包页面内（Tab 切换） | ✓ |
| Independent route | 独立路由/页面 | |

**User's choice:** A (内嵌)

| Option | Description | Selected |
|--------|-------------|----------|
| On-demand generation | 用户点击后实时生成 | ✓ |
| Auto pre-generate | 阅读包完成后后台预生成 | |

**User's choice:** A (按需生成)

| Option | Description | Selected |
|--------|-------------|----------|
| Hide tab | 内容太短时隐藏测验 Tab | ✓ |
| Disabled with tooltip | 显示但置灰 + tooltip 提示 | |

**User's choice:** A (隐藏)

**Notes:** User explicitly selected option A for all four questions in the first area.

---

## 题型交互设计

**User's choice:** 用户要求 Claude 自主决策所有剩余区域（"你自己决策"）

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse ComprehensionCheckPanel style | 复用现有选项卡片样式 | ✓ (Claude) |
| New design | 全新设计 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Inline free input | 下划线输入框，自由打字 | ✓ (Claude) |
| Word bank selection | 候选词列表选择 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Click-to-number | 点击分配序号 | ✓ (Claude) |
| Drag and drop | 拖拽排序 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Scrollable list | 所有题目滚动列表 | ✓ (Claude) |
| One-at-a-time navigation | 每次一道题+上下导航 | |

**Notes:** Claude decided based on: reuse existing patterns, reliable cross-device interaction, simpler UX.

---

## 生成策略与成本

**User's choice:** Claude 自主决策

- 每次生成 5-8 道题（3 选择 + 2 填空 + 1-2 排序）
- 消耗用户积分，复用 billing_service 模式
- 新增 `POST /api/llm/quiz/generate` 端点
- Temperature 0.7，严格 JSON 输出格式
- 失败时显示重试按钮

---

## 结果持久化与重做

**User's choice:** Claude 自主决策

- 测验数据持久化到 IndexedDB（扩展 readingRewriteDB pack 记录）
- 支持重做（清除答案）和重新生成（再次调用 LLM，消耗积分）
- 完成后显示分数卡片（X/Y 题 + 鼓励语）
- 历史面板显示测验完成徽章

---

## Claude's Discretion

- 选择题视觉样式细节
- LLM prompt 具体措辞和 JSON schema
- 题型分区标签展示方式

## Deferred Ideas

None.
