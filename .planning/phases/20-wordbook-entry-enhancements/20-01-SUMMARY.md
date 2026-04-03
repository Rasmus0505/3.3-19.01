---
phase: 20-wordbook-entry-enhancements
plan: 01
status: complete
created: 2026-04-02
---

## Plan 20-01 Summary

**Objective:** Restructure wordbook entry cards to display translation in a dedicated visual block with independent background, below the word text.

**Tasks Completed:**

### Task 1: List Mode Card Translation Block
- Replaced inline `<p>` translation with dedicated `<div className="rounded-lg bg-muted/20 px-3 py-2">` block
- Removed "单词翻译：" prefix — block is visually distinct enough
- Translation block appears after word+badge row, before context div
- Structure: word+speak button row → translation block → context → metadata → actions

### Task 2: Review Mode Card Translation Block
- Same transformation as list mode
- Added `mt-2` margin-top for spacing from word
- Consistent styling between both modes

**Files Modified:**
- `frontend/src/features/wordbook/WordbookPanel.jsx`

**Verification:**
- `grep "bg-muted/20"` returns 2 occurrences (list mode + review mode)
- Both translation blocks use same rounded-lg background styling
- No "单词翻译：" prefix remains

**Key Decisions Honored:**
- D-01:上下堆叠，单词 → 翻译区块 → 语境（翻译在单词下方）
- D-02: 独立背景色 `bg-muted/20`
- D-03: 卡片高度自适应，不截断
