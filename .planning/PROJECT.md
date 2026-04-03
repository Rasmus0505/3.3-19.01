# Bottle English Learning

## What This Is

Bottle is an English learning product for English learners. Users bring their own study materials, generate structured lessons from real media, and then practice through sentence-based learning, spelling, and review flows.

The product is intentionally split by runtime capability: the desktop client is the full-power experience, while the web app provides the strongest browser-safe subset. The platform should stay easy for non-technical learners while keeping heavy media work off your server whenever possible.

## Core Value

Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.

## Current Milestone: v2.3 学习体验与导入流程优化 — SHIPPED 2026-04-03

**Goal:** 修复沉浸式学习已知 Bug、增强生词本词条信息完整性、优化素材导入 UI/UX 流程，提升产品细节体验。

**Target features:** (all completed)
- ✅ 沉浸式学习 Bug 收口：autoAdvanceGuard guard + TTS 三段降级 + 答题框颜色黄/绿区分
- ✅ 生词本词条增强：翻译区块独立显示 + Web Speech API 发音按钮
- ✅ 素材导入 UX 优化：默认链接 Tab + 文案精简 + 快捷键两行布局
- ✅ 字幕遮挡板位置记忆：居中恢复 + 启用状态跨视频记忆
- ✅ 链接恢复增强：source_url 检查 + 覆盖确认弹窗

## Current State

<details>
<summary>v2.3 归档摘要 (2026-04-03 shipped) — 点击展开</summary>

**v2.3 shipped on 2026-04-03.** 4 phases, 10 plans, 12/12 requirements complete:
- v1.0 (2026-03-27): Foundation — shared cloud generation, ASR 403 self-heal, desktop local generation
- v1.1 (2026-03-27): Bottle 1.0 billing/admin cleanup, canonical lesson pipeline, desktop link import
- v2.0 (2026-03-28): Admin simplification, pricing-only billing, troubleshooting center, onboarding cleanup, billing UX
- v2.1 (2026-03-31): Immersive learning refactor, wordbook review flow, username account system, admin Chinese/yuan-first alignment, conversion copy rollout, desktop link-import bug fixes, Memo-style desktop public-link workflow
- v2.2 (2026-04-02): Desktop stable-only release channel, model delta update, runtime boundary hardening (preload audit 31 methods, sandbox, openExternalUrl whitelist), announcement system (CRUD + changelog/banner/modal), wordbook review UX overhaul (due queue, mastery feedback, forgetting curve scheduling), wordbook batch ops + translation dialog + lightweight hint system
- v2.3 (2026-04-03): Immersive learning bug fixes (4 bugs), wordbook entry enhancements (translation + pronunciation), material import UX optimization (default link tab, copy simplification, shortcut layout), subtitle mask position reset + link restore enhancement

**23/23 milestone phases satisfied (Phase 22 removed from scope).**

See `.planning/milestones/v2.3-ROADMAP.md` for full phase details.
See `.planning/milestones/v2.3-REQUIREMENTS.md` for archived requirements.

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
- ✓ Desktop stable-only release channel established with signed NSIS installer — validated in Phase 13
- ✓ Desktop delta update system productized for both program and ASR model/resources — validated in Phase 14
- ✓ Desktop runtime security boundaries hardened: 31 preload methods audited, renderer sandbox enforced, openExternalUrl whitelist active — validated in Phase 15
- ✓ Announcement system fully operational: CRUD, changelog/banner/modal delivery, admin management UI — validated in Phase 16
- ✓ Wordbook review UX overhauled: due queue, mastery feedback, forgetting curve scheduling, batch ops, translation dialog — validated in Phase 17
- ✓ Lightweight hint system applied across key buttons and ambiguous actions — validated in Phase 18
- ✓ Immersive learning bug fixes: input-preserving rate/loop toggle, prev sentence TTS fallback, answer box color differentiation — validated in Phase 19
- ✓ Wordbook entry enhancements: independent translation block above each entry, Web Speech API pronunciation button — validated in Phase 20
- ✓ Material import UX: default link tab, simplified copy, auto-fill title, shortcut two-row layout — validated in Phase 21
- ✓ Subtitle mask position reset (centered on new video, enabled state persists across videos) and link restore enhancement — validated in Phase 23

### Active

_(All v2.3 requirements shipped — next milestone TBD)_

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
- v2.2 completed desktop publishing pipeline, announcement system, and wordbook review UX overhaul. v2.3 focuses on bug fixes and UX polish in learning and import flows.
- Immersive learning already uses a reducer-driven state machine with explicit loop/rate/display contracts (Phase 8) — bug fixes in this milestone should not regress that architecture.
- Wordbook already supports word-level translation field and pronunciation button — v2.3 extends these to display in the wordbook panel above each entry.
- Upload surface already has link/file tabs — v2.3 changes the default tab and redesigns the link-import flow with a configuration modal.

## Constraints

- **Server Capacity**: Avoid heavy server-side media conversion and long-running ASR workloads — server performance is limited.
- **User Simplicity**: Learners should not need to understand API keys, model setup, ffmpeg, or yt-dlp.
- **Runtime Split**: Desktop must be the complete experience; web should provide only what browsers can reliably support.
- **Web Delivery Contract**: 凡涉及网页端前端行为或路由的改动，完成标准必须包含同步并验证 `app/static`；仅修改 `frontend/src` 不视为网页端已完成。
- **Billing**: Bottle 1.0 and Bottle 2.0 are both paid capabilities with prices managed in admin tooling.
- **Brownfield Preservation**: Existing auth, wallet, admin, lesson, and desktop foundations should be optimized, not discarded.
- **Auth Risk Control**: Username can expand identity and profile UX, but email/password remains the only login path.
- **Desktop Security Boundary**: "避免核心代码泄露" means raising extraction and reuse cost for packaged desktop logic and assets, not claiming perfect anti-reverse-engineering guarantees.
- **Update Reliability**: Desktop update flows must fail safely and explain recovery clearly; a broken updater is worse than a manual reinstall path.
- **Immersive Architecture**: Immersive state machine contract from Phase 8 must be preserved — bug fixes should not remove reducer structure or re-introduce ad-hoc state transitions.
- **Wordbook Backward Compatibility**: Wordbook review flow, due queue, and mastery scheduling from Phase 17 must be preserved — enhancements should layer on top, not replace.

## Milestone: v2.3 Summary

**Shipped:** 2026-04-03
**Phases:** Phase 19, 20, 21, 23
**Key outcomes:**
- Immersive learning 4-bug fix: autoAdvanceGuard guard + TTS three-tier fallback + answer box yellow/green color differentiation
- Wordbook entry enhancements: translation block with bg-muted/20 + Web Speech API pronunciation with spinner and 2s auto-recovery
- Material import UX: default link tab, simplified copy, shortcut two-row layout
- Subtitle mask position reset: prevLessonIdRef forces center on new lessonId, enabled state persists via localStorage
- Link restore enhancement: source_url check + hasLessonMedia cache check before triggering yt-dlp re-download

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
| Desktop stable-only channel with signed installer for v2.2 release | A/B or dev channels introduce user confusion for a learning product; stable-only simplifies support | ✅ Validated in Phase 13 |
| Announcement system delivers changelog/banner/modal from admin CRUD | Operators need a way to communicate updates to learners without app store dependencies | ✅ Validated in Phase 16 |
| Wordbook review uses spaced-repetition scheduling with again/good grading | Simple again/good with calculated next-review matches learner expectations without complexity of full SM-2 | ✅ Validated in Phase 17 |
| Immersive answer box uses yellow for AI/hint content, green for user-typed content | Color differentiation helps learners see what they typed vs. what was suggested | ✅ Validated in Phase 19 |
| autoAdvanceGuard: postAnswerReplayState !== "idle" blocks sentence advance during typing | Prevents unintended replay when switching rate/loop mid-typing | ✅ Validated in Phase 19 |
| TTS three-tier fallback: clip → Web Speech API (en-US) → error message | Graceful degradation when previous sentence audio unavailable | ✅ Validated in Phase 19 |
| Wordbook translation block: bg-muted/20, independent visual area above each entry | Clean separation without changing card layout or height | ✅ Validated in Phase 20 |
| Wordbook pronunciation: Web Speech API (en-US), spinner while speaking, error icon 2s auto-recover | Zero-cost, browser-native, fails gracefully | ✅ Validated in Phase 20 |
| Upload default tab: DESKTOP_UPLOAD_SOURCE_MODE_LINK | Link import is the common path; file upload is secondary | ✅ Validated in Phase 21 |
| Subtitle mask: prevLessonIdRef forces center on new lessonId | Ensures mask position never persists across different videos | ✅ Validated in Phase 23 |
| Subtitle mask: enabled state persists via localStorage | Verified existing code implements D-03 (enabled persistence) | ✅ Validated in Phase 23 |
| Link restore: source_url check + hasLessonMedia cache check before download | Prevents unnecessary re-download if media already cached locally | ✅ Validated in Phase 23 |

## Current Milestone: v2.4 词汇等级预处理与 CEFR 沉浸式展示

**Goal:** 实现视频字幕一次性预处理分析，并在沉浸式学习中以颜色块实时标注每个词的 CEFR 等级，重构上一句词选入生词本的交互反馈。

**Target features:**
- 批量词汇预处理：视频首次打开时一次性分析所有字幕，查 cefr_vocab.json 给每个词标上 CEFR 等级，结果缓存到 localStorage
- 沉浸式学习词汇色块高亮：本句 + 上一句每词叠加 CEFR 等级色块，绿色 = i+1，黄色 = 超出 i+1
- 上一句生词本选择交互重构：选词入生词本后 token 块流畅放大动画（scale），不再只用背景色变化
- 词汇难度色块复用：历史记录列表标注素材 CEFR 等级（色块 + 等级名）
- 个人中心 i 水平设置：选择 CEFR 水平（默认 B1），含 Duolingo 风格中文说明

---

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
*Last updated: 2026-04-03 after v2.3 milestone completion*
