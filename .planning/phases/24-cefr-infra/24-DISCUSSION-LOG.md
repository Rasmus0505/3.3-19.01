# Phase 24: CEFR 基础设施与 i 水平设置 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 24-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 24-cefr-infra
**Areas discussed:** 缓存策略, 批量分析UX, API扩展, Duolingo中文说明

---

## 缓存策略

| Option | Description | Selected |
|--------|-------------|----------|
| 方案A: `cefr_analysis_v1:{lessonId}` | 简单键命名，无需复杂版本机制 | ✓ |
| 方案B: `cefr_analysis_v2:{lessonId}` 或加内容hash | 词汇表更新后自动触发重新分析 | |

**User's choice:** 方案A — localStorage 键使用 `cefr_analysis_v1:{lessonId}`
**Notes:** 词汇表是 MIT 许可证的 COCA 词表，基本不变动；用户打开同一视频不需要重新分析，体验更流畅。

---

## 批量分析UX

| Option | Description | Selected |
|--------|-------------|----------|
| 方案A: 静默处理 + 首次toast | setTimeout(0)分块，toast告知完成，无进度条 | ✓ |
| 方案B: 进度提示 | 显示"正在分析词汇..." + 进度条 | |

**User's choice:** 方案A — 静默处理
**Notes:** 99%的视频500ms内完成，无需进度条；toast让用户知道功能在工作。

---

## API扩展

| Option | Description | Selected |
|--------|-------------|----------|
| 方案A: 加到现有profile接口 | `PATCH /api/auth/profile` 加 cefr_level 字段 | ✓ |
| 方案B: 独立接口 | `PATCH /api/auth/cefr-level` 专用端点 | |

**User's choice:** 方案A — 加到现有接口
**Notes:** 改动小（加一个字段），一个接口管用户名和CEFR水平都很自然。

---

## Duolingo中文说明

| Option | Description | Selected |
|--------|-------------|----------|
| 参考标准CEFR定义 | A1-C2六档，参考多邻国风格中文 | ✓ |
| 自定义版 | 用户自己写各等级说明 | |

**User's choice:** 参考标准CEFR定义，B1默认
**Notes:** 采用标准CEFR中文描述作为默认文案。

---

## localStorage双端问题

**Question raised:** 浏览器端localStorage和桌面端Electron一样吗？

**Answer provided:** 是的，Electron本质上就是一个Chromium浏览器，localStorage在两个环境里行为完全一致，存储机制相同。用户数据在两个环境里可以共享（如果用同一份本地数据的话），无需区分处理。

**User's response:** 采纳说明，理解了。

---

## Claude's Discretion

- 词汇分析在ImmersiveLessonPage mount时触发（useEffect），无需懒加载
- 未知词默认SUPER等级，在Phase 25 CEFR色块中使用
- 个人中心CEFR选择器与Phase 25沉浸式色块共用authSlice中的userCefrLevel状态

## Deferred Ideas

None — all discussion stayed within phase scope.
