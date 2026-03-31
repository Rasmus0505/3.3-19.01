---
phase: 13
slug: 13-desktop-release-pipeline-and-signed-installer
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-03-31
updated: 2026-04-01
---

# Phase 13 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `pytest` + contract tests |
| **Quick run command** | `python -m pytest tests/contracts/test_desktop_installer_contract.py tests/contracts/test_desktop_runtime_contract.py tests/contracts/test_desktop_release_surface_contract.py -q` |
| **Estimated runtime** | ~45 seconds |

## Sampling Rate

- After each Phase 13 change: run the three desktop contract suites
- Before resuming UAT: desktop contract suites must be green

## Per-Task Verification Map

| Task ID | Requirement | Test Type | Automated Command | Status |
|---------|-------------|-----------|-------------------|--------|
| 13-01 | DESK-01 | contract | `python -m pytest tests/contracts/test_desktop_release_surface_contract.py -q` | ⬜ pending |
| 13-02 | SECU-01 | contract | `python -m pytest tests/contracts/test_desktop_installer_contract.py -q` | ⬜ pending |
| 13-03 | DESK-01, SECU-01 | contract | `python -m pytest tests/contracts/test_desktop_installer_contract.py tests/contracts/test_desktop_runtime_contract.py tests/contracts/test_desktop_release_surface_contract.py -q` | ⬜ pending |

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `/download/desktop` redirects to Feijipan | DESK-01 | requires deployed site and real redirect behavior | open the deployed route and confirm the browser lands on `https://share.feijipan.com/s/1n2mH6fh` |
| stable installer is signed and installable | DESK-01, SECU-01 | requires real certificate and Windows shell verification | download the stable installer, inspect signature/file properties, then run the install flow |
| preview stays disabled | DESK-01 | deployment/runtime behavior | confirm `/desktop/client/channels/preview.json` returns `404` in production |

## Validation Sign-Off

- [ ] Stable redirect contract is covered by automated tests
- [ ] Stable-only release pipeline is covered by automated tests
- [ ] Manual redirect/signing checks are documented
- [ ] `nyquist_compliant: true` set after validation passes
