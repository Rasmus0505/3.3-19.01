---
phase: 35-material-intake-diagnostic-card
plan: 01
subsystem: ui
tags: [react, reading, indexeddb, cefr, diagnostics]
requires:
  - phase: 24-cefr-infra
    provides: user CEFR level persistence and local vocab analysis inputs
  - phase: 25-cefr-display
    provides: CEFR distribution semantics and segmented visual language
  - phase: 33-rewrite-ui-enhancement
    provides: reading rewrite rendering and persisted rewrite record model
provides:
  - pre-generation diagnostic stage in the reading workspace
  - persisted diagnostic draft state with target-level override
  - history resume path for diagnosed-but-not-generated materials
affects: [phase-36-pipeline-orchestrator, reading-workspace, app-static]
tech-stack:
  added: []
  patterns:
    - persisted diagnostic snapshot stored in the existing reading_rewrites_v3 IndexedDB record
    - reading workspace flow split into input -> diagnostic -> reading
key-files:
  created:
    - frontend/src/features/reading/DiagnosticPanel.jsx
    - frontend/src/features/reading/readingDiagnostics.js
    - frontend/src/features/reading/readingDiagnostics.test.js
  modified:
    - frontend/src/features/reading/ReadingPage.jsx
    - frontend/src/features/reading/HistoryPanel.jsx
    - frontend/src/features/reading/readingRewriteDB.js
    - frontend/src/hooks/useReadingRewrite.js
    - frontend/src/features/reading/reading.css
key-decisions:
  - "Diagnostic state extends the existing rewrite record instead of creating a second local store."
  - "Target-level override is honored end-to-end by passing the selected target into handleRewrite()."
  - "History resumes diagnosed drafts back into the diagnostic stage instead of reopening the raw textarea."
patterns-established:
  - "Reading draft persistence: one IndexedDB record can represent diagnosed and generated states."
  - "Diagnostic-first generation: user-visible analysis always precedes AI rewrite in the reading flow."
requirements-completed: [DIAG-01, DIAG-02, DIAG-03, DIAG-04]
duration: 88min
completed: 2026-04-10
---

# Phase 35: Material Intake & Diagnostic Card Summary

**The reading workspace now stops at a resumable diagnostic dashboard before generation, with editable A1-C2 target selection and persisted pre-generation state.**

## Performance

- **Duration:** 88 min
- **Started:** 2026-04-10T14:06:00+08:00
- **Completed:** 2026-04-10T15:33:38.5369221+08:00
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Replaced submit-time auto-rewrite with a true diagnostic stage inside the reading workspace.
- Persisted diagnostic snapshots, target-level overrides, and resume state in the existing `reading_rewrites_v3` IndexedDB record.
- Added a competition-style diagnostic dashboard plus history badges so diagnosed drafts reopen directly into `继续生成`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add a diagnostic data contract and persistable draft state** - `b8c5499` (`feat(reading): persist diagnostic drafts`)
2. **Task 2: Replace submit-time auto-rewrite with a resumable diagnostic stage** - `1b879a2` (`feat(reading): add diagnostic gate ui`)
3. **Task 3: Sync static web output and verify the web delivery contract** - `5952cbf` (`build(web): sync app static for reading diagnostics`)

**Plan metadata:** `ff681dd` (`docs(35): add research plan and ui spec`)

## Files Created/Modified
- `frontend/src/features/reading/DiagnosticPanel.jsx` - 诊断台右侧仪表板与 CTA 区
- `frontend/src/features/reading/readingDiagnostics.js` - 诊断快照、推荐目标等级、影响统计的纯函数层
- `frontend/src/features/reading/readingDiagnostics.test.js` - 诊断 helper 单测
- `frontend/src/features/reading/ReadingPage.jsx` - 输入 -> 诊断 -> 阅读 三段式流程
- `frontend/src/features/reading/HistoryPanel.jsx` - 历史状态徽章与诊断恢复逻辑
- `frontend/src/features/reading/readingRewriteDB.js` - 诊断快照与 flowStatus 的本地持久化
- `frontend/src/hooks/useReadingRewrite.js` - target override、diagnostic persistence、generated flow state
- `frontend/src/features/reading/LeftPanel.jsx` - 支持在诊断态复用左侧预览而不显示“重新输入”浮钮
- `frontend/src/features/reading/reading.css` - 诊断仪表板、历史徽章、响应式布局样式
- `app/static/index.html` - 同步后的网页端入口静态资源引用

## Decisions Made

- 诊断阶段完全复用现有 reading workspace，而不是新建 route；这样历史、阅读预览、后续 rewrite 状态可以共享一套本地数据。
- `diagnosticSnapshot` 放进现有 rewrite record，比再建一套 diagnostics DB 更容易保证 resume 行为和 Phase 36 的阅读包演进兼容。
- 目标等级不是只影响展示，而是直接传入 `handleRewrite()`，确保“用户看到的目标等级”和“真实生成使用的目标等级”一致。

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- UI-SPEC 在执行前有一个 typography blocker：诊断台左侧预览引入了额外字号。已在实现前修正为复用现有 role scale，然后继续执行。
- `HistoryPanel.jsx` 仍在清理旧的 `reading_rewrites_v2`，实现时一并切换到当前 `reading_rewrites_v3`，避免诊断草稿残留。

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 36 现在可以直接在这个诊断前置流上接入阶段化生成 orchestration。
- 已经具备继续生成前的 target-level contract、resume contract、history draft state，不需要在下一阶段重新定义入口。

---
*Phase: 35-material-intake-diagnostic-card*
*Completed: 2026-04-10*
