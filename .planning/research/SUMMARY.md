# Project Research Summary

**Project:** Bottle English Learning
**Domain:** English learning from user-supplied media
**Researched:** 2026-03-26
**Confidence:** MEDIUM

## Executive Summary

This is a brownfield English learning product that already has a meaningful technical foundation. The recommended path is not a rebuild, but a product-boundary hardening pass: preserve the shared web/desktop product model, make desktop the complete capability surface, and keep the server focused on persistence, billing, orchestration, and final lesson state.

The strongest product strategy is runtime-aware generation. Desktop should own local-tooling work such as Bottle 1.0, ffmpeg, yt-dlp, and link import. Web should deliver the broadest browser-safe capability set, centered on Bottle 2.0 cloud generation. The main risk is accidental drift back toward heavy server-side media processing or browser promises that do not hold up in real usage.

## Key Findings

### Recommended Stack

Keep the current stack and optimize within it. The codebase already has the right high-level shape for the product direction.

**Core technologies:**
- FastAPI / SQLAlchemy / Alembic: backend APIs, billing, lesson persistence, admin controls
- React / Vite / Zustand: shared product UI for web and desktop
- Electron: full-capability desktop wrapper with local runtime bridge
- DashScope cloud ASR + faster-whisper local bundle: dual-path generation model

### Expected Features

**Must have (table stakes):**
- Auth, wallet/points, redeem codes, lesson generation, learning/practice consumption
- Clear generation progress and failure handling
- Bottle 2.0 available to both web and desktop users

**Should have (competitive):**
- Desktop Bottle 1.0 local generation with low friction
- Desktop URL import via local tooling
- Consistent lesson outputs across generation routes

**Defer (v2+):**
- Any browser-local heavy media tooling that fights browser constraints
- User-managed secret configuration

### Architecture Approach

Use the existing shared-product architecture, but clarify boundaries. Desktop owns local tooling and full power features. Web owns accessible browser-safe generation. Backend owns state, billing, admin, and normalized lesson persistence.

### Critical Pitfalls

1. **Server drift into media worker** - keep heavy conversion close to the user device or external cloud service
2. **Browser overreach** - do not promise local-tooling parity in the browser
3. **Inconsistent lesson outputs** - normalize post-generation lesson contracts
4. **Billing mismatch** - keep pricing and capability gating explicit
5. **User setup friction** - automate as much desktop preparation as possible

## Implications for Roadmap

### Phase 1: Shared Cloud Generation Hardening
**Rationale:** Bottle 2.0 is the common path for both web and desktop and should stabilize first.
**Delivers:** reliable shared cloud generation and capability boundaries
**Addresses:** runtime split, web usefulness, point-based usage

### Phase 2: Desktop Bottle 1.0 Experience
**Rationale:** local generation is the main desktop differentiator and major server-load reducer.
**Delivers:** automated local readiness and generation flow
**Uses:** Electron helper, local model bundles, ffmpeg

### Phase 3: Unified Lesson and Practice Output
**Rationale:** users care about study results, not which ASR route produced them.
**Delivers:** consistent learning artifacts across generation modes

### Phase 4: Desktop Link Import
**Rationale:** URL import depends on stable desktop runtime boundaries.
**Delivers:** yt-dlp / local conversion based media ingestion for desktop

### Phase 5: Admin Pricing and Operations
**Rationale:** billing rules and product operations must match the runtime/product strategy.
**Delivers:** configurable pricing, visibility, and runtime controls

### Phase 6: Product Polish and Reliability
**Rationale:** onboarding, fallback, and edge-case handling determine learner usability.
**Delivers:** reduced friction and more trustworthy day-to-day use

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing codebase already supports this direction |
| Features | MEDIUM | Product packaging and boundary clarity still need sharpening |
| Architecture | HIGH | Shared renderer + desktop bridge is already present |
| Pitfalls | MEDIUM | Main uncertainty is operational discipline, not raw architecture |

**Overall confidence:** MEDIUM

### Gaps to Address

- Exact cloud upload/transcoding path for the best low-server-load Bottle 2.0 web flow
- Exact product messaging when web and desktop capability sets diverge
- Final pricing model details per runtime and generation mode

---
*Research completed: 2026-03-26*
*Ready for roadmap: yes*
