---
phase: 30
plan: 01
status: complete
started: 2026-04-05
completed: 2026-04-05
commit: 3637e81
---

## Summary

执行 CEFR-J 词表权威修正，生成 `app/data/vocab/cefr_vocab_fixed.json`。

## What was built

- 修正 `fix_cefr_levels.py`：`import os` 移到顶部，添加 `_source` 字段和顶级 `_vocab_version: "fixed-v1"`
- 执行修正脚本，生成 50,000 词修正后词表
- 所有 6 项 DATA-01~DATA-06 验证通过

## Validation Results

```
  [OK] _vocab_version: fixed-v1
  [OK] Word count: 50000
  [OK] No null level words
  [OK] CEFR-J matched words with pos_entries: 6596
  [OK] CEFR-J matched words with _source: 6596
  [OK] Rank-based words: 43404
```

## Level Distribution Changes

| Level | Before | After | Change |
|-------|--------|-------|--------|
| A1 | 600 | 1,173 | +573 |
| A2 | 600 | 1,386 | +786 |
| B1 | 1,300 | 2,567 | +1,267 |
| B2 | 2,500 | 3,472 | +972 |
| C1 | 5,000 | 3,462 | -1,538 |
| C2 | 10,000 | 8,738 | -1,262 |
| SUPER | 30,000 | 29,202 | -798 |

## Key Changes

- 5,564 words had their CEFR level corrected (84.4% of CEFR-J-matched subset)
- 798 words promoted from SUPER to valid CEFR levels (e.g., compute: SUPER→B2, aspire: SUPER→B2)
- 6,596 words now have `pos_entries` array with authoritative POS data
- 43,404 words retain rank-based levels with `_source: "rank-based"` marker
- 857 words have multiple POS entries (e.g., run: noun B1 + verb A1)

## Files Created

- `app/data/vocab/cefr_vocab_fixed.json` (4.6 MB)
- `fix_cefr_levels.py` (fixed)
