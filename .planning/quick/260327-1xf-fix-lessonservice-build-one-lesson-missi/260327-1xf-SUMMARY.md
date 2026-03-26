# Quick Task 260327-1xf Summary

**Task:** Fix LessonService._build_one_lesson missing in DashScope course generation path
**Date:** 2026-03-27
**Status:** Completed

## Outcome

- Restored `LessonService._build_one_lesson` inside `app/services/lesson_service.py`.
- Updated the DashScope direct-upload generation path to pass explicit lesson metadata into the helper before persisting.
- Added a regression test covering `generate_from_dashscope_file_id` without monkeypatching the helper.

## Verification

- `pytest D:\\3.3-19.01\\tests\\integration\\test_regression_api.py -k "test_generate_from_dashscope_file_id_uses_builtin_lesson_builder or test_dashscope_403_file_access_retry_task_hides_first_failure_and_skips_fallback or test_generate_from_saved_file_records_mt_usage_and_consume"`
