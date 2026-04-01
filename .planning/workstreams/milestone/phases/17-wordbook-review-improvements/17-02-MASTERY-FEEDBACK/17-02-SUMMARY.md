# Summary: 17-02 — Mastery Feedback and Forgetting-Curve Scheduling

**Plan:** 17-02  
**Requirement:** WORD-02  
**Status:** ✅ Complete

## Verification Results

### Task 1: Review Preview API Returns Interval Previews ✅
- `preview_wordbook_review_grades` at `app/services/wordbook_service.py:347`
- `_calculate_preview_grades` at `app/services/wordbook_service.py:316`
- `WordbookReviewPreviewResponse` schema includes grades field at `app/schemas/wordbook.py:110`
- Response format matches spec: `{ grades: [{ grade, interval, interval_hours }] }`

### Task 2: Frontend Loads Preview When Review Item Changes ✅
- `loadReviewPreview(nextItems[0].id)` called in `loadReviewQueue` at line 132
- `setReviewPreview(null)` at start of `loadReviewQueue` at line 117
- `setReviewPreview(null)` after submitting at line 185
- `loadReviewPreview(remainingItems[0].id)` after submit at line 201

### Task 3: Interval Labels Display Below Review Buttons ✅
- `getIntervalLabel` function at lines 216-220
- Labels styled with `text-xs text-muted-foreground` at lines 447-449
- Shows "10分钟后/4小时后/1天后/4天后" based on grade

### Task 4: Review Result Feedback Shows Interval Change ✅
- Green feedback panel at lines 397-404
- Shows `previous_interval → new_interval` at lines 188-190
- Shows `interval_change` as subtext at lines 191
- 1.5 second timeout before auto-advancing

### Task 5: Memory Score Display in Review Card ✅
- Badge showing "记忆率 62%" at line 392
- `formatMemoryScore` function at lines 44-47
- Updates with each new review item

## Changes Made

No code changes required - implementation was already complete.

## Goal-Backward Verification

1. ✅ **User sees interval preview before choosing**: Each button shows "10分钟后/4小时后/1天后/4天后" below it
2. ✅ **User sees mastery/progress feedback**: "记忆率 62%" shown in review card header
3. ✅ **User sees interval change after review**: Green feedback shows "复习间隔：1天 → 4天后（+3天）"
4. ✅ **Forgetting-curve rule applied**: Backend calculates intervals using memory_score and review_count via `apply_review_grade`
