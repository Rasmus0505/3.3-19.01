# Domain Pitfalls: Adding CEFR Vocabulary Level Display

**Domain:** English learning app — immersive learning with vocabulary level analysis
**Researched:** 2026-04-03
**Confidence:** HIGH (based on existing codebase analysis + domain patterns)

---

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Word-level Color Blocks Overwriting Letter-level Color System

**What goes wrong:** Adding CEFR color blocks (green=within reach, yellow=too hard) conflicts with the existing letter-level color feedback (green=correct, red=wrong, yellow=hint). The visual layer becomes confusing — learners can't tell if yellow means "revealed by hint" or "CEFR level is hard".

**Why it happens:** The existing system uses letter-state classes (`.immersive-letter-cell--correct`, `.immersive-letter-cell--revealed`, `.immersive-letter-cell--wrong`) for typing feedback. CEFR levels are word-level attributes. These two systems operate at different granularity and both use color as the primary visual channel.

**Consequences:**
- Visual ambiguity: yellow means two different things simultaneously
- Accessibility issues: color-only distinction violates WCAG
- Learner confusion: can't interpret feedback correctly

**Prevention:**
1. **Never use the same colors for two different meanings.** Assign distinct palettes:
   - Keep existing letter states: green (correct typed), red (wrong typed), yellow (revealed by AI)
   - Use CEFR colors that don't overlap: teal/blue for i+1, amber/orange for beyond i+1
2. **Layer with shape/text, not just color.** Add a small badge, underline style, or border pattern for CEFR levels so color-blind users can distinguish
3. **Use CSS classes that combine both systems.** Example structure:

```css
/* Letter typing states (keep as-is) */
.immersive-letter-cell--correct { color: green; }
.immersive-letter-cell--revealed { color: amber; }

/* CEFR level overlays (new layer) */
.word-level-badge--i1 {
  background: rgba(20, 184, 166, 0.15); /* teal, not green */
  border: 1px solid oklch(0.72 0.17 175);
}
.word-level-badge--beyond {
  background: rgba(251, 146, 60, 0.15); /* orange, not amber/red */
  border: 1px solid oklch(0.75 0.18 60);
}
```

4. **Phase 1 must define the combined visual contract** before any rendering code is written

**Detection:** UAT with learners who are color-blind; code review checklist for color conflicts

**Which phase addresses it:** Phase that implements the CEFR display component (UI-SPEC.md required first)

---

### Pitfall 2: Cache Invalidation Failures for Lesson Analysis Results

**What goes wrong:** Batch analysis results cached in localStorage become stale. When a user changes their CEFR level setting, previously analyzed lessons still show old difficulty badges. Or: vocabulary data updates but cached results reference old thresholds.

**Why it happens:** The existing localStorage pattern in `learningSettings.js` uses a version key (`immersive_learning_settings_v2`) but doesn't version cache keys for lesson analysis. The cache key is typically based on lesson ID only, not on:
- User's CEFR level setting
- Version of the cefr_vocab.json data
- Vocabulary lookup algorithm version

**Consequences:**
- User changes level from B1 to A2, but old cached lessons still show B2 words as "easy"
- cefr_vocab.json is updated with better frequency data, but old analysis persists
- "This word is too hard" badge shows for words that are now A2

**Prevention:**
1. **Include all relevant version factors in cache key:**

```javascript
function buildAnalysisCacheKey(lessonId, userCefrLevel, vocabDataVersion) {
  return `lesson_analysis_v${CACHE_VERSION}:lesson=${lessonId}:level=${userCefrLevel}:vocab=${vocabDataVersion}`;
}
```

2. **Store cache metadata alongside results:**

```javascript
const cacheEntry = {
  version: CACHE_VERSION,
  vocabDataHash: computeVocabDataHash(), // detects vocab updates
  userLevelAtAnalysis: userCefrLevel,
  analyzedAt: Date.now(),
  results: [...]
};
```

3. **Implement cache invalidation on setting change.** When user changes CEFR level in profile, clear all lesson analysis caches or mark them for re-analysis.

4. **Use a cache TTL** (e.g., 30 days) as a safety net even if version detection fails.

**Detection:** Manual testing with level changes; cache size monitoring in DevTools

**Which phase addresses it:** Phase that implements the batch analysis and caching layer

---

### Pitfall 3: Batch Analysis Blocking Initial Lesson Load

**What goes wrong:** First-time lesson open triggers synchronous batch analysis of all subtitles. With 500+ sentences, this blocks the UI for 2-5 seconds. User sees a blank or frozen screen.

**Why it happens:** The existing system loads lessons lazily and defers heavy work. The new analysis step is added as a synchronous for-loop over all sentences and words, without:
- Chunking with `requestIdleCallback` or `setTimeout(0)`
- Progress reporting
- Cancellability

**Consequences:**
- App appears broken on slow devices
- Users may abandon before analysis completes
- Memory spikes if all intermediate results are held in memory

**Prevention:**
1. **Always use chunked processing with yields:**

```javascript
async function batchAnalyzeSentences(sentences, vocabLookup, onProgress) {
  const results = [];
  const chunkSize = 10;
  
  for (let i = 0; i < sentences.length; i += chunkSize) {
    const chunk = sentences.slice(i, i + chunkSize);
    const chunkResults = chunk.map(analyzeSentence); // CPU-bound but small chunks
    results.push(...chunkResults);
    
    if (onProgress) onProgress(i + chunk.length, sentences.length);
    
    // Yield to event loop every chunk
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  
  return results;
}
```

2. **Show a non-blocking progress indicator.** The existing system already has loading states — reuse them, don't replace them.

3. **Cache aggressively.** Analysis should only happen once per lesson. localStorage + IndexedDB for large result sets.

4. **Background-first pattern:** If analysis isn't complete, show the lesson without CEFR badges (graceful degradation). Add badges when analysis finishes.

**Detection:** Performance profiling with 500+ sentence lessons; console timing logs

**Which phase addresses it:** Phase that implements batch vocabulary analysis

---

### Pitfall 4: Scale Animation Conflicting with Wordbook Selection Feedback

**What goes wrong:** Adding a scale animation to word selection (as specified in v2.4) breaks the existing click/tap targeting. The animation triggers before the selection is confirmed, causing double-triggers, or the animation layer intercepts pointer events.

**Why it happens:** The existing wordbook selection uses `wordbookSelectedTokenIndexes` state with click handlers. The new scale animation likely uses CSS `transform: scale()` with `transition`. CSS transforms create a new stacking context and can intercept pointer events even when visually positioned over the same element.

**Consequences:**
- Double-add to wordbook (animation triggers click on parent)
- Selection feels "sluggish" because animation runs before state update
- On mobile: scale animation makes the token "jump away" from finger

**Prevention:**
1. **Use `transform` on a pseudo-element or inner wrapper, not the clickable element itself:**

```css
/* Good: animation is visual only, click target stays stable */
.word-token {
  position: relative;
  cursor: pointer;
}
.word-token::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 8px;
  background: var(--selection-color);
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 200ms, transform 200ms;
  pointer-events: none; /* Key: don't intercept clicks */
}
.word-token--selected::after {
  opacity: 1;
  transform: scale(1);
}
```

2. **Or use `transform` with `pointer-events: none` on the animated part:**

```css
.word-token--animating {
  animation: wordSelectPop 250ms ease-out forwards;
}
@keyframes wordSelectPop {
  0% { transform: scale(1); }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); }
}
.word-token--animating {
  pointer-events: none; /* Prevent during animation */
}
```

3. **Stop animation propagation on parent containers.** Check that `onClick` handlers on parent `.immersive-word-slot` don't fire twice.

4. **Test on actual mobile device** — CSS animations behave differently under touch than mouse.

**Detection:** Manual testing with rapid tapping; console should show no duplicate `addToWordbook` calls

**Which phase addresses it:** Phase that implements the wordbook selection animation

---

### Pitfall 5: CEFR Level Setting Not Persisting or Not Affecting Display

**What goes wrong:** User sets their CEFR level in profile center, but the setting doesn't update the vocabulary analysis results, or it doesn't persist across sessions.

**Why it happens:** The existing learning settings system uses localStorage with a specific key (`immersive_learning_settings_v2`). The new CEFR level setting may:
- Use a different storage key or no storage at all
- Not dispatch an event when changed (other settings dispatch `LEARNING_SETTINGS_UPDATED_EVENT`)
- Not be included in the settings migration path from v1

**Consequences:**
- User sets A2 level, but display still shows B1 content as "easy"
- User refreshes page, CEFR level resets to default B1
- User on desktop vs web sees different CEFR levels

**Prevention:**
1. **Follow the existing pattern exactly.** The system already has `readLearningSettings()` and `writeLearningSettings()`. Add CEFR level to the same settings object:

```javascript
// In learningSettings.js
export const DEFAULT_LEARNING_SETTINGS = {
  // ... existing fields ...
  cefrLevel: 'B1', // New field
};

// Add to sanitizeLearningSettings:
cefrLevel: sanitizeCefrLevel(rawSettings?.cefrLevel),

function sanitizeCefrLevel(value) {
  const validLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const normalized = String(value || '').toUpperCase();
  return validLevels.includes(normalized) ? normalized : 'B1';
}
```

2. **Dispatch update event when CEFR level changes.** Other components listen to `LEARNING_SETTINGS_UPDATED_EVENT` — CEFR display must subscribe too.

3. **Store CEFR level in the same localStorage key** to ensure desktop/web parity.

4. **Add migration path** if settings structure changes — existing v2 migration code should be extended.

**Detection:** Console log of settings on load; cross-session test (set level, close browser, reopen)

**Which phase addresses it:** Phase that implements the personal center CEFR level setting

---

## Moderate Pitfalls

Less catastrophic but still impactful issues.

### Pitfall 6: CEFR Display Causes Layout Shift in Cinema Mode

**What goes wrong:** Adding CEFR badges changes the height/width of word tokens, which shifts the layout of the sentence typing area. In cinema mode with the fixed-position typing panel, this causes content to jump or overlap with video.

**Why it happens:** The cinema mode uses absolute positioning for the typing panel (`position: absolute; bottom: ...`) with specific max-width constraints. Adding badges changes line wrapping and token dimensions.

**Prevention:**
- Use `box-sizing: border-box` and explicit sizing for CEFR badges
- Reserve vertical space for badges even when hidden (consistent height)
- Test at multiple viewport sizes with `max-content` vs `fixed-width` panels

**Which phase addresses it:** UI implementation phase with responsive testing

---

### Pitfall 7: Vocabulary Lookup Misses Common Word Variations

**What goes wrong:** Analysis marks "running" as C1 because it's not in the vocab list, but the base word "run" is B1. Or "didn't" isn't found, but "did" is.

**Why it happens:** The cefr_vocab.json uses exact token matching. English has massive morphological variation. The existing `normalizeToken` function handles some cases, but not all.

**Prevention:**
1. **Stemming before lookup:** Use a simple suffix-stripping algorithm (Porter stemmer light) before checking vocab
2. **Build lookup with common variations pre-computed**
3. **Graceful fallback:** Unknown words should be treated as "at or below current level" (safe default) rather than "too hard"

**Which phase addresses it:** Phase that implements the vocab analysis utility

---

### Pitfall 8: Multiple Lessons Share Analysis Cache Incorrectly

**What goes wrong:** User studies Lesson A, analysis is cached. Then opens Lesson B which shares some vocabulary with Lesson A. The shared words aren't re-analyzed, which is correct — but the shared words' difficulty relative to user's current level might differ based on lesson context.

**Why it happens:** Cache key uses lesson ID + vocab version. If two lessons have the same subtitle content (e.g., user re-generates the same video), the analysis is reused without considering lesson-specific word frequency.

**Prevention:**
- This is actually the **correct behavior** — don't overthink it
- Only issue if vocab data changes between analysis runs for the same lesson
- Cache invalidation on vocab update handles this

---

## Minor Pitfalls

Convenience issues that are easy to fix if caught early.

### Pitfall 9: CEFR Badge Text Too Small for Touch Targets

**What goes wrong:** Mobile learners can't tap the CEFR badge to get more info because it's too small or positioned awkwardly.

**Prevention:**
- Minimum touch target: 44x44px (Apple HIG)
- CEFR badge should be informational only, not a tap target itself
- Use tooltip on long-press, not tap

---

### Pitfall 10: History List CEFR Display Doesn't Match Immersive Mode

**What goes wrong:** Lessons in the history list show one style of CEFR badge, but immersive mode shows another. User experience is inconsistent.

**Prevention:**
- Define CEFR badge as a reusable component from day one
- Export from a shared location (`@/components/vocab/`)
- Document the component's variants (immersive mode, history list, wordbook)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| CEFR display component | Color conflicts with letter states | Define visual contract in UI-SPEC before coding |
| Batch analysis | UI blocking on first load | Chunked processing + progress indicator |
| localStorage caching | Stale cache after level change | Version-based cache keys with TTL |
| Wordbook animation | Click event conflicts | Pointer-events none on animated pseudo-element |
| CEFR level setting | Not persisting or not propagating | Follow existing settings pattern exactly |
| History list CEFR | Inconsistent with immersive mode | Shared CEFR badge component from day one |
| Vocab lookup | Missing word variations | Stemming + safe fallback for unknown words |

---

## Sources

- Existing codebase: `ImmersiveLessonPage.jsx`, `immersive.css`, `learningSettings.js`, `cefr_vocab.json`
- WCAG accessibility guidelines for color contrast
- React performance patterns: `requestIdleCallback` for chunking
- CSS `pointer-events` and transform stacking context behavior
