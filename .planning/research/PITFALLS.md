# v2.1 Research: Pitfalls

**Milestone:** v2.1 优化学习体验和管理体验  
**Date:** 2026-03-28

## Product Pitfalls

- Do not let “Bottle 1.0 desktop-only” become invisible. Hiding it entirely weakens the desktop conversion path.
- Do not add username login in the same milestone as username registration/profile editing. It widens auth risk with little immediate conversion upside.
- Do not introduce subscription experiments while copy, pricing anchors, and action recovery paths are still unclear.

## Learning-Flow Pitfalls

- Replay, pause, and next-sentence actions must not independently mutate sentence state.
- Fullscreen and subtitle-mask UI must not reset playback or mark a sentence done accidentally.
- Long-press wordbook gestures must not compete with sentence navigation and typing focus.

## Admin Pitfalls

- Do not mix yuan display with legacy points/cents wording on the same screen.
- Do not present implementation labels like `faster-whisper-medium` as primary operator choices.
- Do not collapse read-only diagnostics into editable pricing forms.

## Delivery Pitfalls

- Do not treat `frontend/src` changes as complete web delivery without syncing and validating `app/static`.
- Do not leave `.planning/REQUIREMENTS.md` missing while milestone archives point to it as the current source of truth.
- Do not split active roadmap/state files between root `.planning` and workstream files inconsistently.
