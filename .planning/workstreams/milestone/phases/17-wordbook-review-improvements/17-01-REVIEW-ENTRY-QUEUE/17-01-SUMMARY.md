# Summary: 17-01 — Review Entry and Due Queue Priority

**Plan:** 17-01  
**Requirement:** WORD-01  
**Status:** ✅ Complete

## Verification Results

### Task 1: Review Entry Card Prominence ✅
- Due count display: `"当前有 {dueCount} 条到期词条"` at line 243
- "开始复习" button with correct styling at lines 251-253
- Card uses correct border/background classes at line 240

### Task 2: Review Queue API Prioritization ✅
- `list_due_wordbook_entries` orders by `next_review_at.asc()` at `app/repositories/wordbook.py:134`
- Due entries (next_review_at <= now) are returned first, most overdue first
- `list_wordbook_review_queue_payloads` delegates to `list_due_wordbook_entries`

### Task 3: Due Count Badge (Optional Enhancement) ✅
- Added Badge variant="destructive" showing dueCount when > 0
- Badge appears below the due count text in the review entry card

## Changes Made

- `frontend/src/features/wordbook/WordbookPanel.jsx`:
  - Added `dueCount > 0 && <Badge variant="destructive">` to show due count badge

## Goal-Backward Verification

1. ✅ **User sees due count at a glance**: Review entry card displays "当前有 X 条到期词条"
2. ✅ **One-click entry to review flow**: "开始复习" button loads review-queue and switches to review mode
3. ✅ **Due entries prioritized**: API returns entries sorted by next_review_at, most overdue first
