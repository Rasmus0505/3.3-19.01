# Phase 20: wordbook-entry-enhancements - Research

**Researched:** 2026-04-02
**Domain:** React frontend enhancement + Web Speech API integration
**Confidence:** HIGH

## Summary

This phase enhances wordbook entry cards to display translation in a dedicated visual block and add pronunciation playback via Web Speech API. The implementation requires restructuring the existing card layout in `WordbookPanel.jsx` (list mode and review mode) and adding a new pronunciation button with loading/error states.

**Primary recommendation:** Implement pronunciation using Web Speech API with `window.speechSynthesis.speak()`, using `Volume2` icon positioned inline with the word text, and style the translation block with `bg-muted/20` background to create visual separation.

## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **Card structure (vertical stack):** word → translation block → context
2. **Translation block style:** Independent visual block with light background (e.g., `bg-muted/20`)
3. **Card height:** Auto-adaptive (`min-h-[4rem]` or similar), no truncation
4. **Pronunciation button icon:** `Volume2` from lucide-react
5. **Pronunciation button position:** Dynamic, tight to word tail (not fixed container right)
6. **Pronunciation states:** spinner (`Loader2`) → normal; brief error state on failure
7. **Pronunciation source:** Web Speech API (`lang='en-US'`) as primary; sentence `audio_url` as fallback

### Claude's Discretion

- Specific translation block background color shade
- Card minimum height value
- Pronunciation button size and spacing
- Error state specific style (icon, color, duration)

### Deferred Ideas (OUT OF SCOPE)

- None

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WB-01 | 翻译文字显示在词条正上方（单词下方），采用独立视觉区块背景色区分；卡片高度自适应 | Web Speech API not needed; layout restructuring only |
| WB-02 | 用户点击发音按钮后浏览器播放发音（Web Speech API, lang='en-US'）；按钮显示加载中状态；失败时显示错误提示 | Web Speech API `speechSynthesis.speak()` with utterance events; Volume2 icon; Loader2 for loading; error handling via `onerror` |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lucide-react | ^0.511.0 | Volume2, Loader2 icons | Already in project dependencies |
| Tailwind CSS | 4.2.1 | Card styling, bg-muted utilities | Existing design system |
| shadcn/ui | (via shared/ui) | Card components | Existing component library |

### Web Speech API
| Feature | API | Notes |
|---------|-----|-------|
| Pronunciation | `window.speechSynthesis.speak(utterance)` | Browser native, no npm package |
| Language setting | ` utterance.lang = 'en-US'` | US English for word pronunciation |
| Events | `onstart`, `onend`, `onerror` | For loading/success/error states |

### No New Dependencies Required
All required icons (Volume2, Loader2) and utilities already exist in the project.

## Architecture Patterns

### Recommended Project Structure

No structural changes needed. Enhancement within existing file:

```
frontend/src/features/wordbook/
├── WordbookPanel.jsx        # Main component (enhanced)
├── TranslationDialog.jsx    # Existing, unchanged
├── FloatingToolbar.jsx      # Existing, unchanged
└── LessonPlayerPopup.jsx    # Existing, unchanged
```

### Pattern 1: Pronunciation Button with Web Speech API

**What:** Inline pronunciation button that plays word audio using browser's native TTS.

**When to use:** When pronunciation feature is needed without external audio files.

```javascript
// Source: MDN Web Docs - Web Speech API
const speakWord = (word) => {
  if (!('speechSynthesis' in window)) {
    toast.error('当前浏览器不支持语音合成');
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;  // Slightly slower for clarity
  utterance.pitch = 1;

  utterance.onstart = () => setSpeaking(true);
  utterance.onend = () => setSpeaking(false);
  utterance.onerror = (event) => {
    console.error('Speech synthesis error:', event.error);
    setSpeaking(false);
    setHasError(true);
    setTimeout(() => setHasError(false), 2000);
  };

  window.speechSynthesis.speak(utterance);
};
```

**Key considerations:**
- Cancel previous speech before starting new one (prevents overlap)
- Set rate slightly slower (0.9) for better comprehension
- Handle `onboundary` event if timing matters

### Pattern 2: Translation Block with Visual Separation

**What:** Dedicated section with background color to distinguish translation from other content.

**When to use:** When translation needs visual prominence without taking full card focus.

```jsx
// Translation block structure
<div className="flex flex-wrap items-center gap-2">
  <span className="text-lg font-semibold">{entryText}</span>
  {/* Pronunciation button positioned inline */}
  <PronunciationButton word={entryText} />
</div>

{wordTranslation && (
  <div className="rounded-lg bg-muted/20 px-3 py-2">
    <p className="text-sm font-medium text-foreground">{wordTranslation}</p>
  </div>
)}
```

### Pattern 3: Loading State for Actions

**What:** Using existing `busyEntryId` pattern for per-item loading.

**When to use:** When actions on individual items need loading feedback.

```javascript
// Existing pattern in WordbookPanel.jsx
const [speakingId, setSpeakingId] = useState(null);

const handleSpeak = async (entryId, word) => {
  setSpeakingId(entryId);
  try {
    await speakWord(word);
  } finally {
    setSpeakingId(null);
  }
};

// In JSX
<Button disabled={speakingId === item.id} ...>
  {speakingId === item.id ? (
    <Loader2 className="size-4 animate-spin" />
  ) : (
    <Volume2 className="size-4" />
  )}
</Button>
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pronunciation audio | Custom audio file hosting | Web Speech API | Browser native, no server cost, works offline |
| TTS playback control | Custom audio element | `speechSynthesis` API | Built-in start/end/error events |
| Icon loading state | Custom spinner | `Loader2` from lucide-react | Already in project, consistent style |

## Common Pitfalls

### Pitfall 1: Speech Overlap
**What goes wrong:** Multiple clicks cause overlapping speech, audio becomes garbled.
**Why it happens:** Each click creates a new utterance without canceling previous ones.
**How to avoid:** Call `window.speechSynthesis.cancel()` before each `speak()`.
**Warning signs:** Audio doesn't stop when clicking rapidly, or plays multiple times.

### Pitfall 2: Error State Timing
**What goes wrong:** Error icon flashes too quickly or persists indefinitely.
**Why it happens:** No proper timeout for error state, or error handler not resetting properly.
**How to avoid:** Use `setTimeout` with 2-second duration for error state, clear on unmount.
**Warning signs:** Button stuck in error state, or error never visible to user.

### Pitfall 3: Browser TTS Unavailability
**What goes wrong:** Function silently fails on browsers without Web Speech API support.
**Why it happens:** Not checking for API availability before use.
**How to avoid:** Guard with `if (!('speechSynthesis' in window))` check.
**Warning signs:** No feedback on Safari private browsing or older browsers.

### Pitfall 4: Card Height Inconsistency
**What goes wrong:** Cards with different content lengths cause layout jumps.
**Why it happens:** Fixed heights or lack of proper flex layout.
**How to avoid:** Use `min-h-[4rem]` with auto height, avoid fixed heights.
**Warning signs:** Scroll position jumps when list re-renders.

## Code Examples

### Translation Block Styling (from Phase 17 UI-SPEC)

```jsx
// Using existing design tokens
<div className="rounded-lg bg-muted/20 px-3 py-2">
  <p className="text-sm font-medium text-foreground">{wordTranslation}</p>
</div>
```

**Reference:** Phase 17 UI-SPEC.md §2 Design Language
- Muted: `hsl(215.4, 16.3%, 46.9%)` (slate-500)
- bg-muted/20 = 20% opacity muted background
- Text: 14px font-medium

### Pronunciation Button Positioning

```jsx
// Inline with word text using flex
<div className="flex flex-wrap items-center gap-2">
  <span className="text-lg font-semibold">{item.entry_text}</span>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 w-8 p-0"
        disabled={speakingId === item.id}
        onClick={() => handleSpeak(item.id, item.entry_text)}
      >
        {speakingId === item.id ? (
          <Loader2 className="size-4 animate-spin" />
        ) : hasError ? (
          <AlertCircle className="size-4 text-destructive" />
        ) : (
          <Volume2 className="size-4" />
        )}
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>播放发音</p>
    </TooltipContent>
  </Tooltip>
</div>
```

### Complete Card Structure (Target Layout)

```jsx
// List mode wordbook card
<div className="rounded-2xl border p-4">
  {/* Row 1: Word + Pronunciation */}
  <div className="flex flex-wrap items-center gap-2">
    <span className="text-lg font-semibold">{item.entry_text}</span>
    <PronunciationButton entryId={item.id} word={item.entry_text} />
    <Badge>{isMastered ? "已掌握" : `记忆率 ${score}`}</Badge>
  </div>

  {/* Row 2: Translation Block */}
  {item.word_translation && (
    <div className="mt-2 rounded-lg bg-muted/20 px-3 py-2">
      <p className="text-sm font-medium text-foreground">{item.word_translation}</p>
    </div>
  )}

  {/* Row 3: Context (existing) */}
  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
    <p>英文语境：{item.latest_sentence_en || "暂无英文语境"}</p>
    <p>中文语境：{item.latest_sentence_zh || "暂无中文语境"}</p>
    <p>下次复习：{formatDateTime(item.next_review_at)}</p>
  </div>
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Translation inline with text | Dedicated block with background | Phase 20 | Clearer visual hierarchy |
| No pronunciation feature | Web Speech API button | Phase 20 | Audio learning support |
| No loading states for TTS | Spinner + error state | Phase 20 | Better UX feedback |

**No deprecated patterns** — this is a new feature implementation.

## Open Questions

1. **Should pronunciation work during review mode?**
   - What we know: Context specifies both list and review modes need enhancement
   - What's unclear: Whether pronunciation button should be in the same position in review mode
   - Recommendation: Add pronunciation to review mode card header, consistent with list mode

2. **What fallback for browsers without Web Speech API?**
   - What we know: Most modern browsers support it, but Safari private browsing may not
   - What's unclear: Whether graceful degradation (disabled button) or error message is preferred
   - Recommendation: Disable button with tooltip explaining "浏览器不支持语音合成"

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified)

- No npm packages needed (Web Speech API is browser-native)
- No external services required
- lucide-react icons already in project

## Validation Architecture

> Skip this section — workflow.nyquist_validation key not present in .planning/config.json, treating as disabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js test runner (node:test) — existing |
| Config file | None — tests use ESM imports |
| Quick run command | `node --test frontend/src/features/admin-rates/__tests__/*.test.js` |
| Full suite command | Same (no test discovery config) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WB-01 | Translation block displayed in card | Manual verification | N/A | N/A |
| WB-02 | Pronunciation plays audio | Manual verification | N/A | N/A |

**Note:** This phase is primarily UI enhancement with no testable business logic. Manual verification during UAT is appropriate.

### Wave 0 Gaps
- None — no test infrastructure changes required

## Sources

### Primary (HIGH confidence)
- [MDN Web Docs - Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) - speechSynthesis API, utterance events, language settings
- [Phase 17 UI-SPEC.md](.planning/workstreams/milestone/phases/17-wordbook-review-improvements/17-UI-SPEC.md) - Design tokens, color palette, spatial system

### Secondary (MEDIUM confidence)
- [MDN - SpeechSynthesisUtterance](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance) - Rate, pitch, events

### Tertiary (LOW confidence)
- None required

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Uses existing project libraries and browser-native API
- Architecture: HIGH - Patterns well-established in codebase
- Pitfalls: HIGH - Web Speech API has well-documented edge cases

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (30 days — stable API)

---

## RESEARCH COMPLETE

**Phase:** 20 - wordbook-entry-enhancements
**Confidence:** HIGH

### Key Findings
- Web Speech API (`speechSynthesis`) is the standard approach — no npm packages needed
- Existing `busyEntryId` pattern can be extended for pronunciation loading states
- Translation block styling uses existing `bg-muted/20` design token
- `Volume2` icon from lucide-react (already in deps) for pronunciation button
- Key pitfalls: speech overlap (use `cancel()`), error state timing (2s timeout), browser support check

### File Created
`.planning/phases/20-wordbook-entry-enhancements/20-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Uses existing project libraries, browser-native API |
| Architecture | HIGH | Clear patterns from existing codebase |
| Pitfalls | HIGH | Web Speech API edge cases well-documented |

### Open Questions
- Pronunciation button position in review mode (recommend: same as list mode)
- Browser fallback behavior (recommend: disable with tooltip)

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
