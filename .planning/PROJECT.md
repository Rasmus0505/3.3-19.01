# Bottle English Learning

## What This Is

Bottle is an English learning product for English learners. Users bring their own study materials, generate structured lessons from real media, and then practice through sentence-based learning, spelling, and review flows.

The product is intentionally split by runtime capability: the desktop client is the full-power experience, while the web app provides the strongest browser-safe subset. The platform should stay easy for non-technical learners while keeping heavy media work off your server whenever possible.

## Core Value

Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.

## Current Milestone: v2.2 桌面发布与体验收口

**Goal:** 把 Bottle 从“可开发可验证”推进到“可正式交付给真实用户使用”，补齐桌面端发布更新体系、后台运营公告能力、生词本复习体验，以及站内关键交互细节。

**Target features:**
- 可发布给用户的桌面客户端安装包与发布流程
- 桌面客户端程序本体更新能力，以及 ASR 模型/资源包增量更新能力
- 管理台公告能力：发布公告/更新日志、弹窗/横幅公告、排序/置顶、删除
- 桌面客户端代码保护与发布安全加固
- 生词本完整重做与收口：更好的复习流、遗忘曲线/掌握度、批量操作、删除冗杂信息专注复习、例句/来源回看、shadcn 风格重做
- 生词本增强候选项：对框选内容单独翻译、发音/音标支持（先做可行性评估）
- 网站 UX/交互优化：为易疑惑按钮增加半透明悬浮轻提示并自动消失

## Current State

<details>
<summary>v2.1 归档摘要 (2026-03-31 shipped) — 点击展开</summary>

**v2.1 shipped on 2026-03-31.** Full v2.1 product delivered:
- v1.0 (2026-03-27): Foundation — shared cloud generation, ASR 403 self-heal, desktop local generation
- v1.1 (2026-03-27): Bottle 1.0 billing/admin cleanup, canonical lesson pipeline, desktop link import
- v2.0 (2026-03-28): Admin simplification, pricing-only billing, troubleshooting center, onboarding cleanup, billing UX
- v2.1 (2026-03-31): Immersive learning refactor (reducer state machine, loop/rate/fullscreen), wordbook review flow, username account system, admin Chinese/yuan-first alignment, conversion copy rollout, desktop link-import bug fixes, Memo-style desktop public-link workflow

**22/22 v2.1 milestone requirements satisfied.**

See `.planning/milestones/v2.1-ROADMAP.md` for full phase details.
See `.planning/v2.1-MILESTONE-AUDIT.md` for audit report.

</details>

## Requirements

### Validated

- ✓ User can register and log in with email/password — existing
- ✓ User can hold balance / redeem codes / consume points — existing
- ✓ User can generate lessons from uploaded media through cloud ASR paths — existing
- ✓ Web and desktop now share a stable Bottle 2.0 direct-upload generation path — validated in Phase 01
- ✓ Product now exposes explicit desktop guidance instead of server fallback for Bottle 2.0 edge cases — validated in Phase 01
- ✓ Bottle 2.0 direct-upload now self-heals once on DashScope `FILE_403_FORBIDDEN` failures and surfaces exhausted retries as a dedicated cloud file-access failure — validated in Phase 01.1
- ✓ User can enter lesson-based learning and spelling practice flows — existing
- ✓ Admin can inspect health, pricing, and operational controls — existing
- ✓ Desktop client, local helper, and local ASR bundle flows already exist in the codebase — existing
- ✓ Desktop client exposes the complete product capability set, including Bottle 1.0 local generation, Bottle 2.0 cloud generation, and link-to-video generation — validated in Phase 02
- ✓ Non-technical learners can complete generation without manual ffmpeg/model/key steps — validated in Phase 02
- ✓ Desktop helper auto-starts on Electron launch; users never perceive helper, model, or ASR source — validated in Phase 02
- ✓ Generated lessons from Bottle 1.0 and Bottle 2.0 become consistent learning artifacts — validated in Phase 3
- ✓ Users can enter spelling/lesson practice from generated content regardless of generation source — validated in Phase 3
- ✓ Desktop users can import media from supported links through local tooling — validated in Phase 4
- ✓ Admin shell restructured: user-first workflow with billing nested under users workspace, dedicated troubleshooting route — validated in Phase 5
- ✓ Billing editor is pricing-only: runtime tuning controls removed; admin and public billing APIs aligned — validated in Phase 5
- ✓ Admin troubleshooting center exposes Bottle 1.0 and Bottle 2.0 runtime readiness alongside system health and logs — validated in Phase 5
- ✓ Getting Started guide removed from web app: no dead onboarding overlay or orphaned auth exemptions — validated in Phase 6
- ✓ Billing UX improved: insufficient balance shows "充值后生成" recovery button; estimate display simplified — validated in Phase 6
- ✓ Bottle 1.0 / Bottle 2.0 benchmark, naming, CTA, and monetization contract is now fixed in reusable Phase 7 specs — validated in Phase 7
- ✓ Web-facing Bottle boundary now has a canonical rule set: Bottle 2.0 is the default web path, Bottle 1.0 is visible but desktop-only, and balance recovery stays on recharge — validated in Phase 7
- ✓ Learning experience is now stable for repeated sentence listening, fixed speed switching, and immersive shortcut/fullscreen/mask combinations — validated in Phase 8
- ✓ Wordbook now supports due review, review progress, and context-rich revision instead of only passive collection — validated in Phase 09
- ✓ Account onboarding now uses unique usernames while login remains email-first and low risk — validated in Phase 09
- ✓ Web upload/account surface now keeps Bottle 1.0 desktop-only while presenting Bottle 2.0 as the web-first path with Bottle-only naming — validated in Phase 09
- ✓ Admin operators now work in a Chinese-first, yuan-first backend with clearer model naming and cleaner information architecture — validated in Phase 10
- ✓ Pricing, recharge, and desktop download paths now use the finalized upload-surface copy, recharge recovery, desktop guidance, and static-web verification flow — validated in Phase 11
- ✓ Desktop public-link import is now productized as a formal Memo-style workflow with explicit public-link promise, failure boundary, and release checklist — validated in Phase 07.1
- ✓ Bottle 1.0 + link-import desktopSourcePath bug fixed: IPC serialization no longer strips the Object.defineProperty field — validated in Phase 11-04
- ✓ Bottle 2.0 + link-import thumbnail bug fixed: yt-dlp thumbnail flows through poll response into lesson cover_data_url with file-extraction fallback — validated in Phase 11-04

### Active

- [ ] 用户可以下载并安装可正式发布的桌面客户端，而不是只依赖本地开发产物
- [ ] 桌面客户端可以检测程序新版本，并尽量通过增量方式完成程序与 ASR 模型/资源更新
- [ ] 管理员可以在后台发布、排序、置顶和删除公告，并将其作为更新日志、弹窗或横幅投放到用户端
- [ ] 生词本复习体验围绕“高频复习、低噪音界面、掌握度反馈”完成一次产品级重做
- [ ] 网站关键按钮和易疑惑操作具备统一的轻提示与交互引导，减少理解成本

### Out of Scope

- User-provided ASR API key configuration — platform-managed billing and keys keep the experience simple
- Full browser parity for local tooling features — browser/runtime constraints are acceptable where local tooling is required
- Making the server the primary media processing worker — this conflicts with cost and capacity limits
- Introducing subscriptions or membership bundles — this milestone focuses on per-use conversion improvements first
- Letting web users actually execute Bottle 1.0 — Bottle 1.0 remains desktop-only by product boundary
- Replacing email login with username login — higher auth churn risk than this milestone needs

## Context

- Existing brownfield codebase already contains FastAPI backend, React/Vite web app, Electron desktop client, billing/redeem flows, admin surfaces, lesson generation, and learning flows.
- Desktop capability already includes local helper patterns, local ASR model management, bundled ffmpeg/yt-dlp resources, and URL import building blocks.
- Web and desktop already share a large part of the frontend and product model, which should be preserved rather than split into separate products.
- Current product direction is not to rebuild from scratch, but to sharpen product boundaries, stabilize generation flows, reduce server load, and improve the learner experience.
- Market reference pass for this milestone is based on official materials checked on 2026-03-28 from LingQ, Migaku, FluentU, and Glossika. Shared patterns: sentence-centric repetition, one-click vocabulary capture, due-review loops, strong scenario-based plan positioning, and premium upsell through convenience rather than raw feature count.
- Current v2.2 direction is to close the gap between an internally usable Electron app and a user-deliverable desktop product with managed publishing, upgrade, and runtime protection boundaries.
- Desktop code already contains partial client-update state handling and model delta-update logic, so this milestone should productize and verify that path rather than invent a second update system.
- Frontend already ships Radix tooltip/popover primitives, making a consistent hint system feasible without introducing a new UI foundation.
- Wordbook backend routes, review queue fields, and source-link context already exist; the largest opportunity is now the learning workflow, information architecture, and focused review surface.

## Constraints

- **Server Capacity**: Avoid heavy server-side media conversion and long-running ASR workloads — server performance is limited.
- **User Simplicity**: Learners should not need to understand API keys, model setup, ffmpeg, or yt-dlp.
- **Runtime Split**: Desktop must be the complete experience; web should provide only what browsers can reliably support.
- **Web Delivery Contract**: 凡涉及网页端前端行为或路由的改动，完成标准必须包含同步并验证 `app/static`；仅修改 `frontend/src` 不视为网页端已完成。
- **Billing**: Bottle 1.0 and Bottle 2.0 are both paid capabilities with prices managed in admin tooling.
- **Brownfield Preservation**: Existing auth, wallet, admin, lesson, and desktop foundations should be optimized, not discarded.
- **Auth Risk Control**: Username can expand identity and profile UX, but email/password remains the only login path.
- **Desktop Security Boundary**: “避免核心代码泄露” means raising extraction and reuse cost for packaged desktop logic and assets, not claiming perfect anti-reverse-engineering guarantees.
- **Update Reliability**: Desktop update flows must fail safely and explain recovery clearly; a broken updater is worse than a manual reinstall path.
- **Scope Control**: 发音/音标与框选翻译先做可行性评估，再决定是否进入本里程碑硬承诺，避免把探索项直接写成已承诺交付。

## Milestone: v2.1 Summary

**Shipped:** 2026-03-31
**Phases:** Phase 7, Phase 7.1, Phase 8, Phase 9, Phase 10, Phase 11
**Plans:** 21 plans, 13 tasks
**Key outcomes:**
- Official competitor matrix and Bottle 1.0/2.0 positioning spec locks naming, boundary, and monetization narrative for all downstream phases
- Memo-style desktop public-link import productized with explicit support promise, failure boundary, and release checklist
- Immersive learning refactored into reducer-driven state machine: single-sentence loop, fixed 0.75x/0.90x/1.00x playback rate, fullscreen/mask/previous-sentence all preserved as display-only preferences
- Wordbook upgraded from passive collection list to active due-review entry point with again/good grading and next-review scheduling
- Account system added unique username registration, tabbed auth UI, and personal center shell
- Admin fully Chinese-first, yuan-primary, Bottle 1.0/2.0 primary naming with technical names demoted to secondary notes
- Conversion copy locked: model cards, recharge recovery, desktop CTA, and static web bundle all finalized
- Two critical desktop link-import bugs fixed: desktopSourcePath IPC serialization loss and missing video cover from yt-dlp thumbnail

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Desktop client is the primary product surface for full generation capabilities | Desktop can safely host local models, ffmpeg, yt-dlp, and local helper workflows | ✅ Validated in Phase 02 |
| Web app centers on Bottle 2.0 cloud generation | Browser users still need a useful path, but browser-local heavy tooling is not reliable enough | ✅ Validated in Phase 01 & 02 |
| Platform manages ASR keys instead of end users | Learners are non-technical and should pay with points/redeem codes rather than configure secrets | ✅ Validated |
| Server should stay light and avoid becoming the media processing bottleneck | Cost and infrastructure limits make centralized heavy processing a bad default | ✅ Validated in Phase 01 & 01.1 |
| Generated media should become lesson/practice artifacts regardless of generation path | Users care about learning outcomes, not the underlying ASR route | ✅ Validated in Phase 3 |
| v2.1 should benchmark market patterns before inventing new learning/admin flows | The user explicitly wants product references first, not isolated local redesign | ✅ Validated in Phase 7 |
| Username is a unique profile identity, not a login credential | This improves onboarding and management without expanding auth risk | ✅ Validated in Phase 9 |
| Web may explain Bottle 1.0 but may not execute it | This preserves the desktop-only boundary while still creating a conversion path | ✅ Locked in Phase 7 |
| Admin monetary UI should standardize on yuan | Mixed cents/points language increases operator confusion | ✅ Validated in Phase 10 |
| Monetization improvements stay inside pay-per-use copy and CTA work, not subscriptions | Competitor benchmarks favor clearer scenario guidance over more package complexity for this milestone | ✅ Locked in Phase 7 |
| Immersive playback state should be reducer-driven with explicit loop/rate/display contracts | The existing page had too many overlapping state transitions for replay, navigation, fullscreen, and mask controls | ✅ Validated in Phase 8 |
| Final conversion landing should use exact model-card and blocked-state copy instead of adding new marketing layers | The final upload-surface pass had to follow the locked context precisely, including recharge, desktop, and complex-media wording | ✅ Validated in Phase 11 |
| Desktop public-link import is a formal product capability with explicit support boundary | Public links are the primary onboarding path; helper/yt-dlp internals stay behind the scenes | ✅ Validated in Phase 07.1 |
| Object.defineProperty fields do not survive Electron IPC serialization — always use plain data fields | The desktopSourcePath field was silently dropped causing link-import failures | ✅ Validated in Phase 11-04 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-31 after v2.2 milestone initialization*
