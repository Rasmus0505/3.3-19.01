---
status: resolved
trigger: "Investigate issue: persist-lesson-workspace-summary-trace-id-mismatch"
created: 2026-03-27T01:38:01.3051112+08:00
updated: 2026-03-27T01:45:00+08:00
---

## Current Focus

hypothesis: confirmed and fixed.
test: replace the stale DashScope workspace-summary call with the current helper contract and verify with targeted regression tests.
expecting: the save-complete stage no longer raises `TypeError`, and the workspace summary is persisted for the DashScope direct-upload path.
next_action: none.

## Symptoms

expected: 课程生成在保存完成阶段正常写入 workspace summary，不因 helper 参数不匹配而失败。
actual: 在“保存完成”阶段抛出 TypeError，课程生成以 INTERNAL_ERROR 失败。
errors: `persist_lesson_workspace_summary() got an unexpected keyword argument 'trace_id'`
reproduction: 重新触发课程生成，走到保存完成阶段后报错。
started: 出现在修复 `_build_one_lesson` 之后的下一次真实流程验证中。

## Eliminated

## Evidence

- timestamp: 2026-03-27T01:38:40.2516894+08:00
  checked: knowledge base and code search
  found: no `.planning/debug/knowledge-base.md` exists; code search found the helper definition in `app/services/lesson_task_manager.py:483` and a failing save-complete call in `app/services/lesson_service.py:3126`.
  implication: there is no prior known-pattern entry, and the issue is localized to the lesson workspace summary helper boundary.

- timestamp: 2026-03-27T01:38:58.2568144+08:00
  checked: `persist_lesson_workspace_summary()` definition and both lesson-service call sites
  found: the helper now requires `owner_user_id`, `source_filename`, `source_duration_ms`, `input_mode`, `runtime_kind`, `task_id`, `status`, `current_text`, `subtitle_cache_seed`, and `translation_debug`; the local-ASR completion path at `lesson_service.py:1294` matches this signature, but the DashScope direct-upload completion path at `lesson_service.py:3126` still passes only `lesson_id`, `trace_id`, `variant_result_path`, and `translation_checkpoint_path`.
  implication: the reported `unexpected keyword argument 'trace_id'` is a direct call-site/signature mismatch, not a downstream runtime issue.

- timestamp: 2026-03-27T01:41:14.6128027+08:00
  checked: working tree diff and regression test edits
  found: the working tree already contains an uncommitted fix in `app/services/lesson_service.py` that removes the stale `trace_id`/artifact-path call, then persists the workspace summary after `lesson.subtitle_cache_seed` is built using `owner_user_id`, `source_filename`, `source_duration_ms`, `input_mode="upload"`, `runtime_kind="cloud_api"`, `task_id`, `status`, `current_text`, `subtitle_cache_seed`, and `translation_debug`; `tests/integration/test_regression_api.py` was also updated to stop monkeypatching the helper and to assert the resulting workspace summary.
  implication: root cause is already fixed in the local working tree; remaining work is verification.

- timestamp: 2026-03-27T01:44:00+08:00
  checked: targeted integration tests
  found: all selected tests passed.
  implication: the DashScope save-complete path and adjacent regressions are green locally.

## Resolution

root_cause: `LessonService.generate_from_dashscope_file_id` still used the old `persist_lesson_workspace_summary(...)` contract (`trace_id`, `variant_result_path`, `translation_checkpoint_path`) after the helper had been refactored to accept normalized summary fields such as `owner_user_id`, `source_filename`, `input_mode`, `runtime_kind`, `task_id`, `subtitle_cache_seed`, and `translation_debug`.
fix:
- Replaced the stale DashScope save-stage call with the current `persist_lesson_workspace_summary(...)` signature.
- Moved the call to run after `subtitle_cache_seed` is available and attached the result to `lesson.workspace_summary`.
- Updated the DashScope regression test to stop monkeypatching `persist_lesson_workspace_summary` and assert that the workspace summary is really written.
verification:
- `pytest D:\\3.3-19.01\\tests\\integration\\test_regression_api.py -k "test_generate_from_dashscope_file_id_uses_builtin_lesson_builder or test_dashscope_403_file_access_retry_task_hides_first_failure_and_skips_fallback or test_generate_from_saved_file_records_mt_usage_and_consume"` => 3 passed
files_changed:
- app/services/lesson_service.py
- tests/integration/test_regression_api.py
