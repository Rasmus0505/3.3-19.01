# Phase 19: Immersive Learning Bug Fixes — Research

**Phase:** 19
**Mode:** ecosystem
**Date:** 2026-04-02
**Status:** RESEARCH COMPLETE

---

## Standard Stack

### React State Management
- **useReducer** for sentence-level state machine (`immersiveSessionMachine.js`)
- **useState** for UI-only state (`wordInputs`, `wordStatuses`, `currentWordInput`, `answerBoxMode`)
- **useRef** for mutable refs that don't trigger re-renders (`wordInputsRef`, `activeWordIndexRef`, `currentWordInputRef`)
- **useCallback** for stable event handler references

### CSS / Tailwind
- **Tailwind utility classes** — existing codebase uses `bg-amber-100` for yellow (#FEF3C7), `bg-emerald-100` for green (#D1FAE5)
- **CSS variables** — `--color-card` for container background

### Web APIs
- **Web Speech API** (`window.speechSynthesis`) — Chromium-native TTS, no npm package needed
- **Audio API** — `<audio>` element for clip playback via `clipAudioRef`

---

## Architecture Patterns

### Word Snapshot System (do NOT hand-roll)
The existing `wordInputs`/`wordStatuses`/`currentWordInput` state drives all rendering. **Never replace this with custom arrays.** All modifications go through `applyWordSnapshot(snapshot)` which syncs both state and refs.

```
wordInputs: string[]        // one string per token
wordStatuses: string[]       // "pending" | "active" | "correct" | "wrong"
currentWordInput: string    // current typing buffer
```

### Three-Layer Auto-Answer-Replay Guard (NEVER bypass)
The codebase uses a **three-effect chain** for auto-answer-replay:

1. **Effect 1** (line ~2130): Fires when `sentenceTypingDone` becomes `true` (user completes sentence) + `autoReplayAnsweredSentence` is true → sets `postAnswerReplayState = "waiting_initial_finish"`
2. **Effect 2** (line ~2257): Fires when `postAnswerReplayState === "waiting_initial_finish"` + playback is done → calls `startAnswerCompletedReplay()`
3. **Effect 3** (line ~2347): The `autoAdvanceGuard` — fires when `sentenceTypingDone === true` → calls `handleSentencePassed()` → advances to next sentence

**Problem:** Effect 3 has no guard on `postAnswerReplayState`. If the user clicks a button that triggers `ANSWER_COMPLETED` during typing, Effect 3 fires immediately alongside Effect 1, causing unwanted sentence advance.

**Fix:** Add `postAnswerReplayState !== "idle"` as a guard in Effect 3. The logic: only advance when replay state is `idle` (no replay in progress).

### Web Speech API TTS Pattern
```js
// Browser-native TTS, web + desktop (Chromium/Electron) both supported
const speakPreviousSentenceTTS = (text, rate = 1.0) => {
  if (!window.speechSynthesis) return false;
  window.speechSynthesis.cancel(); // stop any ongoing speech
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  utter.rate = rate; // reuse current playback rate
  window.speechSynthesis.speak(utter);
  return true; // synchronous — API available = success
};
```

---

## Don't Hand-Roll

- **Storing typed input outside React state** — always use `setWordInputs`/`setCurrentWordInput` + `applyWordSnapshot` pattern
- **Playing audio without `playSentence()`** — always use `useSentencePlayback.js` API, never call `audio.play()` directly
- **Setting reducer state directly** — always use `dispatchSession({ type: ... })`
- **Ignoring `postAnswerReplayState`** — any effect that cares about replay completion must check this state

---

## Common Pitfalls

### Stale Closure Bug in useEffect
When `useEffect` captures a stale `currentWordInput`/`wordInputs` ref, clicking a button reads old state and overwrites new input.

**Example:** If `requestReplayCurrentSentence` reads `wordInputs` from inside a useEffect dependency, it may read the value from before the user's latest keystroke.

**Fix:** Use refs (`wordInputsRef.current`) for callbacks that need current state, OR ensure useEffect dependencies include all state values.

### Answer Box Color: Ref vs State Mismatch
If `answerBoxMode` state is updated but the component renders from a ref (or vice versa), colors won't sync.

**Fix:** Drive className from `answerBoxMode` state directly. Never use a ref for UI-driven color state.

### TTS `speechSynthesis` in Strict Mode
React's StrictMode in development calls effects twice (mount → unmount → mount). `speechSynthesis.speak()` in StrictMode may cause duplicate speech.

**Fix:** Cancel any ongoing speech before speaking: `window.speechSynthesis.cancel()` before `speak()`.

---

## Code Examples

### Adding answerBoxMode State
```jsx
const [answerBoxMode, setAnswerBoxMode] = useState('ai_content'); // 'ai_content' | 'user_typed'

// In onKeyDown handler — detect user typing
const handleKeyDown = (event) => {
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
    setAnswerBoxMode('user_typed');
  }
  // ... rest of handler
};

// In container className
const answerBoxClassName = answerBoxMode === 'user_typed'
  ? 'bg-emerald-100'
  : 'bg-amber-100';
```

### Fixing autoAdvanceGuard (Effect 3)
```jsx
// BEFORE (buggy):
useEffect(() => {
  if (!immersiveActive) return;
  if (!sentenceTypingDone) return;
  if (sentenceAdvanceLockedRef.current) return;
  if (sentencePlaybackRequired && !sentencePlaybackDone) return;
  // no guard on postAnswerReplayState → fires during replay!
  sentenceAdvanceLockedRef.current = true;
  dispatchSession({ type: SET_PHASE, phase: "transition" });
  setTimeout(() => void handleSentencePassed(), 120);
}, [/* ... deps */]);

// AFTER (fixed):
useEffect(() => {
  if (!immersiveActive) return;
  if (!sentenceTypingDone) return;
  if (sentenceAdvanceLockedRef.current) return;
  if (sentencePlaybackRequired && !sentencePlaybackDone) return;
  if (postAnswerReplayState !== "idle") return; // ← ADD THIS GUARD
  sentenceAdvanceLockedRef.current = true;
  dispatchSession({ type: SET_PHASE, phase: "transition" });
  setTimeout(() => void handleSentencePassed(), 120);
}, [
  autoReplayAnsweredSentence,
  handleSentencePassed,
  immersiveActive,
  postAnswerReplayState, // ← ADD TO DEPS
  sentencePlaybackDone,
  sentencePlaybackRequired,
  sentenceTypingDone,
]);
```

### Fixing TTS Fallback in requestPlayPreviousSentence
```jsx
// BEFORE:
const result = await playSentence(previousSentence, {
  initialRate: selectedPlaybackRate,
  rateSteps: [],
}, { skipSeek: true }); // always fails if no clip audio

// AFTER — three-tier fallback:
const result1 = await playSentence(previousSentence, {
  initialRate: selectedPlaybackRate,
  rateSteps: [],
}, { skipSeek: false }); // allow main video fallback

if (!result1.ok) {
  // try TTS
  const ttsOk = speakPreviousSentenceTTS(
    previousSentence.text_en,
    selectedPlaybackRate,
  );
  if (!ttsOk) {
    setMediaError('上一句音频不可用，请稍后重试。');
    dispatchSession({ type: SET_PHASE, phase: "typing" });
    return;
  }
  // TTS success — show playing state
  dispatchSession({ type: PLAYBACK_STARTED, phase: "playing", translationDisplayMode: "previous" });
}
```

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|-----------|-------|
| Bug 1+4: autoAdvanceGuard guard fix | HIGH | Root cause confirmed in code, fix pattern clear |
| Bug 2: TTS Web Speech API | HIGH | Chromium/Electron support confirmed, API is synchronous |
| Bug 3: answerBoxMode pattern | HIGH | Standard React pattern, no edge cases |
| CSS color Tailwind classes | HIGH | `bg-amber-100` / `bg-emerald-100` match target hex values |
| Word snapshot system preservation | HIGH | Pattern well-understood from Phase 8 context |

---

*Research complete — Phase 19 ready for planning*
