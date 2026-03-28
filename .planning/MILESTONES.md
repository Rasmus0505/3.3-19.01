# Milestones

## v2.0 Billing, Admin & Polish (Shipped: 2026-03-28)

**Phases completed:** 5 phases, 13 plans, 28 tasks

**Key accomplishments:**

- Frontend-only cleanup of admin pages and billing entry points:
- Aligned local/cloud learner-facing lesson result metadata and removed duplicate task schema declarations so Phase 03 now has one canonical lesson/task contract to build on.
- Removed learner-facing source exposure from history cards and added lazy history-menu recovery actions for translation completion and manual lesson completion.
- Finished the shared generation-state cleanup by making upload success/degraded-success rendering use the canonical display snapshot and by adding regression coverage for partial-success task fields.
- Shipped the Phase 04 desktop link-import entry flow with explicit source tabs, yt-dlp-backed page-link ingestion, and contract coverage for noisy pasted links plus SnapAny fallback behavior.
- Completed the imported-link handoff by renaming imported lessons through the canonical lesson record and entering learning directly through the existing learning shell.

---
