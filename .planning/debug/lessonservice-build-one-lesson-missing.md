---
status: awaiting_human_verify
trigger: "Investigate issue: lessonservice-build-one-lesson-missing"
created: 2026-03-27T00:00:00Z
updated: 2026-03-27T01:43:00Z
---

## Current Focus

hypothesis: Confirmed. The DashScope direct-upload path depended on an incomplete `_build_one_lesson` restoration, and the same service file also had a misplaced `dashscope_recovery` branch in `generate_from_saved_file`.
test: User verifies the real lesson-generation workflow after the code and targeted regression tests passed locally.
expecting: The `build_lesson` stage completes without `LessonService._build_one_lesson` AttributeError, and the lesson persists successfully.
next_action: User runs the original workflow and reports whether the issue is fixed end-to-end.

## Symptoms

expected: 课程生成流程在“生成课程结构”阶段正常调用 LessonService 内部构建逻辑并继续完成课程保存。
actual: 在“生成课程结构”阶段抛出 AttributeError，整个生成流程以 INTERNAL_ERROR 失败。
errors: `type object 'LessonService' has no attribute '_build_one_lesson'`
reproduction: 在项目中触发课程生成，走到 saved file / local generation 的 build_lesson 阶段。
started: 当前代码状态下已出现；需要确认是否是最近重构把方法移位或改名。

## Eliminated

## Evidence

- timestamp: 2026-03-27T00:03:00Z
  checked: `.planning/debug/knowledge-base.md`
  found: No knowledge base file or matching prior entry exists for this symptom pattern.
  implication: No reusable known-pattern diagnosis; investigate from code.

- timestamp: 2026-03-27T00:05:00Z
  checked: `rg -n "_build_one_lesson|class LessonService|build_lesson|LessonService" D:\3.3-19.01`
  found: `LessonService` is defined in `app/services/lesson_service.py`; tests monkeypatch `LessonService._build_one_lesson`; the failing build stage is named `build_lesson`.
  implication: The missing attribute is part of the expected public/internal contract in both production code and integration tests.

- timestamp: 2026-03-27T00:08:00Z
  checked: `app/services/lesson_service.py`
  found: `rg` finds a single callsite `LessonService._build_one_lesson(...)` at line 2979 and no definition of `_build_one_lesson` anywhere in the file.
  implication: The AttributeError is reproducible from static inspection; this is a stale call to a removed or renamed helper.

- timestamp: 2026-03-27T00:16:00Z
  checked: `LessonService.generate_from_saved_file` and `LessonService.generate_from_dashscope_file_id`
  found: `generate_from_saved_file` still contains full inline lesson-write logic (lesson row, sentence rows, progress row, translation log persistence, billing settlement), while `generate_from_dashscope_file_id` delegates that same step to missing `_build_one_lesson`.
  implication: Root cause is an incomplete refactor confined to the DashScope direct-upload code path, not a global generation failure.

- timestamp: 2026-03-27T00:29:00Z
  checked: `git diff -- app/services/lesson_service.py` and live import of `LessonService`
  found: The working tree already contains an uncommitted `_build_one_lesson` implementation and callsite changes, and `python` imports show `hasattr(LessonService, '_build_one_lesson') == True`.
  implication: The reported AttributeError matches the committed baseline or another stale runtime; current work must verify and complete the in-progress fix rather than rediscover the missing symbol.

- timestamp: 2026-03-27T00:36:00Z
  checked: `tests/integration/test_regression_api.py::test_generate_from_dashscope_file_id_uses_builtin_lesson_builder`
  found: Strengthened the test so the DashScope direct-upload path must create sentence rows, translation logs, and a `consume_translate` wallet ledger entry without monkeypatching `_build_one_lesson`.
  implication: Regression coverage now exercises the helper contract directly instead of hiding it behind a test stub.

- timestamp: 2026-03-27T00:38:00Z
  checked: `python -m pytest tests/integration/test_regression_api.py -k "test_generate_from_dashscope_file_id_uses_builtin_lesson_builder or test_dashscope_403_file_access_retry_task_hides_first_failure_and_skips_fallback or test_generate_from_saved_file_records_mt_usage_and_consume"`
  found: First verification run exposed `NameError: name 'dashscope_recovery' is not defined` in `generate_from_saved_file`.
  implication: There was a second concrete bug in adjacent saved-file logic; leaving it would keep nearby regression coverage red.

- timestamp: 2026-03-27T00:42:00Z
  checked: Re-ran the same three targeted integration tests after finishing `_build_one_lesson` side effects and removing the misplaced `dashscope_recovery` reference from `generate_from_saved_file`.
  found: All 3 selected tests passed.
  implication: The direct-upload DashScope builder path is self-verified, and adjacent saved-file billing behavior still works.

## Resolution

root_cause: Incomplete refactor in `app/services/lesson_service.py`: `LessonService.generate_from_dashscope_file_id` still calls `_build_one_lesson`, but that static helper was removed from the class while equivalent persistence logic remained duplicated inline in sibling generation paths.
fix:
- Completed `LessonService._build_one_lesson` so it persists the lesson row, sentence rows, learning progress row, translation request logs, reserved-point settlement, and translation billing for the DashScope direct-upload path.
- Updated the DashScope direct-upload path to pass the required lesson metadata and billing context into `_build_one_lesson`.
- Removed a misplaced `dashscope_recovery` branch from `generate_from_saved_file` that referenced an undefined variable.
- Strengthened the DashScope regression test so it exercises `generate_from_dashscope_file_id` without monkeypatching `_build_one_lesson` and asserts billing side effects.
verification:
- `python -m pytest tests/integration/test_regression_api.py -k "test_generate_from_dashscope_file_id_uses_builtin_lesson_builder or test_dashscope_403_file_access_retry_task_hides_first_failure_and_skips_fallback or test_generate_from_saved_file_records_mt_usage_and_consume"` => 3 passed
files_changed:
- app/services/lesson_service.py
- tests/integration/test_regression_api.py
