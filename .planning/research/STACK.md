# v2.1 Research: Stack & Delivery Strategy

**Milestone:** v2.1 优化学习体验和管理体验  
**Date:** 2026-03-28  
**Scope:** 学习体验、账号体验、网页端 Bottle 边界、管理台重构、盈利转化文案

## Keep

- Keep the existing FastAPI + React/Vite + Electron split. v2.1 is a product-flow and information-architecture milestone, not a platform rewrite.
- Keep email/password as the only authentication method. Add username as profile identity, not as a second login identifier.
- Keep points/balance storage compatibility in backend models. Standardize admin-facing reads and writes around yuan in UI and API display fields.
- Keep Bottle 1.0 as a desktop-first capability and Bottle 2.0 as the web-safe default.

## Add

- Introduce a dedicated profile update path for username changes.
- Introduce wordbook review metadata and due-review endpoints instead of treating wordbook as a passive list.
- Introduce a stable immersion playback state machine around replay, pause, next/previous sentence, fullscreen, and mask interactions.
- Introduce canonical model-positioning copy shared by web upload cards, admin runtime views, and troubleshooting summaries.

## Delivery Defaults

- Prefer shadcn/radix-style account surfaces already compatible with the current frontend stack.
- Prefer reducer/state-machine style refactor for immersive learning rather than adding another ad-hoc hook layer.
- Prefer “research + copy + conversion path” changes for monetization instead of new subscription billing logic.
- Prefer route compatibility wrappers in admin so existing deep links still land in the restructured workspace.

## Source Notes

- LingQ official plans and signup positioning emphasize gated free usage and premium convenience around saved vocabulary and imports.
- Migaku pricing and product messaging emphasize immersion tooling and convenience value over raw lesson volume.
- FluentU pricing emphasizes curated interactive media, premium polish, and guided learning.
- Glossika review-mode guidance emphasizes sentence repetition and long-term memory through scheduled review.

## Official References

- https://www.lingq.com/en/learn/en/web/plans/
- https://www.lingq.com/en/signup/
- https://migaku.com/ja/pricing
- https://www.fluentu.com/en/pricing/
- https://ai.glossika.com/plans
- https://help.glossika.com/en/articles/6281457-%E5%A4%8D%E4%B9%A0%E6%A8%A1%E5%BC%8F-glossika-%E6%80%8E%E9%BA%BD%E5%B8%AE%E6%88%91%E5%B0%87%E5%AD%A6%E9%81%8E%E7%9A%84%E5%8F%A5%E5%AD%90%E8%BD%89%E7%82%BA%E9%95%B7%E6%9C%9F%E8%A8%98%E6%86%B6
