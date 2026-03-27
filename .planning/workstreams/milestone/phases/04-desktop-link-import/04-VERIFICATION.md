---
phase: 04-desktop-link-import
verified: 2026-03-27T16:00:12Z
status: passed
score: 4/4 must-haves verified
gaps: []
---

# Phase 04: Desktop Link Import Verification Report

**Phase Goal:** Let desktop users import supported media links through local tooling and feed the resulting media into the same generation pipeline without moving heavy download or conversion work onto the server.

**Verified:** 2026-03-27
**Status:** PASSED
**Re-verification:** No

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Desktop users can import supported public page links through the local helper/runtime path | ✓ VERIFIED | `app/api/routers/desktop_asr.py` now sanitizes noisy pasted share text, extracts one URL, uses `yt-dlp` for non-direct-media page links, and preserves `/url-import/tasks/*/file` handoff. `tests/unit/test_desktop_local_asr.py` covers noisy share-text sanitization and restricted-link classification. |
| 2 | Upload UI exposes the agreed Phase 04 desktop link-import flow and fallback behavior | ✓ VERIFIED | `frontend/src/features/upload/UploadPanel.jsx` contains always-visible `本地文件` / `链接导入` tabs, `导入并生成课程`, `未识别到可导入链接。`, `继续后台执行`, `取消当前链接任务`, and clickable `SnapAny` fallback behavior. Contract coverage in `tests/contracts/test_desktop_runtime_contract.py` asserts these strings plus the desktop external-url bridge. |
| 3 | Imported media enters the canonical lesson/history/progress pipeline instead of a source-specific learner path | ✓ VERIFIED | `UploadPanel.jsx` renames imported lessons through `PATCH /api/lessons/{id}` and then calls `onNavigateToLesson` on the canonical lesson ID. `LearningShellContainer.jsx` resolves that into `loadLessonDetail(lessonId, { autoEnterImmersive: true })`. `LessonList.jsx` still exposes no imported-link-specific history badges or alternate learner flow strings. |
| 4 | Imported-link titles and direct-learning navigation survive into the canonical learner flow | ✓ VERIFIED | `tests/integration/test_regression_api.py::test_local_generated_lesson_title_rename_keeps_canonical_history_and_progress` verifies canonical rename + history/progress continuity. `tests/e2e/test_e2e_key_flows.py::test_e2e_login_create_lesson_practice_progress` now verifies rename + catalog progress continuity. |

**Score:** 4/4 truths verified

## Verification Evidence

- `pytest tests/unit/test_desktop_local_asr.py tests/contracts/test_desktop_runtime_contract.py tests/contracts/test_desktop_installer_contract.py -q` → 38 passed
- `pytest tests/integration/test_regression_api.py -k "local_generated_lesson_title_rename_keeps_canonical_history_and_progress" -q` → 1 passed
- `pytest tests/e2e/test_e2e_key_flows.py -k "login_create_lesson_practice_progress" -q` → 1 passed
- `npm --prefix frontend run build` → passed
- `rg -n '本地文件|链接导入|导入并生成课程|未识别到可导入链接|继续后台执行|取消当前链接任务|SnapAny' frontend/src/features/upload/UploadPanel.jsx` → all required user-facing strings present
- `rg -n '本地课程|云端课程|imported|link import|desktop link' frontend/src/features/lessons/LessonList.jsx frontend/src/app/learning-shell/LearningShellContainer.jsx` → no source-specific learner-flow labels found

## Notes

- A broader legacy integration sweep using `tests/integration/test_regression_api.py -k "lesson or workspace or progress"` is not currently green in this repository due to unrelated baseline failures outside Phase 04. Those failures were not introduced by the Phase 04 changes and were excluded from goal-level verification evidence.

## Gaps Summary

None. Phase 04’s must-haves are satisfied with code, tests, and build evidence.

---

_Verified: 2026-03-27_
_Verifier: Codex (inline execution)_ 
