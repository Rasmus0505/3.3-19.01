# Quick Task 260328-l5z Summary

**Task:** Fix desktop link import forcing Bottle 1.0 local generation after Bilibili download
**Date:** 2026-03-28
**Status:** Completed

## Outcome

- Updated `frontend/src/features/upload/UploadPanel.jsx` so desktop link-import success now calls the normal `submit(...)` flow instead of forcing `submitDesktopLocalFast(...)`.
- Added explicit `bypassDesktopLinkMode` and `sourceDurationSec` handling so the downloaded file can continue through the current user-selected generation strategy without re-entering the link-import branch.
- Added a desktop runtime contract test locking the post-download handoff behavior in `tests/contracts/test_desktop_runtime_contract.py`.

## Verification

- `python -m pytest tests\\contracts\\test_desktop_runtime_contract.py -k "link_import or normal_submit_strategy"`
- `npm --prefix frontend run build`
- Real helper replay with the user-provided Bilibili link: download succeeded and `/api/desktop-asr/generate` completed with `lesson_status=partial_ready`

## Notes

- Writing the generated lesson into the repo's current SQLite runtime remains blocked by pre-existing schema/migration issues unrelated to this quick-task fix.
