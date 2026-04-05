# STATE: Bottle English Learning — v2.7 阅读板块重写增强

## Project Reference

**Project:** Bottle English Learning
**Core Value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.
**Current Milestone:** v2.7 阅读板块重写增强

## Current Position

**Phase:** Not started (defining requirements)
**Plan:** —
**Status:** Defining requirements
**Last activity:** 2026-04-06 — Milestone v2.7 started

## Milestone Context

**v2.7 Goal:** 持久化保存AI重写结果，改进重写词汇的视觉标记（黄色色块替代下划线），优化DeepSeek提示词以减少token消耗。

**Target features:**
1. 重写文章持久化 — unlock后保存到IndexedDB，阅读历史自动加载，支持原文/重写版切换
2. 黄色色块UI — 重写词汇用黄色背景色块覆盖，悬停显示原词
3. 提示词优化 — 参考Rewordify分级策略+句子级分析，结构化JSON减少token

**Previous milestone (v2.6 shipped 2026-04-06):**
- Phase 30: CEFR 词表权威修正
- Phase 31: 前后端适配验证

## Accumulated Context

### Key Decisions (v2.7)

|| Decision | Rationale |
|----------|-----------|
| 重写词汇黄色色块UI（覆盖式背景）+ tooltip原词对照 | 色块比下划线更明显，悬停显示原词符合Rewordify交互模式 |
| 重写结果按文章维度持久化到IndexedDB，阅读历史自动加载 | 避免重复请求API，用户可在任意时间切换原文/重写版 |
| Rewordify参考：分级难度+多显示模式+点击原词对照，本产品CEFR系统更精准 | Rewordify用频率统计，本产品用CEFR词汇表识别i+1词汇，可精准定位简化目标词 |

### Technical Notes

- IndexedDB `reading_rewrites` 已有存储结构（Phase 29），需扩展 articleId 维度
- IndexedDB `reading_history` 已有阅读历史存储（Phase 29），需关联重写结果
- CEFR词汇表（fixed-v1，Phase 30/31）已完整，可精准识别i+1词汇
- 当前rewrite_mappings已支持一对一词映射，黄色色块UI只需调整CSS

### Blockers

- None currently

## Session Continuity

**Planning session started:** 2026-04-06
**v2.7 milestone initialized:** 2026-04-06

---
*Last updated: 2026-04-06*
