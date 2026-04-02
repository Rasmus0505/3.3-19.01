---
phase: 19
plan: 19-04
status: complete
completed: 2026-04-02
wave: 1
---

## Plan 19-04: 循环开关切换不触发重播

**Requirement:** IMMERSE-04

### Tasks Completed

| # | Task | Status |
|---|------|--------|
| 1 | Verify `handleToggleSingleSentenceLoop` clean (no replay call) | ✅ |
| 2 | Audit remaining button handlers for unguarded replay triggers | ✅ |
| 3 | Cross-check: all `requestReplayCurrentSentence` calls verified safe | ✅ |

### Key Findings

**`handleToggleSingleSentenceLoop`:** Only calls `setLoopEnabled(nextEnabled)` + `persistPlaybackPreferences(...)`. Does NOT call `requestReplayCurrentSentence`. ✅ Clean.

**`SET_LOOP_ENABLED` reducer:** Pure state update — only changes `singleSentenceLoopEnabled` boolean. No side effects. ✅ Clean.

**All `requestReplayCurrentSentence` calls:** Found at 4 locations (shortcut handlers × 2, `useImmersiveSessionController`). None dispatch `ANSWER_COMPLETED` directly. The `autoAdvanceGuard` guard (19-01) prevents unwanted sentence advance from any path.

**Shortcut handlers** at ~lines 3071-3075 and ~lines 3146-3149: `requestReplayCurrentSentence` called via shortcut. Guarded by `!typingEnabled` path at line 3208. ✅ Clean.

### Verification

- ✅ `SET_LOOP_ENABLED` handler has no replay side effect
- ✅ `SET_PLAYBACK_RATE` / `SET_LOOP_ENABLED` paths verified clean
- ✅ `autoAdvanceGuard` has `postAnswerReplayState !== "idle"` guard (from 19-01)
- ✅ Bug 1+4 fix complete: no replay-triggering action fires during typing

### Files Modified

None — verification confirmed no changes needed. Bug 1's fix (autoAdvanceGuard guard) also covers Bug 4's root cause.