---
phase: quick-kqa
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/features/immersive/ImmersiveLessonPage.jsx
  - frontend/src/features/immersive/immersiveSessionMachine.js
autonomous: true
requirements: []
must_haves:
  truths:
    - "Token selection works when translationDisplayMode is current_answered regardless of sentenceTypingDone or postAnswerReplayState"
    - "Playback rate resets to 1x on sentence navigation when playbackRatePinned is false"
    - "Playback rate persists on sentence navigation when playbackRatePinned is true"
  artifacts:
    - path: "frontend/src/features/immersive/ImmersiveLessonPage.jsx"
      contains: "resolveInteractiveWordbookContext simplified condition"
      lines: 473-521
    - path: "frontend/src/features/immersive/immersiveSessionMachine.js"
      contains: "NAVIGATE_TO_SENTENCE and SENTENCE_PASSED with playbackRatePinned check"
      lines: 147-154, 215-229
---

<objective>
Fix two bugs in intensive listening (精听) mode:
1. Token selection always available regardless of replay state
2. Playback rate pinned logic correct on sentence navigation
</objective>

<context>
@frontend/src/features/immersive/ImmersiveLessonPage.jsx (lines 473-521)
@frontend/src/features/immersive/immersiveSessionMachine.js (lines 147-154, 204-209, 215-229)

Key constants from codebase:
- DEFAULT_IMMERSIVE_PLAYBACK_RATE = 1
- state.playbackRatePinned (boolean)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Simplify resolveInteractiveWordbookContext</name>
  <files>frontend/src/features/immersive/ImmersiveLessonPage.jsx</files>
  <action>
    In `resolveInteractiveWordbookContext` function (line 473-521):

    Replace the complex condition at lines 492-507 that requires ALL of:
    - `singleSentenceLoopEnabled && sentenceTypingDone && postAnswerReplayState === "completed"`

    With a SIMPLE condition that only checks:
    - `translationDisplayMode === "current_answered" && currentSentence && safeCurrentSentenceTokens.length > 0`

    The function should return current sentence tokens whenever `translationDisplayMode === "current_answered"` with valid data, independent of replay/loop state.

    Keep the "previous" mode logic unchanged (line 510-517).
  </action>
  <verify>
    <automated>grep -n "resolveInteractiveWordbookContext" frontend/src/features/immersive/ImmersiveLessonPage.jsx | head -5</automated>
  </verify>
  <done>resolveInteractiveWordbookContext returns current sentence tokens when translationDisplayMode is "current_answered" regardless of replay state</done>
</task>

<task type="auto">
  <name>Task 2: Add playbackRatePinned check to NAVIGATE_TO_SENTENCE</name>
  <files>frontend/src/features/immersive/immersiveSessionMachine.js</files>
  <action>
    In the `NAVIGATE_TO_SENTENCE` case (line 147-154):

    Modify the `selectedPlaybackRate` assignment to check `playbackRatePinned`:

    ```javascript
    selectedPlaybackRate: state.playbackRatePinned
      ? state.selectedPlaybackRate
      : DEFAULT_IMMERSIVE_PLAYBACK_RATE,
    ```

    This ensures:
    - When pinned: keep current playback rate
    - When NOT pinned: reset to default (1×)
  </action>
  <verify>
    <automated>grep -n "playbackRatePinned" frontend/src/features/immersive/immersiveSessionMachine.js | head -10</automated>
  </verify>
  <done>NAVIGATE_TO_SENTENCE resets playback rate when not pinned, preserves when pinned</done>
</task>

<task type="auto">
  <name>Task 3: Add playbackRatePinned check to SENTENCE_PASSED</name>
  <files>frontend/src/features/immersive/immersiveSessionMachine.js</files>
  <action>
    In the `SENTENCE_PASSED` case (line 215-229):

    Modify the `selectedPlaybackRate` assignment in the return object (line 227):

    ```javascript
    selectedPlaybackRate: state.playbackRatePinned
      ? state.selectedPlaybackRate
      : DEFAULT_IMMERSIVE_PLAYBACK_RATE,
    ```

    This ensures auto-advancement to next sentence also respects the pinned state.
  </action>
  <verify>
    <automated>grep -n "playbackRatePinned" frontend/src/features/immersive/immersiveSessionMachine.js | head -10</automated>
  </verify>
  <done>SENTENCE_PASSED resets playback rate when not pinned, preserves when pinned</done>
</task>

</tasks>

<verification>
- All three changes made to the two files
- grep confirms playbackRatePinned checks in both reducers
- resolveInteractiveWordbookContext simplified to 2 conditions
</verification>

<success_criteria>
- Token selection visible when in "本句" mode even before typing completes
- Playback rate auto-resets to 1× on next sentence when NOT pinned
- Playback rate persists on next sentence when IS pinned
</success_criteria>

<output>
After completion, create `.planning/quick/260331-kqa-token/260331-kqa-SUMMARY.md`
</output>
