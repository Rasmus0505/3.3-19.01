---
phase: 25-cefr-display
plan: "03"
type: execute
subsystem: frontend-cefr-display
tags: [cefr, wordbook, animation, immersive]
dependency_graph:
  requires:
    - 25-cefr-display/25-01 (CSS classes, computeCefrClassName)
    - 25-cefr-display/25-02 (currentSentenceCefrMap pattern)
  provides:
    - CEFR color bands on wordbook sentence word blocks
    - Wordbook success scale animation + green border flash
  affects:
    - frontend/src/features/immersive/ImmersiveLessonPage.jsx
tech_stack:
  added:
    - wordbookSentenceCefrMap useMemo
    - wordbookSuccessAnimationIndexes state
  patterns:
    - CEFR class application via computeCefrClassName
    - CSS animation class toggling
key_files:
  created: []
  modified:
    - frontend/src/features/immersive/ImmersiveLessonPage.jsx
decisions:
  - Used "SUPER" as fallback for words without CEFR data (maps to cefr-above-i-plus-one per CefrBadge logic)
  - Animation timeout set to 400ms to cover both scale (200ms) and border flash (350ms) CSS animations
metrics:
  duration: "~5 min"
  completed: "2026-04-04"
---

# Phase 25 Plan 03: CEFR Color Bands on Wordbook Sentence + Success Animation Summary

## One-liner
CEFR color bands applied to previous sentence wordbook tokens with scale + border flash animation on wordbook entry submission.

## What Was Built

### Task 1: CEFR Color Bands on Wordbook Sentence
Added `wordbookSentenceCefrMap` useMemo that analyzes the wordbook sentence (previous or current sentence) using `cefrAnalyzerRef.current` and builds a word→level Map. Each wordbook token button now receives the computed CEFR class via `computeCefrClassName()`:

- i+1 words: teal-green 2px bottom border (`.cefr-i-plus-one`)
- >i+1 words: amber-red 2px bottom border (`.cefr-above-i-plus-one`)
- Mastered words: no visible border

### Task 2: Wordbook Success Animation
Added `wordbookSuccessAnimationIndexes` state. When `collectWordbookEntry` succeeds, the selected token indexes are stored and the `wordbook-token--success` class is applied, triggering:

- Scale animation: 1.0 → 1.08 → 1.0 over 200ms (`.wordbook-success-scale` keyframes)
- Green border flash: transparent → oklch(0.69 0.14 155) → transparent over 350ms (`.wordbook-success-border-flash` keyframes)

Animation clears after 400ms via `setTimeout`.

## Verification
- Build succeeded: `npm run build` completed without errors
- `wordbookSentenceCefrMap` useMemo exists (line ~1308)
- `wordbookSuccessAnimationIndexes` state exists (line ~989)
- CEFR class applied to wordbook token buttons (lines ~4005-4009)
- CSS classes `.cefr-i-plus-one.immersive-wordbook-token` and `.wordbook-token--success` coexist on same element

## Success Criteria Met
- [x] Previous sentence word blocks display CEFR color bands
- [x] i+1 words have teal-green band, >i+1 words have amber-red band, mastered words have no band
- [x] Clicking "加入生词本" triggers scale animation + green border flash
- [x] Selected state (bg-slate-200) and CEFR band coexist without conflict
- [x] No regression: existing wordbook interaction unchanged

## Deviations from Plan
None - plan executed exactly as written.

## Known Stubs
None.
