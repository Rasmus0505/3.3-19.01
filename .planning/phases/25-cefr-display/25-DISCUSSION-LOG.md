# Phase 25: CEFR 沉浸式展示与历史徽章 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 25-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 25-cefr-display
**Areas discussed:** CEFR 视觉契约, 历史徽章数据存储, 词选动画反馈, 上一句交互状态分离

---

## CEFR 视觉契约

|| Option | Description | Selected |
|--------|---------|-------------|----------|
| A: 小角标（corner badge）| 词块右上角 teal/amber 小矩形（14-16px） | |
| B: 半透明背景覆盖 | 词块背景加半透明 teal/amber | |
| C: 词下方色条+字母 | 词块下方显示 CEFR 字母和色条 | ✓ |
| C-variant: 词下方色条（无字母） | 仅色条，无字母文字 | ✓ |

**User's choice:** 词块下方仅色条，不显示字母。最终确认：
- 形式：词下方色条（当前句为字母级短下划线，上一句为词块级色带）
- i+1 颜色：绿色（用户改为非蓝色）
- 高于 i+1 颜色：红色（用户明确改为非 amber）
- ≤ i 水平：无色（当前句保持灰色默认下划线，上一句无色带）
- 颜色语义：当前句 + 上一句统一

**Notes:** 用户多次迭代颜色方案，最终统一为：≤i 无色，i+1 绿色，>i+1 红色。当前句用字母级短下划线变色，上一句用词块级色带。

---

## 历史徽章数据存储

|| Option | Description | Selected |
|--------|---------|-------------|----------|
| 方案 A: 纯本地 | 从 localStorage 读取缓存，批量计算分布 | ✓ |
| 方案 B: 服务端存摘要 | 首次分析后把分布摘要存到 lesson 记录 | |
| 方案 C: lessonCardMetaMap | 分析后把摘要存到 lessonCardMetaMap（混合） | |

**User's choice:** 方案 A — 纯本地，无服务端改动

|| Option | Description | Selected |
|--------|---------|-------------|----------|
| A1: 彩色分段条 | 横向色条按比例分段，一图看懂难度分布 | ✓ |
| A2: 主色块+文字 | 卡片上放色块 + 占比文字 | |

**User's choice:** 分段色条 + 代表色块

|| Option | Description | Selected |
|--------|---------|-------------|----------|
| A: 空状态 | 未分析课程留白或灰色虚线框 | |
| B: 后台自动分析 | 首次访问时自动触发分析，显示 loading 条 | ✓ |

**User's choice:** 后台自动分析 + loading 条

---

## 词选动画反馈

**CEFR-16:** scale 1.0→1.08, 200ms ease-out
**CEFR-17:** 反馈与 CEFR 难度色区分开（scale + border/badging）

|| Option | Description | Selected |
|--------|---------|-------------|----------|
| scale 回弹 1.0 | scale 1.0→1.08，然后 ease-out 回弹 1.0 | |
| scale + 绿色边框闪烁 | scale + 绿色边框闪烁，然后回弹 1.0 | ✓ |

**User's choice:** scale + 绿色边框闪烁

**Trigger timing clarification:** scale 动画在点击"加入生词本"按钮时触发，不是在选词瞬间。流程：选词（变灰背景）→ 点击按钮 → scale+边框动画 → success message

---

## 上一句交互状态分离

|| Option | Description | Selected |
|--------|---------|-------------|----------|
| 无冲突 | 选中态（灰色背景）+ CEFR 色条各自独立渲染 | ✓ |
| 有冲突 | 需要特殊处理 | |

**User's choice:** 无冲突，各自独立渲染

**Clarifications provided:**
- CEFR 色条渲染层级在灰色背景上方，不被覆盖
- amber 颜色确认：偏橙黄色（#f59e0b 类），最终用户选择改高于 i+1 为红色
- 最终颜色方案（统一当前句+上一句）：
  - ≤ i：无色（当前句灰色下划线，上一句无色带）
  - i+1：绿色
  - > i+1：红色

---

## 颜色方案最终确认

| 等级 | 颜色 | 当前句表现 | 上一句表现 |
|------|------|-----------|-----------|
| ≤ i | 无色 | 灰色下划线（默认） | 无色带 |
| i+1 | 绿色 | 绿色下划线 | 绿色色带 |
| > i+1 | 红色 | 红色下划线 | 红色色带 |
| SUPER | SUPER（默认最高难度） | 红色下划线 | 红色色带 |

---

## Claude's Discretion

- 字母级短下划线的具体宽度/间距/padding
- 历史卡片的 badge 具体位置
- 绿色边框闪烁的持续时间（建议 300-400ms）
- `lessonCardMetaMap` 中存储 CEFR 分布数据的具体字段名

---

## Deferred Ideas

None — all discussion stayed within phase scope.
