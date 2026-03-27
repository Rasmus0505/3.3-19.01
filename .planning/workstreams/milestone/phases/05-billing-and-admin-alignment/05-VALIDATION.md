---
phase: "05"
slug: billing-and-admin-alignment
status: ready_for_verify
nyquist_compliant: true
wave_0_complete: true
created: "2026-03-28"
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + frontend production build |
| **Config file** | `pytest.ini` |
| **Quick run command** | `pytest tests/unit/test_billing_cleanup.py -q` |
| **Full suite command** | `pytest tests/unit/test_billing_cleanup.py tests/integration/test_regression_api.py tests/integration/test_admin_console_api.py tests/e2e/test_e2e_key_flows.py -k "billing or admin or redeem or wallet or overview or runtime" -q` |
| **Estimated runtime** | ~120-210 seconds |

---

## Sampling Rate

- **After every task commit:** Run the narrowest plan-specific command below
- **After every plan wave:** Run `pytest tests/unit/test_billing_cleanup.py tests/integration/test_regression_api.py tests/integration/test_admin_console_api.py -k "billing or overview or runtime" -q`
- **Before `/gsd-verify-work`:** Full suite must be green and `npm --prefix frontend run build` must pass
- **Max feedback latency:** 210 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | ADMIN-03 | frontend build | `npm --prefix frontend run build` | ✅ | ✅ green |
| 05-01-02 | 01 | 1 | ADMIN-03 | grep/manual assist | `rg -n "用户运营|排障中心|模型配置|/admin/users\\?tab=list" frontend/src/AdminApp.jsx frontend/src/shared/lib/adminSearchParams.js frontend/src/features/admin-workspaces/AdminUsersWorkspace.jsx` | ✅ | ✅ green |
| 05-02-01 | 02 | 1 | BILL-02, ADMIN-01 | unit | `pytest tests/unit/test_billing_cleanup.py -q` | ✅ | ✅ green |
| 05-02-02 | 02 | 1 | BILL-02, ADMIN-01 | integration | `pytest tests/integration/test_regression_api.py -k "billing_rates or faster_whisper_medium or qwen3_asr" -q` | ✅ | ✅ green |
| 05-02-03 | 02 | 1 | BILL-02, ADMIN-01 | e2e/api smoke | `pytest tests/e2e/test_e2e_key_flows.py -k "admin_adjust_wallet_and_logs or admin_update_rate_visible_in_public_api" -q` | ✅ | ✅ green |
| 05-03-01 | 03 | 2 | ADMIN-02 | integration | `pytest tests/integration/test_admin_console_api.py -k "overview or operation_logs or lesson_task_logs or runtime" -q` | ✅ | ✅ green |
| 05-03-02 | 03 | 2 | ADMIN-02 | frontend build | `npm --prefix frontend run build` | ✅ | ✅ green |
| 05-03-03 | 03 | 2 | ADMIN-02, ADMIN-03 | e2e/api smoke | `pytest tests/e2e/test_e2e_key_flows.py -k "wallet or billing or redeem" -q` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Add or update billing regression assertions so removed runtime-edit fields are not expected in admin payloads
- [x] Add runtime-readiness API coverage for Bottle 1.0 and Bottle 2.0 diagnostic visibility
- [x] Add manual verification notes for the new troubleshooting route and the lighter business-facing shell

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Default admin landing opens the user-centered workflow | ADMIN-03 | Route/default-shell behavior is easiest to confirm in a browser | Open `/admin` and verify it lands in the users workspace rather than the old health page |
| Sidebar/nav no longer shows `模型配置` | ADMIN-01, ADMIN-03 | Visual IA and copy are frontend-only | Inspect the admin shell and confirm billing is nested under user workflow, not a standalone model-config entry |
| Redeem tooling remains reachable but secondary | ADMIN-03 | Information hierarchy is best validated interactively | From the users workspace, navigate to redeem batches/codes/audit and verify the route is secondary, not the default home |
| Troubleshooting center is separate and complete | ADMIN-02 | End-to-end operator flow spans multiple panels | Open the troubleshooting route and confirm overview, system, task failures, translation logs, operation logs, and runtime readiness are all reachable without entering billing editing |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verification or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verification
- [x] Billing regressions cover removed runtime-edit controls and preserved `model_name` continuity
- [x] Troubleshooting regressions cover overview, failures, logs, and runtime readiness
- [ ] No watch-mode flags
- [x] Feedback latency < 210s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
