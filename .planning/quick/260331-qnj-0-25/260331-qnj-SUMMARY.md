---
phase: quick-qnj
plan: "01"
subsystem: immersive-learning
tags: [immersive,input-ux,playback-rate,learning-settings]
key_files:
  created:
    - .planning/quick/260331-qnj-0-25/260331-qnj-CONTEXT.md
    - .planning/quick/260331-qnj-0-25/260331-qnj-PLAN.md
  modified:
    - frontend/src/features/immersive/ImmersiveLessonPage.jsx
    - frontend/src/features/immersive/immersive.css
    - frontend/src/features/lessons/LessonList.jsx
decisions:
  - "句子跳转通过编辑态区分空白草稿和默认回显"
  - "学习参数数字字段允许空字符串留在本地状态，持久化时再 sanitize"
metrics:
  duration: "~15 min"
  completed: "2026-03-31"
---

# Quick Task 260331-qnj: 数字输入清空与倍速步进优化

## Summary

Improved the editing ergonomics for numeric inputs in immersive learning and learning settings. Sentence jump now supports clearing before re-entry and treats `0` as the first sentence. The playback-rate field now has embedded `0.25` step controls on the right side of the input.

## Changes Made

### 1. Sentence jump input now supports blank draft editing

- Added a dedicated editing-state guard so the jump field only falls back to the current sentence number when the user is not actively editing.
- Updated commit logic so `0` resolves to sentence `1`, while negative and invalid values still reset to the current sentence.

### 2. Playback-rate input now has inline 0.25 steppers

- Added compact up/down controls inside the right edge of the playback-rate input.
- Each click applies a `0.25` increment/decrement through the existing playback-rate normalization logic, so min/max behavior remains consistent.

### 3. Learning settings number fields preserve blank drafts

- Stopped immediately sanitizing custom numeric learning settings on every keystroke.
- Persisted storage still goes through the existing sanitize path, so saved data remains valid.

## Verification

```bash
npm run build
```

- Vite production build passed successfully in `frontend/`.
- Implementation commit: `282a72c9`

## Deviations from Plan

None.
