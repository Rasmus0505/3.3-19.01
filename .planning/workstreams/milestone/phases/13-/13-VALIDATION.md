---
phase: 13
slug: 13-desktop-release-pipeline-and-signed-installer
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-03-31
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `pytest` + `npm/vite build` |
| **Config file** | `frontend/package.json` / repo pytest discovery |
| **Quick run command** | `python -m pytest tests/contracts/test_desktop_installer_contract.py tests/contracts/test_desktop_runtime_contract.py tests/contracts/test_desktop_release_surface_contract.py -q` |
| **Full suite command** | `python -m pytest tests/contracts/test_desktop_installer_contract.py tests/contracts/test_desktop_runtime_contract.py tests/contracts/test_desktop_release_surface_contract.py -q && npm --prefix frontend run build:app-static` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `python -m pytest tests/contracts/test_desktop_installer_contract.py tests/contracts/test_desktop_runtime_contract.py tests/contracts/test_desktop_release_surface_contract.py -q`
- **After every plan wave:** Run `python -m pytest tests/contracts/test_desktop_installer_contract.py tests/contracts/test_desktop_runtime_contract.py tests/contracts/test_desktop_release_surface_contract.py -q && npm --prefix frontend run build:app-static`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | DESK-01 | contract | `python -m pytest tests/contracts/test_desktop_release_surface_contract.py -q` | ✅ | ⬜ pending |
| 13-02-01 | 02 | 1 | SECU-01 | contract | `python -m pytest tests/contracts/test_desktop_installer_contract.py -q` | ✅ | ⬜ pending |
| 13-03-01 | 03 | 2 | DESK-01, SECU-01 | contract | `python -m pytest tests/contracts/test_desktop_installer_contract.py tests/contracts/test_desktop_runtime_contract.py tests/contracts/test_desktop_release_surface_contract.py -q` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Signed stable installer can be downloaded from the real website and launches Windows install flow | DESK-01, SECU-01 | Requires real certificate/materialized installer and browser download | Follow `13-RELEASE-CHECKLIST.md`: open official website download page, download stable installer, verify file properties/signature and complete install |
| Preview channel stays out of default user path | DESK-01 | Environment/configuration issue across deployment and runtime defaults | Use real deployed website + packaged preview build; confirm default website CTA and default desktop client diagnostics still point at stable |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or existing infrastructure
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
