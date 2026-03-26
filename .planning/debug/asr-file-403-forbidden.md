---
status: investigating
trigger: "Investigate issue: asr-file-403-forbidden-chinese-path"
created: 2026-03-27T00:00:00+08:00
updated: 2026-03-27T00:14:00+08:00
---

## Current Focus

hypothesis: Direct-upload objects are stored under raw filenames, including non-ASCII names like `测试.mp4`; DashScope ASR later rejects access to that object, and the existing retry only refreshes the signed URL for the same inaccessible key.
test: Patch the upload policy to emit an ASCII-safe object key while preserving the original filename separately for lesson/task metadata, then run focused unit and integration tests covering Unicode upload names and provider-style `dashscope-instant/...` ids.
expecting: If non-ASCII object keys are the root cause, the new tests will prove future tasks can use sanitized storage ids without losing the original human filename.
next_action: run focused pytest targets for `test_dashscope_upload_router.py` and the new regression in `test_regression_api.py`

## Symptoms

expected: subtitle recognition should succeed for uploaded media and continue lesson generation.
actual: task fails during subtitle recognition with `DASHSCOPE_FILE_ACCESS_FORBIDDEN`; provided file id includes a full DashScope path ending in a Chinese filename.
errors: `DASHSCOPE_FILE_ACCESS_FORBIDDEN`; first_failure_stage=`asr_task`; prior provider detail maps to `FILE_403_FORBIDDEN`.
reproduction: upload a file such as `测试.mp4`, then trigger the cloud ASR lesson flow.
started: observed again on 2026-03-27 after Phase 01.1 had already added signed-url lookup and one retry for DashScope 403 failures.

## Eliminated

- hypothesis: The remaining bug is mainly a missing task-stage retry for DashScope 403 failures.
  evidence: `lesson_service.py` already retries once by resolving a fresh signed URL and re-running `transcribe_signed_url`, but it reuses the same `dashscope_file_id` both times.
  timestamp: 2026-03-27T00:12:00+08:00

- hypothesis: Signed-url lookup itself is the primary failure.
  evidence: The reported failure is `FILE_403_FORBIDDEN` during `asr_task`/`asr_transcribe`, which only occurs after `_resolve_dashscope_asr_source_url()` has already produced a URL and `QwenTranscription.async_call()` has started the task.
  timestamp: 2026-03-27T00:13:00+08:00

## Evidence

- timestamp: 2026-03-27T00:04:00+08:00
  checked: .planning/debug/knowledge-base.md
  found: No knowledge base file exists yet for prior ASR 403 investigations.
  implication: There is no previously archived root cause to reuse; investigation must proceed from code and tests.

- timestamp: 2026-03-27T00:05:00+08:00
  checked: repository-wide search for `dashscope_file_id`, `FILE_403_FORBIDDEN`, `Files.get`, and `dashscope-instant`
  found: `lesson_service.py` calls `get_file_signed_url(dashscope_file_id)` directly, `dashscope_storage.py` forwards `file_id` directly to `Files.get`, and no canonicalization helper for provider-prefixed ids exists in the upload or storage path.
  implication: Canonical file-id handling is the leading hypothesis; existing retry logic likely repeats the same invalid lookup target.

- timestamp: 2026-03-27T00:10:00+08:00
  checked: `frontend/src/features/upload/UploadPanel.jsx`, `app/api/routers/dashscope_upload.py`, and `app/services/lesson_command_service.py`
  found: The upload flow preserves the raw basename into the DashScope object key, and lesson-task creation derives the human `source_filename` from that same storage key.
  implication: A storage-key fix must sanitize the uploaded object name and separately preserve the original filename for task metadata.

- timestamp: 2026-03-27T00:11:00+08:00
  checked: Existing unit and integration regressions around DashScope 403 recovery
  found: Coverage only uses ASCII file ids such as `uploads/.../dashscope_403.mp4`; there is no regression for provider-style `dashscope-instant/...` ids or non-ASCII filenames.
  implication: The phase-01.1 fix could pass all tests while still failing for Unicode direct-upload object keys.

## Resolution

root_cause:
fix:
verification:
files_changed: []
