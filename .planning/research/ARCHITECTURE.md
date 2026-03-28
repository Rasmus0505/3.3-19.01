# v2.1 Research: Architecture Impact

**Milestone:** v2.1 优化学习体验和管理体验  
**Date:** 2026-03-28

## Existing Architecture to Reuse

- Shared learning shell for history, upload, wordbook, redeem, and admin routes
- Existing immersive page with playback, shortcut settings, and wordbook collection hooks
- Existing admin route shell with users, billing, redeem, and troubleshooting surfaces
- Existing wallet and pricing model that can expose yuan without changing storage semantics

## Recommended Build Order

1. Research and product copy normalization
2. Web upload model-card boundary and Bottle 1.0 guardrails
3. Immersive playback-state refactor
4. Wordbook review model and review endpoints
5. Auth/profile username path and new account UI
6. Admin IA and yuan-first contract cleanup
7. Final monetization copy, recharge path, and regression sweep

## New vs Modified Components

### New

- Research and monetization summary artifacts
- Username profile update endpoint and account settings entry
- Wordbook due-review endpoint(s)
- Shared model-positioning copy helpers for upload/admin surfaces

### Modified

- Immersive learning state orchestration
- Wordbook list UI and payload shape
- Auth panel request/response flow
- Upload model cards and browser guardrails
- Admin overview, logs, users, pricing, and runtime-readiness surfaces

## Integration Notes

- Browser-side Bottle 1.0 blocking must happen both in frontend card behavior and backend lesson-task admission.
- Username rollout must preserve desktop session restore and existing auth storage behavior.
- Admin yuan-first rollout should keep legacy cents fields for compatibility but stop using them as canonical display fields.
- Old admin deep links must keep resolving to the new workspace structure.
