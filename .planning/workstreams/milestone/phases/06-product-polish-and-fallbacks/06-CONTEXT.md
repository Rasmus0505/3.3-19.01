# Phase 6: Product Polish and Fallbacks - Context

**Gathered:** 2026-03-28
**Status:** Retroactively documented after inline execution

<domain>
## Phase Boundary

Phase 6 is the final polish and fallback layer for the v2.0 milestone. It covers removing deprecated onboarding surfaces, simplifying billing UI states, and ensuring the product gracefully handles edge cases without exposing technical internals. This phase does not add generation features, new runtime paths, or admin surface changes.
</domain>

<decisions>
## Implementation Decisions

### New-user onboarding removal
- **D-01:** The `/getting-started` route should be removed from the routing table.
- **D-02:** The `getting-started` panel should be removed from `LearningShellPanelContent`.
- **D-03:** The `getting-started` sidebar item should be removed from `PANEL_ITEMS`.
- **D-04:** `GettingStartedGuideOverlay` and all associated state (`gettingStartedProgress`, `showGettingStartedWelcome`, `gettingStartedGuideActive`, `gettingStartedGuideStepIndex`) and handlers should be removed from `LearningShellContainer`.
- **D-05:** `GettingStartedPanel` import should be removed from `LearningShellPanelContent`.
- **D-06:** `GettingStartedGuideOverlay` import should be removed from `LearningShellContainer`.
- **D-07:** `showGettingStartedWelcome`, `onDismissGettingStartedWelcome`, and `onStartGettingStartedGuide` props should be removed from the `LearningShellPanelContent` call site.
- **D-08:** `PANEL_ITEMS[0]` should no longer reference getting-started; the sidebar defaults to `history` as the primary entry panel.

### Billing insufficiency UX
- **D-09:** When `desktopBillingState.status === "insufficient"`, the primary button should not be disabled. Instead, a dedicated "充值后生成" button should be shown, styled with the "recoverable" tone, and navigating to `/redeem`.
- **D-10:** The combined primary-button guard condition should be updated so "insufficient" no longer contributes to disabling the primary button; it only disables when combined with "offline" or link-mode blocking.
- **D-11:** `showRechargeButton` should be a derived boolean derived from `desktopClientBillingEnabled && desktopBillingState.status === "insufficient"`.

### Estimated-price display
- **D-12:** The estimated price display in the idle billing alert should be simplified from the ASR/MT breakdown with tooltip to a single line: `预估消耗：{amount}` or "选择文件后显示" or "该模型未配置单价".
- **D-13:** The tooltip breakdown and its explanatory text should be removed from the idle state rendering.

### Public panel access
- **D-14:** `LearningShellPanelContent` should no longer treat `getting-started` as a public panel. After removal, the auth gate `!accessToken ? <AuthPanel /> : <panel />` applies uniformly to all panels.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase framing
- `.planning/workstreams/milestone/ROADMAP.md` — Phase 6 goal and v2.0 milestone context
- `.planning/workstreams/milestone/REQUIREMENTS.md` — `LEARN-03` ("Users do not need technical knowledge of ASR routes to continue learning after generation — Phase 6")

### Affected files
- `frontend/src/app/bootstrap.jsx` — routing table: `/getting-started` route removal
- `frontend/src/app/learning-shell/LearningShellContainer.jsx` — GettingStartedGuideOverlay removal, all related state and handlers
- `frontend/src/app/learning-shell/LearningShellPanelContent.jsx` — GettingStartedPanel removal, prop interface cleanup
- `frontend/src/app/learning-shell/LearningShellSidebar.jsx` — PANEL_ITEMS getting-started entry removal, getPanelItemByPathname cleanup
- `frontend/src/features/upload/UploadPanel.jsx` — billing insufficiency button and estimated-price display

### Prior phase decisions
- `.planning/workstreams/milestone/phases/04-desktop-link-import/04-CONTEXT.md` — product direction: desktop-first, browser-safe, no technical exposure
- `.planning/workstreams/milestone/phases/05-billing-and-admin-alignment/05-CONTEXT.md` — billing UX tone states: "recoverable" style for insufficient

### Verification targets
- `frontend/src/app/learning-shell/LearningShellContainer.jsx` — no reference to GettingStartedGuideOverlay, gettingStartedProgress, gettingStartedGuideActive
- `frontend/src/app/learning-shell/LearningShellPanelContent.jsx` — no reference to GettingStartedPanel, showGettingStartedWelcome
- `frontend/src/app/learning-shell/LearningShellSidebar.jsx` — no "getting-started" in PANEL_ITEMS
- `frontend/src/features/upload/UploadPanel.jsx` — showRechargeButton logic present; single-line estimated charge display

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getUploadToneStyles("recoverable").button` — already exists and provides the correct recoverable-state styling for the recharge button
- `navigate("/redeem")` — `/redeem` route already exists in the routing table

### Established Patterns
- Sidebar default is `PANEL_ITEMS[0]` (history after this change)
- Auth gate pattern: `!accessToken ? <AuthPanel /> : <panel />`
- Billing tone styles: idle/recoverable/error already used in UploadPanel

### Integration Points
- GettingStartedGuideOverlay was rendered conditionally inside `LearningShellContainer` JSX
- GettingStartedPanel was rendered in `renderActivePanelContent()` under `activePanel === "getting-started"`
- PANEL_ITEMS[0] was getting-started; after removal history becomes PANEL_ITEMS[0]

</code_context>

<specifics>
## Specific Ideas

- The "充值后生成" button reads exactly `充值后生成` and navigates to `/redeem`
- The estimated charge display reads exactly `预估消耗：{formatted_amount}` or `选择文件后显示` or `该模型未配置单价`
- No tooltip on the simplified estimate line
- `showRechargeButton` is derived from `desktopClientBillingEnabled && desktopBillingState.status === "insufficient"`

</specifics>

<deferred>
## Deferred Ideas

- Any new onboarding flow remains out of scope for Phase 6
- Desktop client onboarding (if any) belongs in a future phase or desktop-specific workstream

</deferred>

---

*Phase: 06-product-polish-and-fallbacks*
*Context documented: 2026-03-28*
