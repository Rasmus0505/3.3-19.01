# Phase 6: Product Polish and Fallbacks - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 06-product-polish-and-fallbacks
**Mode:** inline execution (no formal discuss-phase)
**Areas discussed:** New-user onboarding, billing insufficiency UX, estimated-price display

---

## New-user onboarding

|| Option | Description | Selected |
|--------|---------|------------|----------|
|| Keep Getting Started guide | Overlay + step-by-step guide on first visit | |
|| Remove entirely | No onboarding overlay; users enter via upload/history naturally | ✓ |
|| Reduce to single prompt | Show one dismissible welcome card without step-by-step overlay | |

**User's choice:** Remove entirely
**Notes:** Desktop-first product direction means the web app onboarding overlay adds no value. Users entering via desktop guidance are already oriented; web-only users can self-navigate via upload/history without a guided overlay. Removing it simplifies the LearningShellContainer and LearningShellPanelContent significantly.

---

## Billing insufficiency UX

|| Option | Description | Selected |
|--------|---------|------------|----------|
|| Keep disabled button with tooltip | Primary button stays disabled; tooltip explains why | |
|| Show dedicated recharge button | When status=insufficient, show "充值后生成" button navigating to /redeem | ✓ |
|| Inline top-up flow | Show top-up UI inline in the upload panel | |

**User's choice:** Show dedicated recharge button
**Notes:** Insufficient billing is a recoverable state distinct from offline/error. The button should read "充值后生成" and navigate to /redeem. The button uses the "recoverable" tone style. The primary disabled button still shows for the combined guard that includes offline and link-mode states.

---

## Estimated-price display

|| Option | Description | Selected |
|--------|---------|------------|----------|
|| Keep full ASR/MT breakdown with tooltip | Show "ASR {x} + MT 约 {y}" with detailed tooltip explanation | |
|| Simplify to single-line estimate | Show "预估消耗：{amount}" without breakdown or tooltip | ✓ |
|| Hide estimate entirely when insufficient | Remove estimate line when balance is insufficient | |

**User's choice:** Simplify to single-line estimate
**Notes:** The ASR/MT breakdown with tooltip added noise to the idle state. The tooltip text ("ASR 按素材秒数折算分钟估算；MT 按 qwen-mt-flash 的 1k Tokens 费率与常见字幕量近似估算") is implementation detail that clutters the billing UI. A single "预估消耗：{amount}" line communicates the same information at a glance.

---

## Phase completion scope

The inline execution covered two distinct pieces of work:

1. **Getting Started guide removal** — route, panel, sidebar item, overlay, and all related state/handlers removed from LearningShellContainer, LearningShellPanelContent, LearningShellSidebar, and bootstrap.jsx.

2. **Billing UI polish** — insufficient billing now falls through to a dedicated "充值后生成" button; estimated price simplified to single-line display.

Both pieces were executed inline without formal discuss-phase since the scope was clear from prior roadmap context and product direction. This log retroactively captures the decision trail for audit purposes.
