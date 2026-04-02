# Phase 18 Plan 04: Translation Dialog & Local Translation Summary

**Phase:** 18-wordbook-management-improvements
**Plan:** 18-04
**Created:** 2026-04-02
**Status:** Complete

---

## Plan Overview

Implement TranslationDialog component for local translation of selected text, with translate button in list items and review mode.

---

## Requirements Addressed

- **WORD-05**: 局部翻译

---

## Tasks Completed

### Task 18-04.1: Create TranslationDialog Component

Created `frontend/src/features/wordbook/TranslationDialog.jsx`:

**Acceptance Criteria:**
- [x] File `frontend/src/features/wordbook/TranslationDialog.jsx` exists
- [x] Dialog uses shadcn Dialog component
- [x] Dialog opens with selected text displayed
- [x] Loading state with spinner (`Loader2` from lucide-react)
- [x] Error state with retry button
- [x] Translation result displayed in dialog

**Implementation:**
```jsx
// Key features:
// - Uses Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
// - Loading state shows animated spinner with "翻译中..." text
// - Error state shows AlertCircle icon and retry button
// - Translation result displayed in styled box with primary/5 background
// - Calls /api/wordbook/translate endpoint via apiCall prop
```

### Task 18-04.2: Add Translate Button and Dialog State

Updated `frontend/src/features/wordbook/WordbookPanel.jsx`:

**Acceptance Criteria:**
- [x] TranslationDialog imported in WordbookPanel
- [x] Translation state managed with useState: `{ open: boolean, text: string }`
- [x] Translate button visible in list item actions (icon: Languages from lucide-react)
- [x] Clicking translate opens dialog with selected text
- [x] Dialog calls `/api/wordbook/translate` endpoint
- [x] Translate button also in review mode context section

**Implementation:**
- Added `Languages` import from lucide-react
- Added `TranslationDialog` import
- Added `translationDialog` state with `useState({ open: false, text: "" })`
- Added `openTranslationDialog` and `closeTranslationDialog` callback handlers
- Added translate button next to delete button in list items (with `size-4` icon)
- Added translate button in review mode context section (with `size-3` icon, smaller variant)
- Added TranslationDialog component before closing Card tag

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/features/wordbook/TranslationDialog.jsx` | **New file** - Translation dialog component |
| `frontend/src/features/wordbook/WordbookPanel.jsx` | Added translation state, handlers, buttons, and dialog |

---

## Key Decisions

| # | Decision | Source |
|---|----------|--------|
| D-18-03 | 局部翻译调用 API 重新获取 | Context |
| D-18-08 | 局部翻译 API 使用 qwen-mt-flash 模型 | Context |
| D-18-09 | 用户选中单词/短语后实时调用 API | Context |

---

## Notes

- The translation dialog is designed for on-demand translation of entry text
- Dialog auto-triggers translation when opened with text
- Error handling includes retry functionality
- Loading state provides visual feedback during API call
- Translation button appears in both list view and review mode for accessibility

---

## Related Plans

- **18-01**: Batch Operations Backend (translate endpoint dependency)
- **18-02**: Frontend Batch Selection (UI patterns)
- **18-03**: Tooltip System Enhancement (HINT-01, HINT-02)

---

## Verification

- [x] TranslationDialog component renders correctly
- [x] Dialog opens with selected text
- [x] Loading spinner appears during translation
- [x] Translation result displays in dialog
- [x] Error state shows with retry button
- [x] Translate button visible in list item actions
- [x] Translate button visible in review mode
- [x] Dialog calls `/api/wordbook/translate` endpoint

---

*Plan 18-04 Summary created: 2026-04-02*
