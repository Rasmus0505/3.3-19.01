---
phase: 19
plan: 19-02
status: complete
completed: 2026-04-02
wave: 1
---

## Plan 19-02: 上一句小喇叭播放状态与错误提示

**Requirement:** IMMERSE-02

### Tasks Completed

| # | Task | Status |
|---|------|--------|
| 1 | Add `speakPreviousSentenceTTS()` Web Speech API helper | ✅ |
| 2 | Implement three-tier fallback (clip → TTS → error) in `requestPlayPreviousSentence` | ✅ |
| 3 | Error message clearing on typing | ✅ |

### Key Changes

**TTS helper** (`ImmersiveLessonPage.jsx` ~line 2731):
```js
const speakPreviousSentenceTTS = (text, rate = 1.0) => {
  if (!window.speechSynthesis) return false;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.rate = rate;
  window.speechSynthesis.speak(utter);
  return true; // synchronous — API available = success
};
```

**Three-tier fallback** in `requestPlayPreviousSentence`:
1. `playSentence(..., { skipSeek: false })` — clip with main-video fallback
2. `speakPreviousSentenceTTS(text_en, selectedPlaybackRate)` — Web Speech API
3. `setMediaError("上一句音频不可用，请稍后重试。")` + phase → typing

**Error clearing:** `handleKeyDown` first line: `setMediaError("")`

### Verification

- ✅ `SpeechSynthesisUtterance` in source
- ✅ `speakPreviousSentenceTTS` defined in component body
- ✅ `skipSeek: false` (allows main-video fallback)
- ✅ Error message: `上一句音频不可用，请稍后重试。`
- ✅ `setMediaError("")` on typing

### Files Modified

- `frontend/src/features/immersive/ImmersiveLessonPage.jsx` (+32 lines, -12 lines)