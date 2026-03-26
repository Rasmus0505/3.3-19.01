---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: ready
stopped_at: Phase 01.1 complete
last_updated: "2026-03-27T01:45:00+08:00"
last_activity: 2026-03-27 - Completed quick task 260327-2ca for DashScope workspace summary recovery
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 5
  completed_plans: 5
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.
**Current focus:** Phase 02 - desktop-local-generation

## Current Position

Phase: 02 (desktop-local-generation) - READY
Plan: Not started
Status: Phase 01.1 complete - ready for next phase planning
Last activity: 2026-03-27 - Completed quick task 260327-2ca for DashScope workspace summary recovery

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 3
- Average duration: 18 min
- Total execution time: 72 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | 54 min | 18 min |
| 01.1 | 2 | 89 min | 45 min |

**Recent Trend:**

- Last 5 plans: 01.1-02 (71 min), 01.1-01 (18 min), 01-03 (5 min), 01-02 (29 min), 01-01 (20 min)
- Trend: Stable

| Phase 01 P01 | 20 min | 2 tasks | 2 files |
| Phase 01 P02 | 29 min | 2 tasks | 2 files |
| Phase 01 P03 | 5 min | 2 tasks | 2 files |
| Phase 01.1-fix-asr-subtitle-recognition-403-file-access-failures P01 | 18 min | 2 tasks | 3 files |
| Phase 01.1-fix-asr-subtitle-recognition-403-file-access-failures P02 | 71 min | 2 tasks | 7 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: Desktop client is the complete capability surface.
- [Init]: Web centers on Bottle 2.0 and browser-safe capabilities.
- [Init]: Platform-managed billing/keys replace user-managed ASR secrets.
- [Phase 01]: Treat dashscope_file_id as the canonical cloud object key across request-url, task artifacts, and generation entrypoints. - The direct-upload path already works end-to-end when the same object key is preserved. Locking that contract in tests prevents the request-url response and task creation path from drifting apart.
- [Phase 01.1-fix-asr-subtitle-recognition-403-file-access-failures]: Retry direct-upload ASR once only for ASR_TASK_FAILED plus FILE_403_FORBIDDEN, refreshing the signed URL from the canonical dashscope_file_id.
- [Phase 01.1-fix-asr-subtitle-recognition-403-file-access-failures]: Persist dashscope_recovery metadata on recovered lessons and map exhausted retries to DASHSCOPE_FILE_ACCESS_FORBIDDEN instead of a generic cloud outage.
- [Post Phase 01.1]: For browser direct-upload, return `oss://<file_id>` from the upload-policy response, prefer that resource URL for ASR task creation, and enable `X-DashScope-OssResourceResolve` instead of requiring `Files.get()` to expose an HTTPS signed download URL.

### Roadmap Evolution

- Phase 01.1 inserted after Phase 1: Fix ASR subtitle recognition 403 file access failures (URGENT)

### Pending Todos

None yet.

### Blockers/Concerns

- Product still needs a precise low-server-load Bottle 2.0 web media path.
- Browser and desktop capability boundaries must be communicated clearly.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260327-1xf | Fix LessonService._build_one_lesson missing in DashScope course generation path | 2026-03-27 | 4037e2f9 | [260327-1xf-fix-lessonservice-build-one-lesson-missi](../../quick/260327-1xf-fix-lessonservice-build-one-lesson-missi/) |
| 260327-2ca | Fix persist_lesson_workspace_summary signature mismatch in DashScope save stage | 2026-03-27 | pending | [260327-2ca-fix-persist-lesson-workspace-summary-sig](../../quick/260327-2ca-fix-persist-lesson-workspace-summary-sig/) |

## Session Continuity

Last session: 2026-03-27T00:07:16.8852418+08:00
Stopped at: Phase 01.1 complete
Resume file: .planning/workstreams/milestone/phases/01.1-fix-asr-subtitle-recognition-403-file-access-failures/01.1-VERIFICATION.md
