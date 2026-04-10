# Phase 35: Material Intake & Diagnostic Card - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 35-material-intake-diagnostic-card
**Areas discussed:** 入口形态, 目标等级控制, 诊断卡信息密度, 返回与续接, 诊断台布局, 目标等级可调范围, 首屏模块

---

## 入口形态

| Option | Description | Selected |
|--------|-------------|----------|
| 独立诊断台 | 先进入独立的材料诊断卡 / 诊断台，确认后再生成 | ✓ |
| 保留现有双栏 | 保留当前左右栏结构，只把自动 rewrite 改成先出诊断卡 | |

**User's choice:** 先进入一个独立的“材料诊断卡 / 诊断台”，确认后再生成。
**Notes:** 用户明确要求把当前自动 rewrite 改为前置诊断确认流。

---

## 目标等级控制

| Option | Description | Selected |
|--------|-------------|----------|
| 仅展示推荐等级 | 推荐目标等级只做信息展示，不允许调整 | |
| 允许手动修改 | 生成前允许用户修改目标等级 | ✓ |

**User's choice:** 允许用户在生成前手动改目标等级。
**Notes:** 推荐等级仍需保留，但用户有覆盖权。

---

## 诊断卡信息密度

| Option | Description | Selected |
|--------|-------------|----------|
| 简洁预检卡片 | 偏轻量的 preflight 信息卡 | |
| 比赛展示型仪表板 | 更像诊断台 / 记分牌，强调解释与展示感 | ✓ |

**User's choice:** 偏比赛展示的“诊断仪表板 / 记分牌”。
**Notes:** 这是 v2.8 比赛叙事的一部分，不只是功能性确认页。

---

## 返回与续接

| Option | Description | Selected |
|--------|-------------|----------|
| 返回输入态重新诊断 | 重开材料后回到可编辑输入态 | |
| 回到上次诊断台继续 | 直接恢复诊断结果并继续生成 | ✓ |

**User's choice:** 直接回到上次的诊断卡继续。
**Notes:** 主按钮语义应偏向“继续生成”。

---

## 诊断台布局

| Option | Description | Selected |
|--------|-------------|----------|
| 左文右诊断 | 左侧原文预览，右侧诊断仪表板和操作区 | ✓ |
| 顶部摘要 + 下方仪表板 | 上方材料摘要，下方整块诊断区 | |
| 全屏诊断台 | 首屏全是诊断，仅提供展开原文入口 | |

**User's choice:** 左侧保留原文预览，右侧是诊断仪表板和操作区。
**Notes:** 该布局也最接近当前阅读模块已有的双栏代码资产。

---

## 目标等级可调范围

| Option | Description | Selected |
|--------|-------------|----------|
| 推荐值上下 1 档 | 限制用户只在推荐范围附近微调 | |
| A1-C2 全量切换 | 提供完整 CEFR 目标等级选择 | ✓ |
| 默认推荐 + 自定义入口 | 默认简化选择，展开后再自定义 | |

**User's choice:** `A1-C2` 全量切换。
**Notes:** 用户希望保留更大的目标控制自由度。

---

## 首屏模块

| Option | Description | Selected |
|--------|-------------|----------|
| 难度对照 | 材料难度 vs 用户等级 vs 建议目标等级 | ✓ |
| 改写影响统计 | i+1 词数量 / 超纲表达数量 / 预计改写影响 | ✓ |
| 耗时费用说明 | 预计耗时 / 预计费用 / 生成后得到什么 | |
| 推荐解释 | 为什么建议这个等级 | |
| 可视化图表 | 图表 / 分段条 / 视觉化指标 | ✓ |

**User's choice:** `A + B + E`
**Notes:** 首屏必须有对比信息、改写影响统计和可视化展示；费用/耗时不是当前首要展示核心。

---

## the agent's Discretion

- 图表最终是环形、横条、分段条还是评分卡样式，由后续 planning 决定。
- 原文预览区的滚动、截断和展开细节留给后续 UI / implementation 设计。

## Deferred Ideas

- 阶段化生成过程与阅读包资产页留到 Phase 36。
- 学习接力与阅读包历史库留到 Phase 37。
