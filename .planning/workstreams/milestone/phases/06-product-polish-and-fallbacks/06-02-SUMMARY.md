---
provides:
  - Dedicated "充值后生成" button when desktop billing is insufficient
  - Primary button no longer disabled due to insufficient billing alone
  - Simplified single-line estimated charge display without tooltip
affects:
  - v2.0 Phase 6 completion
---

# Phase 06 Plan 02: Improve Billing Insufficiency UX Summary

**Shipped billing insufficiency UX improvement: dedicated recharge button and simplified estimate display.**

## Outcome

- Added `showRechargeButton` derived state — true when `desktopClientBillingEnabled && desktopBillingState.status === "insufficient"`
- Fixed primary button guard: removed `"insufficient"` from the disabled condition so it only disables for "offline", "checking", or "error"
- Added "充值后生成" button styled with `getUploadToneStyles("recoverable")` that navigates to `/redeem`
- Simplified estimated charge display: replaced ASR/MT breakdown with tooltip by single line `预估消耗：{amount}`
- Removed `Tooltip` / `TooltipContent` wrapping from the billing idle alert

## Performance

- **Duration:** inline execution (~3 min)
- **Tasks:** 4 (all wave 1)
- **Files modified:** 1

## Commits

- `8142241d` (`fix: show recharge button when desktop billing insufficient`)
