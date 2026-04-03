---
phase: 21-material-import-ux-optimization
plan: 01
status: complete
created: 2026-04-02
---

## Plan 21-01 Summary

**Objective:** Change default upload tab from FILE to LINK (UPLOAD-01) and remove redundant explanation paragraphs from link tab (UPLOAD-02).

**Tasks Completed:**

### Task 1: Default Tab Changed to LINK
- `useState(DESKTOP_UPLOAD_SOURCE_MODE_FILE)` → `DESKTOP_UPLOAD_SOURCE_MODE_LINK` at Line 1795
- `pendingDesktopSourceMode` also changed to LINK at Line 1800 (pitfall fix)
- Both states now default to LINK tab

### Task 2: Link Tab Text Cleanup
- Placeholder updated: "粘贴公开单条视频链接，例如 https://www.youtube.com/watch?v=..." → "粘贴 YouTube、B站等公开视频链接"
- Two redundant `<p>` paragraphs removed from link tab (Lines 6836-6837):
  - Removed: "支持常见公开视频链接：YouTube、B站..."
  - Removed: "仅支持公开单条链接，不支持 cookies..."
- SnapAny fallback paragraph preserved (可点击)
- Two redundant paragraphs removed from error state block (Lines 7093-7094):
  - Removed same two messages in error state
- Constants `DESKTOP_LINK_PUBLIC_SUPPORT_MESSAGE` and `DESKTOP_LINK_PUBLIC_ONLY_MESSAGE` kept (used in error messages at lines 1219, 2235, 3604)

**Files Modified:**
- `frontend/src/features/upload/UploadPanel.jsx`

**Verification:**
- `grep "DESKTOP_UPLOAD_SOURCE_MODE_LINK"` → 2 useState defaults confirmed
- `grep "粘贴 YouTube、B站等公开视频链接"` → placeholder confirmed
- Constants still referenced in error messages (not removed)
