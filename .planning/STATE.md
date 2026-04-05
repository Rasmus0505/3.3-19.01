# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-05)

**Core value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.

**Current focus:** Milestone v2.6 — 清洗 CEFR 词典数据源 (Planning)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-05 — Milestone v2.6 started

## Milestone Status

v2.6 清洗 CEFR 词典数据源 (Phases 30–34):
- 🔄 Phase 30: CEFR 数据质量全面诊断 — PENDING
- 🔄 Phase 31: CEFR 等级权威修正 — PENDING
- 🔄 Phase 32: POS 词性信息补全 — PENDING
- 🔄 Phase 33: 数据结构规范化 — PENDING
- 🔄 Phase 34: 前后端适配验证 — PENDING

Progress: [░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 0%

## Previous Milestone Status

v2.5 阅读板块 + Pretext CEFR 排版 (Phases 26–29):
- Phase 26: Pretext 基础设施集成 — COMPLETE
- Phase 27: 阅读板块核心 UI — COMPLETE
- Phase 28: 词交互与生词本集成 — COMPLETE
- Phase 29: AI 重写与路由 — COMPLETE

## Performance Metrics

**Velocity:**
- Total plans completed: 50+ (across all previous milestones)
- Average duration: ~15 min

*Updated after each plan completion*

## Accumulated Context

### CEFR Data Quality Issues (v2.6 Pre-research)

Current state of `app/data/vocab/cefr_vocab.json`:
- Total words: 50,000 (COCA frequency rank-based, MIT licensed)
- CEFR-J Vocabulary Profile matched: 6,596 words (13.2%)
- Of matched words, 5,564 (84.4%) have incorrect CEFR levels
- Level assignment is purely rank-based (rank≤600=A1, etc.)
- No POS (part-of-speech) information currently stored
- `fix_cefr_levels.py` script exists with correction logic but not yet executed

Key quality problems:
1. Many common words mislabeled as SUPER (e.g., `compute` rank=20,046 labeled SUPER, should be B2)
2. CEFR-J Vocabulary Profile has 7,799 entries covering 7,020 unique headwords
3. POS information (noun/verb/adjective/etc.) completely absent from current vocab
4. Multiple POS entries per word not supported in current structure

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

---

## Session Continuity

Last session: 2026-04-05
Stopped at: Starting new milestone v2.6 — 清洗 CEFR 词典数据源
Resume file: None
