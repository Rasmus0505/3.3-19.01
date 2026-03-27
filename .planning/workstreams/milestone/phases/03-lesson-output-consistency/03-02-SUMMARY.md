---
phase: 03-lesson-output-consistency
plan: "02"
subsystem: history-learning-entry
tags: [history, learning, lazy-recovery, translation, progress]

# Dependency graph
requires:
  - phase: 03-01
    provides: Canonical lesson/task result contract
provides:
  - Source-agnostic history cards
  - Lazy translation recovery from history menu
  - Manual mark-completed action from history menu
affects:
  - 03-03 (shared generation-state and learner handoff)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Lazy recovery from history menu rather than eager recovery during list rendering
    - History refresh callback routed through the learning shell

key-files:
  created:
    - .planning/workstreams/milestone/phases/03-lesson-output-consistency/03-02-SUMMARY.md
  modified:
    - frontend/src/features/lessons/LessonList.jsx
    - frontend/src/app/learning-shell/LearningShellPanelContent.jsx
    - frontend/src/app/learning-shell/LearningShellContainer.jsx

key-decisions:
  - "History list must not expose local/cloud source badges"
  - "补翻译 stays lazy and only runs when the user explicitly triggers it from the history menu"
  - "标记学完 reuses the canonical lesson progress API rather than inventing a parallel completion flag"

patterns-established:
  - "History-menu recovery action writes subtitle variants into local supplemental storage keyed by canonical lesson ID"

requirements-completed:
  - LESS-02
  - LEARN-02

# Metrics
duration: 15min
completed: 2026-03-27
---

# Phase 03 Plan 02: History and Lesson Entry Summary

**Removed learner-facing source exposure from history cards and added lazy history-menu recovery actions for translation completion and manual lesson completion.**

## Performance

- **Duration:** 15 min
- **Completed:** 2026-03-27
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Removed the local/cloud source badges from `LessonList.jsx` so history stays source-agnostic
- Added a lazy `补翻译` action for `partial_ready` lessons that fetches lesson detail, regenerates a plain subtitle variant, and stores it as supplemental local recovery data
- Added a `标记学完` action that uses the canonical lesson progress API to mark all sentences completed
- Threaded an `onRefreshHistory` callback through the learning shell so history state refreshes after menu actions

## Verification

- `npm --prefix frontend run build` → success

## Issues Encountered

- History menu actions needed a refresh path after mutating progress, otherwise the user would see a success message without updated cards
- Solved by threading `onRefreshHistory` from `LearningShellContainer` down into `LessonList`

## Next Phase Readiness

- History now follows the agreed lazy-recovery model
- User-facing history flow no longer exposes runtime/source identity
- Ready for `03-03` upload-state and learner handoff cleanup/verification

---
*Phase: 03-lesson-output-consistency*
*Completed: 2026-03-27*
