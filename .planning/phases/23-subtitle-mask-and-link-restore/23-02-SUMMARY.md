# Phase 23-02: 链接恢复增强 — SUMMARY

**Completed:** 2026-04-03
**Plan:** 23-02 | Phase: 23-subtitle-mask-and-link-restore

## Tasks Completed

1. ✅ Task 1: Add restore choice dialog (URL detection + AlertDialog)
   - Import AlertDialog components from shared/ui
   - Import hasLessonMedia from localMediaStore
   - Add restoreChoiceOpen + overwriteConfirmOpen state
   - Modify openRestorePicker: source_url check → dialog or file picker
   - Add handleLinkRestore: cache check → overwrite dialog or direct restore
   - Add submitLinkRestore: yt-dlp trigger via requestDesktopLocalHelper
   - Add handleOverwriteConfirm: calls submitLinkRestore after confirmation
   - Both AlertDialogs added to JSX

2. ✅ Task 2: Link restore with cache check (integrated in Task 1)
   - hasLessonMedia(lesson.id) called before triggering yt-dlp
   - Cached → overwriteConfirm dialog
   - Not cached → submitLinkRestore directly

3. ✅ Task 3: Add overwrite confirmation dialog (integrated in Task 1)
   - overwriteConfirmOpen state + AlertDialog
   - "取消" closes dialog, "覆盖" calls submitLinkRestore

## Key Decisions

| Decision | Implementation |
|----------|----------------|
| D-04 (统一入口) | openRestorePicker checks lesson?.source_url → dialog or file picker |
| D-05 (缓存检查) | hasLessonMedia(lesson.id) before yt-dlp trigger |

## Files Modified

- `frontend/src/features/lessons/LessonList.jsx`

## Implementation Details

### Helper Functions Added
- `hasDesktopRuntimeBridge()` — checks for `window.desktopRuntime?.requestLocalHelper`
- `requestDesktopLocalHelper()` — triggers yt-dlp via desktop bridge
- `isDesktop` constant — guards "按链接恢复" button visibility

### New State
- `restoreChoiceOpen` — controls restore choice dialog
- `overwriteConfirmOpen` — controls overwrite confirmation dialog

### New Functions
- `handleLinkRestore()` — closes choice dialog, checks cache, triggers restore or confirm
- `submitLinkRestore()` — calls yt-dlp endpoint, updates lesson
- `handleOverwriteConfirm()` — closes confirm dialog, calls submitLinkRestore

### Dialogs
1. **Restore Choice Dialog** — "选择恢复方式" with "恢复本地视频" and "按链接恢复" (desktop only)
2. **Overwrite Confirmation Dialog** — "本地已有视频，是否覆盖？" with "取消" and "覆盖"

## Verification

```bash
grep -n "restoreChoiceOpen\|source_url\|AlertDialogContent\|isDesktop" frontend/src/features/lessons/LessonList.jsx
grep -n "handleLinkRestore\|submitLinkRestore\|hasLessonMedia" frontend/src/features/lessons/LessonList.jsx
grep -n "overwriteConfirmOpen\|handleOverwriteConfirm" frontend/src/features/lessons/LessonList.jsx
```

## Commit

`23-02-PLAN.md` → commit for all 3 tasks
