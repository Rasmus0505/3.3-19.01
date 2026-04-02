---
status: verifying
trigger: "wordbook batch API errors - batch-delete returns 405, batch-status returns 422"
created: 2026-04-02T00:00:00.000Z
updated: 2026-04-02T00:00:00.000Z
---

## Current Focus

**Fix applied.** Verifying by checking syntax and reviewing changes.

## Symptoms

expected: |
  - POST /api/wordbook/batch-delete should delete words in batch
  - PATCH /api/wordbook/batch-status should update word status in batch
  
actual: |
  - POST https://351636.preview.aliyun-zeabur.cn/api/wordbook/batch-delete returns 405 (Method Not Allowed)
  - PATCH https://351636.preview.aliyun-zeabur.cn/api/wordbook/batch-status returns 422 (Unprocessable Content)

errors: HTTP 405, HTTP 422
reproduction: Triggered from WordbookPanel UI when user attempts batch delete or batch-status update
started: Recent phase 18 implementation

## Eliminated

## Evidence

- timestamp: 2026-04-02
  checked: app/api/routers/wordbook.py routes and frontend WordbookPanel.jsx
  found: |
    Frontend calls:
    - POST /api/wordbook/batch-delete with {entry_ids: []}
    - PATCH /api/wordbook/batch-status with {entry_ids: [], status: "mastered"}
    - PATCH /api/wordbook/batch-move with {entry_ids: [], target_list_id}
    
    Backend had (wrong):
    - POST /batch/delete (slash, word_ids)
    - POST /batch/status (POST, word_ids, is_learned)
    - POST /batch/move (POST, word_ids)
    - POST /batch/translate (slash, word_ids)

## Resolution

root_cause: |
  URL path and HTTP method mismatches between frontend calls and backend routes:
  - Frontend uses hyphen (batch-delete), backend used slash (batch/delete)
  - batch-status used wrong HTTP method (POST vs PATCH)
  - All schemas used 'word_ids' but frontend sends 'entry_ids'
  - batch-status schema expected 'is_learned: bool' but frontend sends 'status: str'
  
fix: |
  Updated 4 batch endpoints in wordbook.py:
  - POST /batch-delete -> now uses entry_ids
  - PATCH /batch-status -> now uses entry_ids and status string
  - PATCH /batch-move -> now uses entry_ids
  - POST /batch-translate -> now uses entry_ids
  
  Updated 4 schemas in wordbook.py:
  - BatchDeleteRequest: word_ids -> entry_ids
  - BatchStatusUpdate: word_ids, is_learned -> entry_ids, status
  - BatchMoveRequest: word_ids -> entry_ids
  - BatchTranslateRequest: word_ids -> entry_ids
  
verification: |
  - Python syntax verified ✓
  - Need deployment to preview to verify end-to-end
  
files_changed:
  - app/api/routers/wordbook.py
  - app/schemas/wordbook.py
