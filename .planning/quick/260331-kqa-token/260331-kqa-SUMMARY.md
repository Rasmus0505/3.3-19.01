---
phase: quick-kqa
plan: "01"
subsystem: immersive-learning
tags: [immersive,精听,token-selection,playback-rate]
key_files:
  created: []
  modified:
    - frontend/src/features/immersive/ImmersiveLessonPage.jsx
    - frontend/src/features/immersive/immersiveSessionMachine.js
decisions: []
metrics:
  duration: "~5 min"
  completed: "2026-03-31"
---

# Quick Task 260331-kqa: Immersive Token & Playback Rate Fixes

## Summary

Fixed two bugs in intensive listening (精听) mode: token selection now works immediately when translationDisplayMode is "current_answered", and playback rate respects the pinned state on sentence navigation.

## Changes Made

### 1. `resolveInteractiveWordbookContext` simplified (ImmersiveLessonPage.jsx)

Removed the overly restrictive condition that required `singleSentenceLoopEnabled && sentenceTypingDone && postAnswerReplayState === "completed"`. Now token selection activates as soon as `translationDisplayMode === "current_answered"` with valid sentence data — regardless of loop/typing/replay state.

### 2. `NAVIGATE_TO_SENTENCE` — `playbackRatePinned` check (immersiveSessionMachine.js)

Playback rate now resets to `DEFAULT_IMMERSIVE_PLAYBACK_RATE` (1x) when navigating sentences unless `playbackRatePinned` is true.

### 3. `SENTENCE_PASSED` — `playbackRatePinned` check (immersiveSessionMachine.js)

Same logic applied to auto-advance after a sentence is passed: rate resets to 1x unless pinned.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

```bash
grep -n "playbackRatePinned" frontend/src/features/immersive/immersiveSessionMachine.js | head -10
```
- Line 153: `NAVIGATE_TO_SENTENCE` — ✅ `playbackRatePinned` check present
- Line 229: `SENTENCE_PASSED` — ✅ `playbackRatePinned` check present
- `resolveInteractiveWordbookContext` simplified to 3 core conditions (`translationDisplayMode === "current_answered"`, `currentSentence`, `tokens.length > 0`)

## Self-Check: PASSED

- [x] `resolveInteractiveWordbookContext` simplified per plan (lines 491-498)
- [x] `NAVIGATE_TO_SENTENCE` playback rate logic added (line 153)
- [x] `SENTENCE_PASSED` playback rate logic added (line 229)
- [x] Single commit: 7c89ee57
