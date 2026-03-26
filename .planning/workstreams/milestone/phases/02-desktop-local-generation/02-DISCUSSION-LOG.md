# Phase 2: Desktop Local Generation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 02-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 02-desktop-local-generation
**Areas discussed:** User experience principle, Helper strategy, Model strategy, Pipeline integration, Technical ownership

---

## User Experience Principle

|| Option | Description | Selected |
|--------|-------------|----------|
| Technical status visible | Show helper status, model state, cloud/local indicator | |
| Zero technical detail | Users see unified generation flow, no diagnostics, no banners | ✓ |

**[auto]** Q: "Should users see helper status, model state, or ASR source?" → Selected: Zero technical detail
**[auto]** Q: "Should there be a diagnostic panel?" → Selected: Remove it
**[auto]** Q: "Should Bottle 1.0 have its own status text?" → Selected: No — reuse existing stage文案
**[auto]** Q: "Should model corruption show a Banner explaining the degradation?" → Selected: No — unified failure state only

**User's choice:** Complete user blindness to ASR source. No diagnostic panel, no status indicators, no degradation banners.
**Notes:** All technical details (helper, model, cloud/local) are fully hidden from users.

---

## Helper Strategy

|| Option | Description | Selected |
|--------|-------------|----------|
| User-triggered | Start helper when user first clicks Bottle 1.0 (10-30s cold start) | |
| Auto-start on boot | Start helper when Electron launches, silently in background | ✓ |

**[auto]** Q: "Helper start strategy?" → Selected: Auto-start on boot
**[auto]** Q: "Should users see helper startup status?" → Selected: No — completely silent
**[auto]** Q: "Should there be a client diagnostics panel?" → Selected: No — remove it

**User's choice:** Helper starts automatically, silently, invisibly. No technical feedback to users.
**Notes:** Auto-start preferred for instant usability. Silent approach avoids complexity.

---

## Model Strategy

|| Option | Description | Selected |
|--------|-------------|----------|
| Download at first use | User downloads model when first using Bottle 1.0 | |
| Bundle in installer | Model ships inside desktop installer, ready immediately | ✓ |

**[auto]** Q: "Model distribution?" → Selected: Bundle in installer (faster-distil-small.en)
**[auto]** Q: "Future new models?" → Selected: Prefer download installation (B), installer update (A) as fallback
**[auto]** Q: "Model file location?" → Selected: desktop-client/models/faster-distil-small.en/
**[auto]** Q: "Model corrupted?" → Selected: Guide user to re-download via /api/local-asr-assets/download-models

**User's choice:** Pre-installed model in installer package. Future models download-first. Corrupted model triggers re-download flow.
**Notes:** Model path: `D:\3.3-19.01\asr-test\models\faster-distil-small.en` in dev; `desktop-client/models/` in installer.

---

## Pipeline Integration

|| Option | Description | Selected |
|--------|-------------|----------|
| Separate pipeline | Local ASR results use a different lesson pipeline | |
| Unified pipeline | Local ASR results write to lesson_task via the same pipeline as cloud | ✓ |

**[auto]** Q: "Should local ASR results use the same lesson_task table?" → Selected: Yes — unified pipeline
**[auto]** Q: "Should learning/practice flows differ based on generation source?" → Selected: No — identical experience

**User's choice:** Unified lesson_task pipeline. Users cannot distinguish Bottle 1.0 vs Bottle 2.0 generation in downstream flows.
**Notes:** Simplifies backend, consistent user experience.

---

## Claude's Discretion (decided by auto/defaults)

- Exact visual treatment of the unified failure state — defaults to existing failure UI
- Exact copy for model re-download guidance — defaults to generic "something went wrong" with re-download CTA
- Helper process restart behavior on crash — auto-restart with max retries, unified failure on exhausted retries
- Whether the model directory uses fixed subdirectory name — fixed subdirectory name for current model, versioned layout deferred for future

