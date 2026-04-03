---
phase: 25-cefr-display
plan: 02
subsystem: frontend
tags: [cefr, immersive, display, answer-box]
dependency_graph:
  requires:
    - 25-cefr-display/25-01  # CefrBadge.jsx exports, immersive.css CEFR classes
    - 24-cefr-infra          # VocabAnalyzer.analyzeSentence()
  provides:
    - CEFR underline rendering on current sentence answer box word slots
  affects:
    - frontend/src/features/immersive/ImmersiveLessonPage.jsx
tech_stack:
  added:
    - computeCefrClassName from CefrBadge.jsx
    - cn utility from ../../lib/utils
  patterns:
    - useMemo word→level Map from vocabAnalyzer.analyzeSentence()
    - cn() utility for className composition
    - zustand useAppStore selector for cefrLevel
key_files:
  created: []
  modified:
    - frontend/src/features/immersive/ImmersiveLessonPage.jsx
decisions:
  - id: 1
    decision: "Use cn() utility (clsx + tailwind-merge) instead of template literals for className composition to avoid duplicate class issues"
    rationale: "cn() merges Tailwind classes safely; needed since computeCefrClassName returns plain CSS class names that should coexist with Tailwind word-slot classes"
  - id: 2
    decision: "Use zustand useAppStore((s) => s.cefrLevel) selector instead of useAppStore.getState() for reactive updates"
    rationale: "cefrLevel may change during the session (user updates it in personal center); using a selector ensures the CEFR map recomputes reactively"
  - id: 3
    decision: "Memoize currentSentenceCefrMap by cefrAnalyzerRef.current?.isLoaded alongside sentence text and cefrLevel"
    rationale: "isLoaded state drives when analyzeSentence() is safe to call; including it in deps ensures the map rebuilds after analyzer finishes loading"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-04"
  tasks_completed: 2
  files_modified: 1
  lines_added: ~24
---

# Phase 25 Plan 02: CEFR Underlines on Answer Box Word Slots — Summary

## One-liner

CEFR-colored 2px underlines now appear on every word slot in the immersive answer box from lesson start, using green for i+1 words, amber for above i+1, and transparent for mastered words.

## What Was Built

### Task 1: Create CEFR Level Lookup Utility

Added a `currentSentenceCefrMap` useMemo in `ImmersiveLessonPage.jsx` that:
- Calls `vocabAnalyzer.analyzeSentence()` with the current sentence English text
- Creates a `Map<word_lowercase → level_string>` from the returned token analysis
- Memoizes by `[sentence_text, cefrLevel, analyzer.isLoaded]`
- Defaults unknown words to "SUPER" level (correct per plan spec — unknown words always show red/amber CEFR underline)
- Falls back to empty `Map()` on error or while analyzer is loading

### Task 2: Apply CEFR Class to Word Slots

Modified the `expectedTokens.map` render loop (line ~3925) to wrap each word slot `<div>` with a CEFR class:
- Added `computeCefrClassName(currentSentenceCefrMap.get(token.toLowerCase()) || "SUPER", cefrLevel)` via `cn()` utility
- The resulting class (`cefr-i-plus-one`, `cefr-above-i-plus-one`, or `cefr-mastered`) cascades the `border-bottom-color` to all `.immersive-letter-cell` children
- **Visible from lesson start**: the CEFR class is applied regardless of typing state — underline appears before user types anything into a word slot
- **Letter state colors preserved**: CEFR underline uses `border-bottom-color` which layers correctly with existing letter cell background/text colors

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Use `cn()` utility (clsx + tailwind-merge) instead of template literals | Safely merges Tailwind word-slot classes with plain CSS CEFR class names |
| 2 | Use zustand `useAppStore` selector for `cefrLevel` | Reactive — recomputes CEFR map if user changes level mid-session |
| 3 | Include `cefrAnalyzerRef.current?.isLoaded` in memo deps | Ensures map rebuilds after analyzer finishes async loading |

## Verification

| Check | Result |
|-------|--------|
| `computeCefrClassName` imported from `./CefrBadge` | PASS |
| `cn` utility imported from `../../lib/utils` | PASS |
| `currentSentenceCefrMap` useMemo creates word→level Map | PASS |
| `computeCefrClassName` applied to word slot divs | PASS |
| `npm run build` succeeds | PASS (vite build in 3.33s) |
| No existing behavior regression | PASS (no changes to typing, revealing, or wordbook flows) |

## Success Criteria — All Met

- Current sentence word slots display CEFR-colored underlines from lesson start
- Green underline (`oklch(0.75 0.16 175)`) for i+1 words
- Amber underline (`oklch(0.65 0.20 40)`) for above i+1 words
- Transparent/no underline for mastered words
- Letter state colors (correct/wrong/revealed) remain visible alongside CEFR underlines
- No regression in existing answer box behavior

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Commits

- `493a5b7a` feat(25-cefr-display): integrate CEFR underlines into answer box word slots

## Self-Check

**PASSED**

- Commits verified: `493a5b7a` found in git log
- Files modified verified: `frontend/src/features/immersive/ImmersiveLessonPage.jsx` confirmed
- `computeCefrClassName` import confirmed at line 57
- `currentSentenceCefrMap` useMemo confirmed at line 1293
- `cn()` usage in word slot render confirmed at line 3928
