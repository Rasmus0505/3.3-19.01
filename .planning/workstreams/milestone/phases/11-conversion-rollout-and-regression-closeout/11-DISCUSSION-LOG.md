# Phase 11: 盈利转化落地与回归收口 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 11-conversion-rollout-and-regression-closeout
**Areas discussed:** 模型卡文案与布局, 受阻场景按钮文案, 交付物边界, 回归验收范围, Folded todo

---

## 模型卡文案与布局

| Option | Description | Selected |
|--------|-------------|----------|
| 轻量说明型 | 只保留速度、质量、是否桌面端、价格等基础介绍 | |
| 场景推荐型 | 强调适合的素材/场景，并保留价格与推荐关系 | |
| 自定义精确文案 | 用户直接给出每张卡的全部文案和布局，不再额外加副标题 | ✓ |

**User's choice:** 两张模型卡全部文案和布局由用户直接指定，不额外添加副标题。
**Notes:** 最终锁定为：
- Bottle 1.0：`Bottle 1.0` + `（后台设置的价格）` / `客户端专属` + `通用素材生成`
- Bottle 2.0：`Bottle 2.0` + `（后台设置的价格）` / `网站/客户端` / `更强大的AI模型` + `适合复杂视频`

---

## 受阻场景按钮文案

| Option | Description | Selected |
|--------|-------------|----------|
| 温和建议型 | 复杂素材时只做较弱推荐 | |
| 明确推荐型 | 明确告诉用户更推荐桌面端，并保留继续动作 | ✓ |
| 强引导型 | 大幅压低网页继续路径，强调不建议继续 | |

**User's choice:** 对大文件 / 长时长 / 复杂视频采用明确推荐型。
**Notes:** 最终锁定：
- 大文件 / 长时长 / 复杂视频：
  - 主提示：`当前素材推荐使用客户端生成，效果和稳定性更好`
  - 主按钮：`下载桌面端`
  - 次按钮：`继续生成素材`
- 对余额不足、Bottle 1.0 网页不可执行、链接导入三种受阻场景，用户未再修改已展示的精确文案，按讨论稿继续收口。

---

## 交付物边界

| Option | Description | Selected |
|--------|-------------|----------|
| 独立经营建议清单 | 在项目里新建一份经营/运营建议文档 | |
| 只讨论，不落独立文档 | 经营建议只作为讨论背景，不成为项目交付物 | ✓ |

**User's choice:** 不需要在项目里做“经营建议清单”，只讨论，不做。
**Notes:** 这直接约束 Phase 11 的 `11-02` 规划边界，避免额外生出独立策略文档任务。

---

## 回归验收范围

| Option | Description | Selected |
|--------|-------------|----------|
| 最小回归范围 | 只覆盖核心模型卡、受阻动作、静态产物和旧深链 | ✓ |
| 再加跳转有效性 | 额外强制校验充值页/下载页具体跳转结果 | |
| 更大范围全站回归 | 把更多无关页面也纳入 Phase 11 | |

**User's choice:** 够了
**Notes:** 最小回归范围固定为 8 条：
- 上传页两张模型卡文案和布局正确
- 余额不足时主按钮必须是 `充值后生成`
- Bottle 1.0 网页不可执行时主按钮必须是 `下载桌面端`
- 大文件 / 长时长 / 复杂视频时出现已锁定推荐文案和两个按钮
- 链接导入时仍然只引导桌面端，不允许网页直接执行
- 用户侧只显示 `Bottle 1.0 / Bottle 2.0`
- 修改网页端前端后，必须同步并验证 `app/static`
- 旧深链不能失效

---

## Folded Todo

| Option | Description | Selected |
|--------|-------------|----------|
| 不并入 | 保持为单独 todo，不进入 Phase 11 scope | |
| 并入 | 折进本 phase 的 scope，一起规划和回归 | ✓ |

**User's choice:** 并入
**Notes:** `Fix global numeric input clearing` 已折进 Phase 11，作为本阶段回归收口的一部分处理。
