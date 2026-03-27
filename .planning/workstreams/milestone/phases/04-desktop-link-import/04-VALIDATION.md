---
phase: "04"
slug: desktop-link-import
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-03-27"
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + frontend production build |
| **Config file** | `pytest.ini` |
| **Quick run command** | `pytest tests/unit/test_desktop_local_asr.py -q` |
| **Full suite command** | `pytest tests/unit/test_desktop_local_asr.py tests/contracts/test_desktop_runtime_contract.py tests/contracts/test_desktop_installer_contract.py tests/integration/test_regression_api.py -k "desktop or url_import or workspace" -q` |
| **Estimated runtime** | ~90-150 seconds |

---

## Sampling Rate

- **After every task commit:** Run the narrowest plan-specific command below
- **After every plan wave:** Run `pytest tests/unit/test_desktop_local_asr.py tests/contracts/test_desktop_runtime_contract.py tests/contracts/test_desktop_installer_contract.py -q`
- **Before `/gsd-verify-work`:** Full suite must be green and frontend build must pass
- **Max feedback latency:** 150 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | DESK-04 | unit | `pytest tests/unit/test_desktop_local_asr.py -q` | ✅ | ⬜ pending |
| 04-01-02 | 01 | 1 | DESK-04 | contract | `pytest tests/contracts/test_desktop_runtime_contract.py tests/contracts/test_desktop_installer_contract.py -q` | ✅ | ⬜ pending |
| 04-01-03 | 01 | 1 | DESK-04 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 04-02-01 | 02 | 2 | DESK-04 | integration | `pytest tests/integration/test_regression_api.py -k "desktop or url_import or workspace" -q` | ✅ | ⬜ pending |
| 04-02-02 | 02 | 2 | DESK-04 | e2e/integration | `pytest tests/e2e/test_e2e_key_flows.py -k "lesson or progress" -q` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Add unit coverage for sanitation and first-valid-URL extraction
- [ ] Add coverage for invalid-link and login/platform-restriction messaging
- [ ] Add regression coverage for title propagation during import
- [ ] Add regression coverage for preserving cleaned link input after failure

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Source tabs are always visible | DESK-04 | Visual structure is best confirmed interactively | Open upload area on web and desktop, verify `本地文件` and `链接导入` are always visible |
| Every `SnapAny` word copies + opens | DESK-04 | Clipboard + external open behavior is easiest to verify manually | Trigger each visible SnapAny CTA/text and confirm it copies the URL then attempts to open the site |
| Switching tabs during active import prompts | DESK-04 | Needs real interaction during progress | Start a link import, switch to `本地文件`, verify the dialog offers `继续后台执行` and `取消当前链接任务` |
| Success routes directly into learning | DESK-04 | End-to-end navigation is best confirmed live | Complete a supported link import and verify the product opens the learning page directly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verification or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verification
- [ ] Wave 0 covers sanitation/restriction/retry/title assertions
- [ ] No watch-mode flags
- [ ] Feedback latency < 150s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
