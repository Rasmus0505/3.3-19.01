# Quick Task 260327-2ca Summary

**Task:** Fix persist_lesson_workspace_summary signature mismatch in DashScope save stage
**Date:** 2026-03-27
**Status:** Completed

## Outcome

- Updated the DashScope save-complete path in `app/services/lesson_service.py` to call `persist_lesson_workspace_summary(...)` with the current normalized summary fields.
- Persisted the final workspace summary after `lesson.subtitle_cache_seed` is built and exposed it on `lesson.workspace_summary`.
- Strengthened the DashScope regression test so it no longer mocks out workspace-summary persistence and instead verifies the real saved payload.

## Verification

- `pytest D:\\3.3-19.01\\tests\\integration\\test_regression_api.py -k "test_generate_from_dashscope_file_id_uses_builtin_lesson_builder or test_dashscope_403_file_access_retry_task_hides_first_failure_and_skips_fallback or test_generate_from_saved_file_records_mt_usage_and_consume"`
