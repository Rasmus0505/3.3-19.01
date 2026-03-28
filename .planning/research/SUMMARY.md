# v2.1 Research Summary

**Milestone:** v2.1 优化学习体验和管理体验  
**Date:** 2026-03-28

## Key Findings

- Market references consistently center language learning around sentence replay, contextual vocabulary capture, and scheduled review rather than isolated feature toggles.
- Premium conversion works best when the product clearly explains when to use the fast default path versus the higher-value advanced path.
- Admin/operator products work better when technical internals are hidden behind localized business language and clear workflow grouping.

## Decisions for This Milestone

- Default immersive mode should support single-sentence loop and fixed speed presets: `0.75x / 0.9x / 1.0x`.
- Wordbook should become a due-review workflow, not only a storage list.
- Username is required and unique, but login remains email/password only.
- Web upload keeps Bottle 1.0 visible as explanation and CTA, but Bottle 2.0 is the only executable browser flow.
- Admin surfaces should standardize on yuan, Chinese labels, and Bottle 1.0 / Bottle 2.0 primary naming.
- Monetization changes stay inside the existing per-use model: pricing anchors, recharge prompts, desktop download prompts, and scenario-based copy.

## Immediate Inputs to Requirements

- Immersive refactor must explicitly solve replay/pause/next/fullscreen/mask interaction conflicts.
- Wordbook requirements must include review metadata and due-review actions.
- Account requirements must include username registration, profile rename, and branded auth UI.
- Admin requirements must include yuan-first display, route compatibility, and separation of pricing vs diagnostics.

## Official References

- LingQ plans: https://www.lingq.com/en/learn/en/web/plans/
- LingQ signup positioning: https://www.lingq.com/en/signup/
- Migaku pricing: https://migaku.com/ja/pricing
- FluentU pricing: https://www.fluentu.com/en/pricing/
- Glossika plans: https://ai.glossika.com/plans
- Glossika review mode: https://help.glossika.com/en/articles/6281457-%E5%A4%8D%E4%B9%A0%E6%A8%A1%E5%BC%8F-glossika-%E6%80%8E%E9%BA%BD%E5%B8%AE%E6%88%91%E5%B0%87%E5%AD%A6%E9%81%8E%E7%9A%84%E5%8F%A5%E5%AD%90%E8%BD%89%E7%82%BA%E9%95%B7%E6%9C%9F%E8%A8%98%E6%86%B6
