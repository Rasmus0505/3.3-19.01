# Bottle English Learning

## What This Is

Bottle is an English learning product for English learners. Users bring their own study materials, generate structured lessons from media, and then practice with spelling and sentence-based learning flows.

The product is intentionally split by runtime capability: the desktop client is the full-power experience, while the web app provides the strongest browser-safe subset. The platform should stay easy for non-technical learners while keeping heavy media work off your server whenever possible.

## Core Value

Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.

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

### Active

- [ ] Web app supports the strongest browser-safe generation path, centered on Bottle 2.0 cloud generation — **Migrated to Validated (v1.0 Phase 1)**
- [ ] Both Bottle 1.0 and Bottle 2.0 are paid capabilities using platform-managed pricing and point deduction — **Migrated to Validated (v1.0 Phase 2)**
- [ ] Heavy media processing and large-file handling stay off the central server whenever practical — **Migrated to Validated (v1.0 Phase 01.1)**
- [ ] Generated lessons from Bottle 1.0 and Bottle 2.0 become consistent learning artifacts — Phase 3 (v1.1)
- [ ] Users can enter spelling/lesson practice from generated content regardless of generation source — Phase 3 (v1.1)
- [ ] Desktop users can import media from supported links through local tooling — Phase 4 (v1.1)

### Out of Scope

- User-provided ASR API key configuration — platform-managed billing and keys keep the experience simple
- Forcing full desktop parity in the browser — browser/runtime constraints are acceptable where local tooling is required
- Making the server the primary media processing worker — this conflicts with cost and capacity limits

## Context

- Existing brownfield codebase already contains FastAPI backend, React/Vite web app, Electron desktop client, billing/redeem flows, admin surfaces, lesson generation, and learning flows.
- Desktop capability already includes local helper patterns, local ASR model management, bundled ffmpeg/yt-dlp resources, and URL import building blocks.
- Web and desktop already share a large part of the frontend and product model, which should be preserved rather than split into separate products.
- Current product direction is not to rebuild from scratch, but to sharpen product boundaries, stabilize generation flows, reduce server load, and improve the learner experience.

## Constraints

- **Server Capacity**: Avoid heavy server-side media conversion and long-running ASR workloads — server performance is limited.
- **User Simplicity**: Learners should not need to understand API keys, model setup, ffmpeg, or yt-dlp.
- **Runtime Split**: Desktop must be the complete experience; web should provide only what browsers can reliably support.
- **Billing**: Bottle 1.0 and Bottle 2.0 are both paid capabilities with prices managed in admin tooling.
- **Brownfield Preservation**: Existing auth, wallet, admin, lesson, and desktop foundations should be optimized, not discarded.

## Current State

**v1.0 已交付 (2026-03-27)。** Web 和 Desktop 现在共享稳定的 Bottle 2.0 云端生成路径；Desktop 用户可以使用 Bottle 1.0 本地生成，零配置；DashScope 403 文件访问失败会自动自愈一次。

**下一步：** v1.1 — Lesson Output Consistency + Desktop Link Import（Phase 3 & 4）

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Desktop client is the primary product surface for full generation capabilities | Desktop can safely host local models, ffmpeg, yt-dlp, and local helper workflows | ✅ Validated in Phase 02 — model bundled via extraResources, helper auto-starts silently, zero-friction UX |
| Web app centers on Bottle 2.0 cloud generation | Browser users still need a useful path, but browser-local heavy tooling is not reliable enough | ✅ Validated in Phase 01 & 02 — desktop guidance replaces server fallback, not browser parity |
| Platform manages ASR keys instead of end users | Learners are non-technical and should pay with points/redeem codes rather than configure secrets | ✅ Validated — platform-managed keys throughout v1.0 |
| Server should stay light and avoid becoming the media processing bottleneck | Cost and infrastructure limits make centralized heavy processing a bad default | ✅ Validated in Phase 01 & 01.1 — signed URL retry self-heal keeps server light |
| Generated media should become lesson/practice artifacts regardless of generation path | Users care about learning outcomes, not the underlying ASR route | — Pending — Phase 3 will validate |
| Direct-upload DashScope file access failures should self-heal before surfacing to users | Signed URLs can expire or be rejected transiently; the product should repair that path without forcing users into manual fallback first | ✅ Validated in Phase 01.1 — one-time retry + dedicated DASHSCOPE_FILE_ACCESS_FORBIDDEN error |
| Treat `dashscope_file_id` as the canonical cloud object key across request-url, task artifacts, and generation entrypoints | The direct-upload path works end-to-end when the same object key is preserved; regression coverage prevents response and task creation paths from drifting apart | ✅ Validated in Phase 01 — regression coverage locked |

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
*Last updated: 2026-03-27 after v1.0 milestone completion*
