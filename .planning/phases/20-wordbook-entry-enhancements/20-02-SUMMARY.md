---
phase: 20-wordbook-entry-enhancements
plan: 02
status: complete
created: 2026-04-02
---

## Plan 20-02 Summary

**Objective:** Add pronunciation button to wordbook entry cards using Web Speech API. Button shows loading state during playback and error state on failure. Dynamic positioning follows word text.

**Tasks Completed:**

### Task 1: Pronunciation State + speakWord Function
- Added `Volume2` and `AlertCircle` to lucide-react imports
- Added `speakingId` and `speakingErrorId` state variables
- Implemented `speakWord` function using `window.speechSynthesis.speak()` with:
  - Browser support check with toast error
  - `speechSynthesis.cancel()` before each speak to prevent overlap
  - `SpeechSynthesisUtterance` with `lang='en-US'` and `rate=0.9`
  - `onstart` → show spinner, `onend` → clear state, `onerror` → show error icon for 2s

### Task 2: Pronunciation Button in List Mode
- Button dynamically positioned inline after word text using nested flex container
- Tooltip shows "播放发音"
- Conditional icon: Loader2 (speaking) → AlertCircle (error, 2s) → Volume2 (normal)
- Button disabled while speaking (`disabled={speakingId === item.id}`)

### Task 3: Pronunciation Button in Review Mode
- Same implementation as list mode
- Uses `speakingId === reviewItem.id` for disabled state
- Consistent button styling (h-8 w-8 p-0)

**Files Modified:**
- `frontend/src/features/wordbook/WordbookPanel.jsx`

**Verification:**
- `grep "speechSynthesis"` returns 4 occurrences (check + cancel + utterance + speak)
- `grep -c "Volume2"` returns 2 (list mode + review mode)
- `grep "播放发音"` returns 2 (list mode + review mode tooltips)

**Key Decisions Honored:**
- D-04: `Volume2` icon, dynamic positioning following word text
- D-05: Loading spinner → normal / Error icon (2s) → normal
- D-06: Web Speech API with `lang='en-US'`
