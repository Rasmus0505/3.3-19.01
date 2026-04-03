---
phase: 21-material-import-ux-optimization
plan: 02
status: complete
created: 2026-04-02
---

## Plan 21-02 Summary

**Objective:** Convert the shortcut config grid from CSS Grid to a two-row flex layout. 6 actions split into two rows of 3, with tight card widths and centered second row.

**Tasks Completed:**

### Task 1: Two-Row Flex Layout
- Outer container changed from `grid gap-3 md:grid-cols-2 lg:grid-cols-3` → `flex flex-col gap-3`
- Row 1: `flex flex-row flex-wrap gap-3` with `SHORTCUT_ACTIONS.slice(0, 3)` (reveal_letter, reveal_word, previous_sentence)
- Row 2: `flex flex-row flex-wrap gap-3 justify-center` with `SHORTCUT_ACTIONS.slice(3, 6)` (next_sentence, replay_sentence, toggle_pause_playback)
- Each card: `h-full` removed, `w-fit min-w-0` added (tight-fit width)
- `break-all` on shortcut label paragraph preserved (prevents overflow on long key combos)

**Files Modified:**
- `frontend/src/features/lessons/LessonList.jsx`

**Verification:**
- `grep "SHORTCUT_ACTIONS.slice(0, 3)"` → Row 1 confirmed
- `grep "SHORTCUT_ACTIONS.slice(3, 6)"` → Row 2 confirmed
- `grep "justify-center"` → Row 2 centered alignment confirmed
- `grep "w-fit min-w-0"` → 2 occurrences (one per row's first card)
- `grep "grid gap-3 md:grid-cols-2 lg:grid-cols-3"` → 0 occurrences (old grid removed)
- SHORTCUT_ACTIONS confirmed has exactly 6 items → 3+3 split is correct
