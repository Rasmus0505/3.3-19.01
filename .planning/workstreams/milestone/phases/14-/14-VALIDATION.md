---
phase: 14
slug: desktop-program-and-model-incremental-updates
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x + Python stdlib |
| **Config file** | `tests/contracts/` (existing contract tests) |
| **Quick run command** | `python -m pytest tests/contracts/ -v -k "desktop" --tb=short` |
| **Full suite command** | `python -m pytest tests/contracts/ -v --tb=short && python -m pytest tests/ -v --tb=short` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `python -m pytest tests/contracts/ -v -k "desktop" --tb=short`
- **After every plan wave:** Run full suite above
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | DESK-02 | contract | `pytest tests/contracts/test_desktop_release_surface_contract.py` | ✅ | ⬜ pending |
| 14-01-02 | 01 | 1 | DESK-02 | contract | `pytest tests/contracts/test_desktop_installer_contract.py` | ✅ | ⬜ pending |
| 14-01-03 | 01 | 1 | DESK-03 | unit | `pytest tests/ -k "version_display" -v` | ⚠️ W0 | ⬜ pending |
| 14-02-01 | 02 | 1 | DESK-03 | unit | `pytest tests/ -k "update_flow" -v` | ⚠️ W0 | ⬜ pending |
| 14-02-02 | 02 | 1 | DESK-04 | unit | `pytest tests/ -k "retry_recovery" -v` | ⚠️ W0 | ⬜ pending |
| 14-02-03 | 02 | 2 | DESK-03 | integration | manual desktop build | N/A | ⬜ pending |
| 14-03-01 | 03 | 1 | DESK-04 | contract | `pytest tests/contracts/test_desktop_runtime_contract.py` | ✅ | ⬜ pending |
| 14-03-02 | 03 | 1 | DESK-05 | unit | `pytest tests/ -k "model_delta" -v` | ⚠️ W0 | ⬜ pending |
| 14-03-03 | 03 | 1 | DESK-05 | integration | `pytest tests/ -k "model_update_progress" -v` | ⚠️ W0 | ⬜ pending |
| 14-03-04 | 03 | 2 | SECU-03 | doc | `grep -r "资产边界" docs/` | ⚠️ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/contracts/test_desktop_update_flow_contract.py` — contract tests for program update flow (14-02)
- [ ] `tests/contracts/test_model_delta_update_contract.py` — contract for model delta + progress (14-03)
- [ ] `tests/unit/test_version_display.py` — DESK-03 version display unit tests
- [ ] `tests/unit/test_retry_recovery.py` — DESK-04 retry/recovery unit tests
- [ ] `tests/integration/test_model_update_progress.py` — integration for model progress UI

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Red dot badge appears on real desktop app | DESK-02, DESK-03 | Requires packaged .exe + real system notification | Launch packaged app, trigger update check, verify red dot on header |
| In-client installer launch + NSIS silent install | DESK-03 | Requires packaged installer + system-level install | Download installer, click "install", verify app restarts with new version |
| Model update progress UI on packaged client | DESK-05 | Electron renderer UI cannot be headlessly verified | Package app, trigger model update, observe progress bar in UploadPanel |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** {pending / approved YYYY-MM-DD}
