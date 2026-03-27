---
phase: "03"
slug: lesson-output-consistency
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-03-27"
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
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

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | LESS-01 | contract | `pytest tests/contracts/test_lessons_contract.py -q` | ✅ | ⬜ pending |
| 03-01-02 | 01 | 1 | LESS-01, LESS-03 | integration | `pytest tests/integration/test_regression_api.py -k "subtitle_cache_seed or result_kind or local_generated_lesson" -q` | ✅ | ⬜ pending |
| 03-01-03 | 01 | 1 | LESS-01 | integration | `pytest tests/integration/test_lesson_task_recovery.py -k "resume or result_kind or artifact" -q` | ✅ | ⬜ pending |
| 03-02-01 | 02 | 2 | LESS-02 | integration | `pytest tests/integration/test_regression_api.py -k "catalog or progress_summary or load_lesson_detail" -q` | ✅ | ⬜ pending |
| 03-02-02 | 02 | 2 | LEARN-02 | e2e/integration | `pytest tests/e2e/test_e2e_key_flows.py -k "login_create_lesson_practice_progress" -q` | ✅ | ⬜ pending |
| 03-03-01 | 03 | 2 | LESS-03 | integration | `pytest tests/integration/test_lesson_task_recovery.py -k "pause or terminate or resume" -q` | ✅ | ⬜ pending |
| 03-03-02 | 03 | 2 | LEARN-01, LEARN-02 | e2e | `pytest tests/e2e/test_e2e_key_flows.py -k "practice_progress" -q` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Extend `tests/contracts/test_lessons_contract.py` so lesson detail/catalog/task schemas explicitly cover canonical lesson output fields used by both local and cloud generation
- [ ] Add or update focused regressions in `tests/integration/test_regression_api.py` for local/cloud lesson parity, `subtitle_cache_seed`, and degraded-success (`asr_only`) behavior
- [ ] Reuse `tests/integration/test_lesson_task_recovery.py` for pause/resume/result-kind continuity before adding new task-control tests elsewhere
- [ ] Keep `tests/e2e/test_e2e_key_flows.py` as the learner-flow smoke test for create lesson -> open history -> practice progression

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| History cards look source-agnostic after generation | LESS-02 | Visual consistency of labels, progress chips, and CTA wording is easiest to confirm interactively | Generate one Bottle 1.0 lesson and one Bottle 2.0 lesson, open history, and verify both cards expose the same core metadata and start-learning affordance |
| Partial-success lesson remains learnable | LESS-03, LEARN-02 | Needs UI review of degraded-success messaging and actual learner handoff | Force or simulate an `asr_only` outcome, confirm upload UI explains degradation, then confirm the lesson still opens in history and immersive mode |
| Practice flow feels identical once lesson opens | LEARN-01, LEARN-02 | Requires interactive confirmation of sentence playback/typing continuity | Start one local-source lesson and one cloud-source lesson, then compare immersive learning behavior, sentence order, and progress persistence |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verification or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verification
- [ ] Wave 0 covers all missing lesson/task parity assertions
- [ ] No watch-mode flags
- [ ] Feedback latency < 150s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
