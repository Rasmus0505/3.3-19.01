# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-02)

**Core value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.

**Current focus:** Phase 25 — CEFR 沉浸式展示与历史徽章 (Plan 02/04)

## Current Position

Phase: 25 (In progress)
Plan: 02 / 04
Status: Plan 02 complete — next: Phase 25 Plan 03
Last activity: 2026-04-04 — Phase 25 Plan 02 CEFR underlines on answer box word slots complete

## Milestone Status

v2.4 词汇等级预处理与 CEFR 沉浸式展示 (Phases 24–25):
- Phase 24: CEFR 基础设施与 i 水平设置 — COMPLETE
- Phase 25: CEFR 沉浸式展示与历史徽章 — IN PROGRESS (Plan 02/04)

Progress: [░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 25%

## Milestone Status

v2.3 学习体验与导入流程优化 (Phases 19–23):
- Phase 19: 沉浸式学习 Bug 修复 — COMPLETE
- Phase 20: 生词本词条增强 — COMPLETE
- Phase 21: 素材导入 UX 优化 — COMPLETE
- Phase 21.1: 后台管理用户运营优化 — IN PROGRESS
- Phase 22: 字幕遮挡板与链接恢复 — COMPLETE

## Phase 20 Context Summary

卡片布局（上下堆叠，单词→翻译→语境）、翻译区块独立背景色、自适应高度、动态定位发音按钮、按钮状态变化反馈、Web Speech API 发音

## Performance Metrics

**Velocity:**
- Total plans completed: 50 (across all previous milestones)
- Average duration: ~15 min
- Total execution time: ~12.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| v1.0-v2.2 | 49 | 49 | ~15 min |
| Phase 24 | 4 | 4 | ~15 min |
| Phase 25 | 2 | 4 | ~10 min |

**Recent Trend:**
- Last 5 plans: trending stable
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Roadmap Evolution

- Phase 21.1 inserted after Phase 21: 后台管理用户运营优化：用户列表显示用户名，兑换码操作精简为删除和废弃，兑换码增加复制按钮，状态改为中文显示（URGENT）

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 8: Immersive playback state should be reducer-driven with explicit loop/rate/display contracts
- Phase 17: Wordbook review uses spaced-repetition scheduling with again/good grading
- v2.3: Immersive answer box uses yellow for AI/hint content, green for user-typed content
- v2.3: Browser Web Speech API is primary for word pronunciation; sentence audio as fallback

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- Phase 20 (Pronunciation): Browser Web Speech API quality should be verified on Windows/Electron before committing to it as primary
- Phase 22 (Video Extraction): Backend paragraph segmentation capability needs verification during planning — does ASR pipeline produce paragraph-level output?

### Quick Tasks Completed

|| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
|| 260403-0go | 沉浸式学习页面字母揭示时黄色显示修复（revealed 状态 CSS hex 回退色缺失） | 2026-04-03 | 50a13059 | [260403-0go](./quick/260403-0go/) |

## Session Continuity

Last session: 2026-04-04
Stopped at: Phase 25 Plan 02 complete — CEFR underlines on answer box word slots committed
Resume file: None
