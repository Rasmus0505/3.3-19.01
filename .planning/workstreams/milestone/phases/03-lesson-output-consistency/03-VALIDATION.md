---
phase: "03"
slug: lesson-output-consistency
status: compliant
nyquist_compliant: true
wave_0_complete: true
created: "2026-03-27"
audited: "2026-03-28"
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

|| Property | Value |
|----------|---------|
| **Framework** | pytest |
| **Config file** | `pytest.ini` |
| **Quick run command** | `pytest tests/contracts/test_lessons_contract.py -q` |
| **Full suite command** | `pytest tests/contracts/test_lessons_contract.py tests/integration/test_regression_api.py tests/integration/test_lesson_task_recovery.py tests/e2e/test_e2e_key_flows.py -k "lesson or subtitle_cache_seed or result_kind or progress" -q` |
| **Estimated runtime** | ~90-150 seconds |

---

## Sampling Rate

- **After every task commit:** Run the narrowest task-specific pytest command from the map below
- **After every plan wave:** Run `pytest tests/contracts/test_lessons_contract.py tests/integration/test_regression_api.py tests/integration/test_lesson_task_recovery.py -k "lesson or subtitle_cache_seed or result_kind or progress" -q`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 150 seconds

---

## Per-Task Verification Map

|| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
|| 03-01-01 | 01 | 1 | LESS-01 | contract | `pytest tests/contracts/test_lessons_contract.py -q` | ✅ green |
|| 03-01-02 | 01 | 1 | LESS-01, LESS-03 | integration | `pytest tests/integration/test_regression_api.py -k "subtitle_cache_seed or result_kind or local_generated_lesson" -q` | ✅ green |
|| 03-01-03 | 01 | 1 | LESS-01 | integration | `pytest tests/integration/test_lesson_task_recovery.py -k "resume or result_kind or artifact" -q` | ✅ green |
|| 03-02-01 | 02 | 2 | LESS-02 | integration | `pytest tests/integration/test_regression_api.py -k "catalog or progress_summary or load_lesson_detail" -q` | ✅ green |
|| 03-02-02 | 02 | 2 | LEARN-02 | e2e/integration | `pytest tests/e2e/test_e2e_key_flows.py -k "login_create_lesson_practice_progress" -q` | ✅ green |
|| 03-03-01 | 03 | 2 | LESS-03 | integration | `pytest tests/integration/test_lesson_task_recovery.py -k "pause or terminate or resume" -q` | ✅ green |
|| 03-03-02 | 03 | 2 | LEARN-01, LEARN-02 | e2e | `pytest tests/e2e/test_e2e_key_flows.py -k "practice_progress" -q` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/contracts/test_lessons_contract.py` — lesson detail/catalog/task schema contract tests covering canonical lesson output fields used by both local and cloud generation
- [x] `tests/integration/test_regression_api.py` — focused regressions for local/cloud lesson parity, `subtitle_cache_seed`, and degraded-success (`asr_only`) behavior
- [x] `tests/integration/test_lesson_task_recovery.py` — pause/resume/result-kind continuity regression coverage
- [x] `tests/e2e/test_e2e_key_flows.py` — learner-flow smoke test for create lesson -> open history -> practice progression

---

## Manual-Only Verifications

|| Behavior | Requirement | Why Manual | Test Instructions | Status |
|----------|------------|------------|-------------------|--------|
| History cards look source-agnostic after generation | LESS-02 | Visual consistency of labels, progress chips, and CTA wording is easiest to confirm interactively | Generate one Bottle 1.0 lesson and one Bottle 2.0 lesson, open history, and verify both cards expose the same core metadata and start-learning affordance | pass (UAT) |
| Partial-success lesson remains learnable | LESS-03, LEARN-02 | Needs UI review of degraded-success messaging and actual learner handoff | Force or simulate an `asr_only` outcome, confirm upload UI explains degradation, then confirm the lesson still opens in history and immersive mode | pass (UAT) |
| Practice flow feels identical once lesson opens | LEARN-01, LEARN-02 | Requires interactive confirmation of sentence playback/typing continuity | Start one local-source lesson and one cloud-source lesson, then compare immersive learning behavior, sentence order, and progress persistence | pass (UAT) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verification or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verification
- [x] Wave 0 covers all missing lesson/task parity assertions
- [x] No watch-mode flags
- [x] Feedback latency < 150s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** granted

---

## Validation Audit 2026-03-28

|| Metric | Count |
|--------|-------|
| Total tasks | 7 |
| Automated green | 7 |
| Manual-only (UAT) | 3 |
| Gaps found | 0 |
| Escalated to manual | 0 |

**Note on baseline failures:** The broader legacy regression suite (`test_regression_api.py -k "lesson or workspace or progress"`) contains 5 pre-existing baseline failures unrelated to Phase 03: `test_lesson_generation_repair_migration_recreates_missing_table` (alembic config path), `test_single_faster_whisper_progress_keeps_waiting_after_segments` (segment total vs asr_done counter), `test_create_lesson_rejects_para_model` (Bottle 1.0 removed from supported_models), `test_create_local_asr_lesson_job` (workspace log_summary events), and `test_create_local_asr_lesson_workspace_pointer` (None subtitle snapshot). None of these are covered by any Phase 03 task's automated verification command, and none were introduced by Phase 03 changes.

---

_Phase: 03-lesson-output-consistency_
_Last updated: 2026-03-28_
