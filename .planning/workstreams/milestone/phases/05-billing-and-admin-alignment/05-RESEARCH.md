# Phase 05: Billing and Admin Alignment - Research

**Researched:** 2026-03-28
**Domain:** admin information architecture + billing contract cleanup + diagnostic workspace separation
**Confidence:** HIGH

## Summary

Phase 05 is another integration and cleanup phase, not a greenfield admin build.

The repo already contains most of the raw pieces the phase needs:

- `frontend/src/features/admin-workspaces/AdminUsersWorkspace.jsx` already provides a user-centered business workspace with `list`, `wallet`, and `rates` tabs.
- `frontend/src/features/admin-pages/AdminRedeemPage.jsx` already exposes redeem batches, redeem codes, and redeem audit as secondary tooling.
- `frontend/src/features/admin-workspaces/AdminMonitoringWorkspace.jsx` already groups health, task-failure, translation, and operation-log panels, but it is not exposed as a first-class route in `frontend/src/AdminApp.jsx`.
- `frontend/src/features/admin-overview/AdminOverviewTab.jsx` already acts like a troubleshooting landing page and already tries to deep-link into monitoring and business routes.
- `app/api/routers/admin_console.py` and `app/api/routers/admin.py` already expose most of the troubleshooting data: overview, lesson-task logs, translation logs, operation logs, users, wallet logs, billing rates, and redeem tooling.

The main gaps are structural:

1. the top-level admin shell still defaults to system health instead of the user-centered operational flow
2. the sidebar/nav still treats billing as `模型配置`, which conflicts with the locked Phase 5 decision that billing stays billing
3. the billing contract still exposes runtime-tuning fields (`parallel_enabled`, `parallel_threshold_seconds`, `segment_seconds`, `max_concurrency`) all the way from schema to UI
4. the troubleshooting workspace exists in pieces, but it is not wired as the explicit separate developer/operator entry point required by context

**Primary recommendation:** split Phase 05 into three plans:

1. `05-01` — simplify the business-facing admin shell around user-first operations and secondary redeem tooling
2. `05-02` — narrow billing contracts and UI to pricing plus active-state only while keeping canonical `model_name` continuity
3. `05-03` — expose a dedicated troubleshooting center with health, failures, translation visibility, audit trails, and Bottle 1.0 / Bottle 2.0 runtime readiness

---

<user_constraints>
## User Constraints (from CONTEXT.md)

- Main admin surface must stay lighter and lower-density, not grow into a crowded control panel
- Operators should start from users, then drill into wallet and related actions from that user-centered workflow
- Redeem-code and campaign tooling remains important, but should be secondary navigation
- Billing editor manages pricing and active/inactive availability only
- Runtime execution knobs such as `parallel_threshold_seconds`, `segment_seconds`, and `max_concurrency` must not be normal admin controls
- Phase 5 must not recreate a model-configuration surface under a different label
- Troubleshooting must be a separate diagnostic area, not mixed into the lightweight business-facing shell
- Troubleshooting must cover system health, task failures, translation failures, operation audit trails, and Bottle 1.0 / Bottle 2.0 runtime readiness
- Troubleshooting is for diagnosis only, not routine pricing or business operations
</user_constraints>

---

## Existing Architecture

### Main admin shell

`frontend/src/AdminApp.jsx`

Current behavior:

- default route is `/admin/health`
- top-level routes are `health`, `security`, `users`, and `redeem`
- legacy `/admin/rates` and `/admin/logs` redirect into the users workspace
- there is no first-class `/admin/monitoring` or `/admin/troubleshooting` route even though the codebase already has a monitoring workspace

This means the current shell still treats health as the default admin home and hides the richer diagnostic surface.

### Navigation metadata

`frontend/src/shared/lib/adminSearchParams.js`

Current behavior:

- `ADMIN_NAV_ITEMS` includes `health`, `security`, `users`, `models`, `redeem`
- billing is labeled `模型配置`
- nav resolution maps `/admin/users?tab=rates` back to `models`

This is the clearest mismatch with the locked context. The user explicitly rejected a normal admin model/runtime tuning surface.

### Business-facing operations

Relevant files:

- `frontend/src/features/admin-pages/AdminUsersPage.jsx`
- `frontend/src/features/admin-workspaces/AdminUsersWorkspace.jsx`
- `frontend/src/features/admin-pages/AdminRedeemPage.jsx`

Important findings:

- `AdminUsersWorkspace.jsx` already encodes the right business direction: user list, wallet logs, and billing are colocated
- the workspace header copy still describes itself as `用户计费工作台`, which is close but should become the canonical primary admin entry
- `AdminRedeemPage.jsx` already works well as secondary operational tooling

Phase 05 should reuse these structures, not replace them with a new admin shell.

### Troubleshooting building blocks

Relevant files:

- `frontend/src/features/admin-workspaces/AdminMonitoringWorkspace.jsx`
- `frontend/src/features/admin-overview/AdminOverviewTab.jsx`
- `frontend/src/features/admin-system/AdminSystemTab.jsx`
- `frontend/src/features/admin-logs/AdminLessonTaskLogsTab.jsx`
- `frontend/src/features/admin-logs/AdminTranslationLogsTab.jsx`
- `frontend/src/features/admin-operation-logs/AdminOperationLogsTab.jsx`
- `app/api/routers/admin_console.py`
- `app/api/routers/admin.py`

Important findings:

- `AdminMonitoringWorkspace.jsx` already groups the right troubleshooting domains: `health`, `tasks`, and `operations`
- several label/description strings inside `AdminMonitoringWorkspace.jsx` are mojibake/encoding-corrupted and need cleanup before the workspace can be treated as a polished operator surface
- `AdminOverviewTab.jsx` already behaves like a troubleshooting landing page, with links to system checks, task failures, redeem batches, and operation logs
- `AdminSystemTab.jsx` already shows `/health`, `/health/ready`, admin bootstrap status, DashScope config, and ffmpeg/ffprobe readiness
- `admin_console.py` already provides overview, operation logs, and lesson-task diagnostics
- `admin.py` already provides translation logs and billing/wallet/redeem operations

The phase should expose and align these pieces, not invent a second monitoring stack.

### Billing and runtime status contracts

Relevant files:

- `frontend/src/features/admin-rates/AdminRatesTab.jsx`
- `app/schemas/admin.py`
- `app/schemas/billing.py`
- `app/api/serializers.py`
- `app/api/routers/admin.py`
- `app/services/billing.py`
- `app/services/asr_model_registry.py`

Important findings:

- `AdminRatesTab.jsx` still renders and submits runtime controls:
  - `parallel_enabled`
  - `parallel_threshold_seconds`
  - `segment_seconds`
  - `max_concurrency`
- `AdminBillingRateUpdateRequest` still accepts those runtime fields
- `BillingRateItem` still serializes those runtime fields back to the frontend
- `to_rate_item()` in `app/api/serializers.py` still exposes them
- `app/services/billing.py` still seeds and heals those values as part of the billing row payload
- `app/services/asr_model_registry.py` already knows the runtime readiness state and display metadata for Bottle 1.0 (`faster-whisper-medium`) and Bottle 2.0 (`qwen3-asr-flash-filetrans`)

The right move is not to delete the internal runtime defaults from persistence. The right move is to stop exposing them as routine admin-editable inputs while preserving canonical `model_name` billing continuity.

---

## Recommended Structure

### Plan 05-01: user-first business shell

Target files:

- `frontend/src/AdminApp.jsx`
- `frontend/src/shared/lib/adminSearchParams.js`
- `frontend/src/features/admin-pages/AdminUsersPage.jsx`
- `frontend/src/features/admin-workspaces/AdminUsersWorkspace.jsx`
- `frontend/src/features/admin-pages/AdminRedeemPage.jsx`

Purpose:

- make `/admin/users?tab=list` the default admin landing route
- remove `模型配置` as a top-level nav concept
- keep billing reachable as a tab inside the user workflow
- keep redeem/campaign tooling secondary but adjacent

### Plan 05-02: pricing-only billing contracts

Target files:

- `frontend/src/features/admin-rates/AdminRatesTab.jsx`
- `app/schemas/admin.py`
- `app/schemas/billing.py`
- `app/api/serializers.py`
- `app/api/routers/admin.py`
- `app/services/billing.py`
- `tests/unit/test_billing_cleanup.py`
- `tests/integration/test_regression_api.py`
- `tests/e2e/test_e2e_key_flows.py`

Purpose:

- remove routine admin editing of runtime knobs
- keep price, cost reference, billing unit, and active/inactive editing
- preserve Bottle 1.0 and Bottle 2.0 billing rows on canonical `model_name`

### Plan 05-03: dedicated troubleshooting center

Target files:

- `frontend/src/features/admin-workspaces/AdminMonitoringWorkspace.jsx`
- `frontend/src/features/admin-overview/AdminOverviewTab.jsx`
- `frontend/src/features/admin-system/AdminSystemTab.jsx`
- `app/api/routers/admin.py`
- `app/schemas/admin.py`
- `tests/integration/test_admin_console_api.py`
- `tests/e2e/test_e2e_key_flows.py`

Purpose:

- expose an explicit troubleshooting route/workspace
- clean up broken copy and dead links
- show runtime readiness for Bottle 1.0 and Bottle 2.0 without exposing runtime tuning controls
- lock diagnostic coverage in integration/e2e tests

---

## Patterns to Reuse

### Existing user-centered admin flow

`AdminUsersWorkspace.jsx` is already the right core shape for routine operations:

- start from a user
- inspect or adjust wallet state
- reach billing from the same workflow

Phase 05 should strengthen this as the default rather than introducing another business landing page.

### Existing diagnostic data sources

The repo already has working APIs and tabs for:

- health snapshot
- overview metrics
- lesson task failures
- translation logs
- operation logs

Phase 05 should unify these under a troubleshooting route and normalize the copy/links.

### Canonical billing identity

Bottle 1.0 already uses `faster-whisper-medium` as the canonical billing `model_name`.
Bottle 2.0 already uses `qwen3-asr-flash-filetrans`.

Any plan that renames or forks those model identities would regress the Phase 2.1 cleanup.

---

## Common Pitfalls

### Pitfall 1: hiding troubleshooting inside the business shell

The context explicitly rejects mixing developer diagnostics into the lightweight business-facing admin navigation. A tab buried under users or redeem would miss the requirement.

### Pitfall 2: deleting runtime defaults from persistence

Internal runtime defaults still matter for backend execution and schema repair. The phase should remove them from routine admin editing, not necessarily from every internal storage or seed path in one pass.

### Pitfall 3: preserving `模型配置` under a new label

Renaming the nav item while keeping runtime tuning controls visible would violate the most important locked decision in the phase context.

### Pitfall 4: shipping a troubleshooting route with dead or stale links

`AdminOverviewTab.jsx` already deep-links to `/admin/monitoring` and `/admin/business`, but the current top-level router does not fully honor that surface. Phase 05 must normalize route names and make those links live.

### Pitfall 5: ignoring the mojibake in `AdminMonitoringWorkspace.jsx`

Several strings in the monitoring workspace are corrupted. If left untouched, the new troubleshooting entry would technically exist but still feel broken.

---

## Validation Architecture

### Existing relevant tests

- `tests/unit/test_billing_cleanup.py`
- `tests/integration/test_regression_api.py`
- `tests/integration/test_admin_console_api.py`
- `tests/e2e/test_e2e_key_flows.py`

### Gaps to close

1. prove billing update payloads no longer expose runtime-edit fields
2. prove Bottle 1.0 and Bottle 2.0 billing rows remain editable via canonical `model_name`
3. prove troubleshooting route data covers overview, task failures, translation logs, operation logs, and runtime readiness
4. prove user and redeem operations remain reachable after the shell/navigation cleanup

### Suggested commands

- `pytest tests/unit/test_billing_cleanup.py -q`
- `pytest tests/integration/test_regression_api.py -k "billing_rates or faster_whisper_medium or qwen3_asr" -q`
- `pytest tests/integration/test_admin_console_api.py -k "overview or operation_logs or lesson_task_logs or runtime" -q`
- `pytest tests/e2e/test_e2e_key_flows.py -k "wallet or billing or redeem" -q`
- `npm --prefix frontend run build`

---

## Key Recommendation

Do not plan Phase 05 as “build a new admin console”.

Plan it as:

- promote the existing user workspace into the clear business-facing default
- demote redeem tooling into secondary navigation
- remove runtime tuning from billing contracts and UI
- surface the already-existing monitoring pieces as a real troubleshooting center with runtime readiness visibility

---

*Research date: 2026-03-28*
*Phase: 05-billing-and-admin-alignment*
