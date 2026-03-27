# Phase 5: Billing and Admin Alignment - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Align the admin-facing pricing, operational visibility, and troubleshooting structure around Bottle 1.0 and Bottle 2.0 so the product has a simpler business-facing admin surface plus a separate developer-oriented troubleshooting area. This phase covers admin information architecture, pricing-only billing controls, user-centered operations flow, and complete diagnostic entry points. It does not add learner-facing generation features or reintroduce a model/runtime tuning control plane as normal admin workflow.

</domain>

<decisions>
## Implementation Decisions

### Admin information architecture
- **D-01:** The main admin surface should be simplified and visually lower-density, keeping only necessary entry points instead of expanding into a crowded all-in-one console.
- **D-02:** The primary business-facing admin workflow should be user-centered: operators should start from users, then drill into wallet and related operational details from there.
- **D-03:** Redeem-code and campaign tooling remains important, but it should not define the main admin entry structure over user-centered operations.
- **D-04:** Troubleshooting must be separated from the lightweight business-facing admin shell rather than mixed into the same low-density navigation.

### Billing configuration scope
- **D-05:** The billing editor should manage pricing and active/inactive availability only.
- **D-06:** Runtime execution knobs such as `parallel_threshold_seconds`, `segment_seconds`, and `max_concurrency` should not be exposed as normal admin management controls in this phase.
- **D-07:** Phase 5 must not recreate a broader model-configuration surface under a new label; billing stays billing.

### Troubleshooting and operational visibility
- **D-08:** Phase 5 should deliver a complete troubleshooting entry for developers and advanced operators, not just a basic health page.
- **D-09:** The troubleshooting area should cover system health, task failure inspection, translation failure visibility, operation audit trails, and Bottle 1.0 / Bottle 2.0 runtime-readiness visibility.
- **D-10:** The troubleshooting area is diagnostic and investigative; routine business operations should stay outside it.
- **D-11:** Runtime status may be visible for diagnosis, but runtime tuning should not be editable as part of the Phase 5 admin surface.

### User-centered operations flow
- **D-12:** User lookup, user activity, wallet state, and user-linked admin actions should be easy to reach from one primary workflow.
- **D-13:** Wallet adjustment and user-linked redeem/audit investigation should stay reachable from the user workflow through deep links or adjacent panels.
- **D-14:** Batch/code-level redeem management can remain available as secondary operational tooling without becoming the dominant navigation model.

### the agent's Discretion
- The exact labels and ordering of the simplified main admin navigation
- The specific low-density layout treatment, as long as the resulting shell feels lighter and less crowded
- How user-centered screens deep-link into secondary redeem or audit screens
- The exact troubleshooting tab/panel composition, as long as system health, failures, audit logs, and runtime readiness are all covered

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and phase framing
- `.planning/PROJECT.md` - product boundaries, runtime split, billing ownership, and current admin direction
- `.planning/workstreams/milestone/ROADMAP.md` - current v2.0 Phase 5 milestone scope
- `.planning/workstreams/milestone/REQUIREMENTS.md` - `BILL-02`, `ADMIN-01`, `ADMIN-02`, and `ADMIN-03`
- `.planning/workstreams/milestone/STATE.md` - current milestone status and starting point before Phase 5

### Prior phase decisions that constrain this phase
- `.planning/workstreams/milestone/phases/02-desktop-local-generation/02-CONTEXT.md` - Bottle 1.0 runtime already exists; billing was deferred to Phase 5
- `.planning/workstreams/milestone/phases/02.1-admin-bottle-1-0-settings-and-billing-cleanup/02.1-CONTEXT.md` - "模型配置" should not return; Bottle 1.0 billing must stay on canonical `model_name`
- `.planning/workstreams/milestone/phases/03-lesson-output-consistency/03-CONTEXT.md` - learner-facing lesson flow is already normalized and should not be re-scoped here
- `.planning/workstreams/milestone/phases/04-desktop-link-import/04-CONTEXT.md` - desktop/full-capability runtime boundary remains intact

### Current admin shell and information architecture
- `frontend/src/AdminApp.jsx` - live admin routes currently exposed to operators
- `frontend/src/shared/lib/adminSearchParams.js` - admin navigation keys and route-label resolution
- `frontend/src/features/admin-pages/AdminUsersPage.jsx` - current user-facing admin entry
- `frontend/src/features/admin-pages/AdminHealthPage.jsx` - current minimal health page
- `frontend/src/features/admin-pages/AdminSecurityPage.jsx` - current security/admin-privilege page
- `frontend/src/features/admin-pages/AdminRedeemPage.jsx` - current redeem operations page
- `frontend/src/features/admin-workspaces/AdminUsersWorkspace.jsx` - existing user-centered combined workspace
- `frontend/src/features/admin-workspaces/AdminBusinessWorkspace.jsx` - existing grouped business workspace for users/redeem panels

### Existing troubleshooting and monitoring building blocks
- `frontend/src/features/admin-overview/AdminOverviewTab.jsx` - existing admin overview and operator metrics UI
- `frontend/src/features/admin-workspaces/AdminOpsWorkspace.jsx` - existing operations/troubleshooting workspace pattern
- `frontend/src/features/admin-workspaces/AdminMonitoringWorkspace.jsx` - broader monitoring workspace candidate with task/ops grouping
- `frontend/src/features/admin-logs/AdminLessonTaskLogsTab.jsx` - detailed generation failure inspection UI
- `frontend/src/features/admin-operation-logs/AdminOperationLogsTab.jsx` - admin operation audit UI
- `frontend/src/features/admin-users/AdminUsersTab.jsx` - user activity plus admin actions in one screen

### Billing and runtime status contracts
- `frontend/src/features/admin-rates/AdminRatesTab.jsx` - current billing UI that still mixes pricing and runtime controls
- `app/api/routers/admin.py` - current billing, wallet, redeem, security, and admin-management endpoints
- `app/api/routers/admin_console.py` - overview, operation logs, task logs, and user activity endpoints
- `app/api/serializers.py` - billing-rate serialization shape and runtime metadata exposure
- `app/schemas/admin.py` - admin request/response contracts, including current runtime-control billing fields
- `app/services/billing.py` - canonical billing model order, default rates, and runtime-control fields embedded in billing records
- `app/services/asr_model_registry.py` - Bottle 1.0 / Bottle 2.0 runtime status and display metadata

### Verification targets
- `tests/e2e/test_e2e_key_flows.py` - admin billing update and wallet flow coverage
- `tests/integration/test_admin_console_api.py` - admin overview, monitoring, and audit API coverage
- `tests/integration/test_regression_api.py` - billing-rate, subtitle-settings, and admin regression coverage
- `tests/unit/test_billing_cleanup.py` - legacy billing/admin cleanup constraints that should not regress

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/features/admin-workspaces/AdminUsersWorkspace.jsx`: already gives a user-centered shell for users, wallet logs, and billing.
- `frontend/src/features/admin-users/AdminUsersTab.jsx`: already combines user activity with admin actions such as summary, wallet adjustment, and deletion.
- `frontend/src/features/admin-overview/AdminOverviewTab.jsx`: already provides overview cards, trends, recent operations, and navigation into deeper troubleshooting.
- `frontend/src/features/admin-logs/AdminLessonTaskLogsTab.jsx`: already supports deep inspection of task failures, raw debug, translation attempts, and recovery state.
- `app/api/routers/admin_console.py`: already exposes admin overview, operation logs, task logs, and user activity endpoints needed for a dedicated troubleshooting zone.
- `app/services/asr_model_registry.py`: already exposes Bottle 1.0 / Bottle 2.0 runtime readiness metadata that can feed troubleshooting views.

### Established Patterns
- Admin route labels and active navigation state are centralized in `frontend/src/shared/lib/adminSearchParams.js`.
- Billing still flows through canonical `model_name` identifiers and must remain aligned end-to-end.
- The current rates contract in `app/schemas/admin.py` and `app/api/serializers.py` still couples pricing with runtime-control fields.
- The repo already contains separate business-facing and troubleshooting-oriented UI building blocks, even though the main shell does not yet expose them cleanly.

### Integration Points
- Simplify `frontend/src/AdminApp.jsx` and `frontend/src/shared/lib/adminSearchParams.js` into a lighter main admin shell.
- Make user-centered operations the primary admin workflow by reusing `AdminUsersWorkspace.jsx` and related user activity components.
- Introduce or expose a separate troubleshooting route/workspace using `AdminOverviewTab.jsx`, `AdminLessonTaskLogsTab.jsx`, operation logs, and runtime-status building blocks.
- Remove runtime-control editing from the billing UI and associated admin contracts so the Phase 5 billing surface is pricing-only.

</code_context>

<specifics>
## Specific Ideas

- "可以进行精简和优化，只保留必要的和信息密度低的样子"
- "只保留计费配置，不要管理运行参数"
- "一套完整排障入口方便开发者快速定位错误"
- The main business-facing admin experience should be user-centered rather than campaign-centered.
- The troubleshooting area should be separate from the main admin shell instead of mixed into the same navigation tier.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 05-billing-and-admin-alignment*
*Context gathered: 2026-03-28*
