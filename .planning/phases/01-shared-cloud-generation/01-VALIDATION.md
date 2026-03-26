---
phase: 01
slug: shared-cloud-generation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest |
| **Config file** | `pytest.ini` |
| **Quick run command** | `pytest tests/unit/test_dashscope_upload_router.py -q` |
| **Full suite command** | `pytest tests/unit/test_dashscope_upload_router.py tests/contracts/test_desktop_runtime_contract.py tests/integration/test_regression_api.py -k "dashscope or qwen3 or cloud_transcribe or request_url or dashscope_file_id" -q` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/unit/test_dashscope_upload_router.py -q`
- **After every plan wave:** Run `pytest tests/unit/test_dashscope_upload_router.py tests/contracts/test_desktop_runtime_contract.py tests/integration/test_regression_api.py -k "dashscope or qwen3 or cloud_transcribe or request_url or dashscope_file_id" -q`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | WEB-01 | unit | `pytest tests/unit/test_dashscope_upload_router.py -q` | ✅ | ⬜ pending |
| 01-01-02 | 01 | 1 | WEB-03 | integration | `pytest tests/integration/test_regression_api.py -k "dashscope_file_id or request_url" -q` | ✅ | ⬜ pending |
| 01-02-01 | 02 | 2 | WEB-02 | contract | `pytest tests/contracts/test_desktop_runtime_contract.py -k "requestCloudApi" -q` | ✅ | ⬜ pending |
| 01-02-02 | 02 | 2 | DESK-02 | contract | `pytest tests/contracts/test_desktop_runtime_contract.py -k "uploadWithProgress" -q` | ✅ | ⬜ pending |
| 01-03-01 | 03 | 3 | AUTH-02 | integration | `pytest tests/integration/test_regression_api.py -k "resume or terminate or task" -q` | ✅ | ⬜ pending |
| 01-03-02 | 03 | 3 | BILL-01 | e2e/integration | `pytest tests/e2e/test_e2e_key_flows.py -q` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] No new framework install required — existing pytest infrastructure covers this phase.
- [ ] Add any missing focused regression tests for the chosen direct-upload canonical path.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser user sees desktop-only popup with CTA | WEB-02 | UX presentation and CTA placement are visual | In web UI, trigger a desktop-only Bottle 2.0 guidance case and verify popup copy plus bottom-right CTA are visible |
| Web and desktop expose the same Bottle 2.0 stage vocabulary | DESK-02 | Cross-runtime UX consistency is easiest to confirm interactively | Start a Bottle 2.0 task in both runtimes and compare stage labels/order |
| Large-file warning/recommend-desktop behavior is understandable | WEB-03 | Product wording and fallback guidance are UX-dependent | Use an oversized or edge-case file and confirm the UI recommends desktop rather than server fallback |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
