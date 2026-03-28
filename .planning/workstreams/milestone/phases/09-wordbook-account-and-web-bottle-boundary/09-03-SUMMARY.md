---
phase: 09-wordbook-account-and-web-bottle-boundary
plan: "03"
subsystem: backend-ui
tags: [wordbook, review, scheduler, react]
requires: []
provides:
  - Review metadata on canonical wordbook entries
  - Due-review queue and grade-driven review action
  - List-plus-review wordbook panel with memory score and next-review visibility
affects: [wordbook-api, immersion-collection, learning-shell/wordbook]
tech-stack:
  added: []
  patterns: [encapsulated-review-scheduler, due-queue-entry-point]
key-files:
  created:
    - app/services/wordbook_review_scheduler.py
    - migrations/versions/20260328_0031_wordbook_review_fields.py
  modified:
    - app/models/lesson.py
    - app/api/routers/wordbook.py
    - app/services/wordbook_service.py
    - frontend/src/features/wordbook/WordbookPanel.jsx
    - tests/integration/api/test_wordbook_api.py
key-decisions:
  - "Review state extends `WordbookEntry` directly instead of introducing a second identity table."
  - "Mastery is derived from `memory_score >= 0.85`, while the scheduler stays encapsulated in one backend service."
requirements-completed: [WBK-01, WBK-02, WBK-03, WBK-04]
duration: 43 min
completed: 2026-03-28
---

# Phase 09 Plan 03 Summary

The wordbook is no longer just a passive collection list. It now exposes due review, dynamic next-review scheduling, and a dedicated review mode inside the learning shell.

## Accomplishments

- Added `next_review_at`, `last_reviewed_at`, `review_count`, `wrong_count`, and `memory_score` to `WordbookEntry`.
- Created a conservative dynamic review scheduler with `again / hard / good / easy` grading and a `0.85` mastery threshold.
- Added review-queue and review-action APIs while keeping existing collection behavior and source lineage intact.
- Rebuilt the wordbook panel around a top-level `开始复习` entry, due metadata, and the four required review buttons.

## Task Commits

1. `7f8c3180` — `feat(phase-09): add wordbook review flow`

## Verification

- `pytest tests/integration/api/test_wordbook_api.py -q`
- `npm --prefix frontend run build`

