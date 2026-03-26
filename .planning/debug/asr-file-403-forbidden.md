---
status: resolved
trigger: "Investigate issue: asr-file-403-forbidden-chinese-path"
created: 2026-03-27T00:00:00+08:00
updated: 2026-03-27T01:11:20.9538175+08:00
---

## Current Focus

hypothesis: The remaining failure is caused by relying on `Files.get()` to expose a separate HTTPS signed download URL, while the browser direct-upload path already has a valid DashScope object resource and should submit that resource directly to ASR.
test: Return `oss://<file_id>` from the upload-policy response, make lesson generation prefer that client-provided resource URL, and enable DashScope OSS resource resolution headers during ASR task creation.
expecting: If metadata lookup is the brittle link, direct-upload ASR should proceed without `DASHSCOPE_STORAGE_SIGNED_URL_MISSING` even when `Files.get()` no longer returns a usable HTTPS download URL.
next_action: resolved; keep the focused direct-upload unit and integration regressions as the guardrail

## Symptoms

expected: subtitle recognition should succeed for uploaded media and continue lesson generation.
actual: task can fail before or during subtitle recognition because the direct-upload flow asks `Files.get()` for an HTTPS signed URL and receives no usable download address (`DASHSCOPE_STORAGE_SIGNED_URL_MISSING`), even though the uploaded DashScope object itself is valid.
errors: `DASHSCOPE_STORAGE_SIGNED_URL_MISSING`; existing downstream recovery path also covered `DASHSCOPE_FILE_ACCESS_FORBIDDEN` / provider `FILE_403_FORBIDDEN`.
reproduction: upload media through the browser direct-upload path, receive a provider-style `dashscope-instant/...` file id, then trigger the cloud ASR lesson flow when the metadata lookup no longer returns a separate HTTPS download URL.
started: observed again on 2026-03-27 after Phase 01.1 had already added signed-url lookup and one retry for DashScope 403 failures.

## Eliminated

- hypothesis: The remaining bug is mainly a missing task-stage retry for DashScope 403 failures.
  evidence: The current incident reproduces with `DASHSCOPE_STORAGE_SIGNED_URL_MISSING`, which occurs before the existing retry branch runs.
  timestamp: 2026-03-27T01:02:00+08:00

- hypothesis: Non-ASCII storage keys are the root cause.
  evidence: The browser upload route already sanitizes object-key filenames, and the current provider file id can fail even when the issue is the absence of a separate HTTPS signed URL in metadata lookup.
  timestamp: 2026-03-27T01:04:00+08:00

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

- timestamp: 2026-03-27T00:58:00+08:00
  checked: Local DashScope SDK source plus project upload flow
  found: DashScope's own OSS upload helper returns `oss://<key>` directly, and several SDK features enable `X-DashScope-OssResourceResolve` when submitting `oss://` resources. The browser upload flow was not returning that resource URL to lesson creation.
  implication: The direct-upload ASR path should use the already-valid `oss://` object resource instead of requiring `Files.get()` to mint a separate HTTPS download URL.

- timestamp: 2026-03-27T01:08:00+08:00
  checked: Focused unit and integration regressions after patching the upload/ASR path
  found: `tests/unit/test_dashscope_upload_router.py`, `tests/unit/test_lesson_service_dashscope_url.py`, `tests/unit/test_asr_dashscope.py`, and focused direct-upload regressions in `tests/integration/test_regression_api.py` all passed.
  implication: The browser direct-upload path now survives the metadata-lookup variant without regressing the previously added 403 retry/diagnostics behavior.

## Resolution

root_cause:
- Browser direct-upload relied on `Files.get(file_id)` to expose a separate HTTPS signed download URL before creating the ASR task.
- DashScope's direct-upload object was already valid as an `oss://` resource, but the app was not returning or preferring that resource URL from the upload-policy response.
- When metadata lookup omitted a usable signed URL, the request failed early with `DASHSCOPE_STORAGE_SIGNED_URL_MISSING`, which sat upstream of the existing Phase 01.1 retry logic.
fix:
- Return `file_url=oss://<file_id>` from `app/api/routers/dashscope_upload.py`.
- Prefer client-provided `oss://` resource URLs in `app/services/lesson_service.py` instead of forcing a signed-URL lookup first.
- Enable `X-DashScope-OssResourceResolve` for `oss://` inputs in `app/infra/asr_dashscope.py` and `app/infra/asr/dashscope.py`.
- Add focused unit coverage for upload response shape, `oss://` preference, and ASR-header behavior.
verification:
- `pytest tests/unit/test_dashscope_upload_router.py tests/unit/test_lesson_service_dashscope_url.py tests/unit/test_asr_dashscope.py -q`
- `pytest tests/integration/test_regression_api.py::test_dashscope_file_id_create_lesson_task_and_poll_success tests/integration/test_regression_api.py::test_dashscope_file_id_task_preserves_original_source_filename tests/integration/test_regression_api.py::test_dashscope_403_file_access_retry_task_hides_first_failure_and_skips_fallback tests/integration/test_regression_api.py::test_dashscope_403_file_access_retry_failure_persists_recovery_debug -q`
files_changed:
- app/api/routers/dashscope_upload.py
- app/infra/asr_dashscope.py
- app/infra/asr/dashscope.py
- app/services/lesson_service.py
- tests/unit/test_dashscope_upload_router.py
- tests/unit/test_lesson_service_dashscope_url.py
- tests/unit/test_asr_dashscope.py
