# Requirements: Bottle English Learning

**Defined:** 2026-03-26
**v1.0 Shipped:** 2026-03-27
**v1.1 Shipped:** 2026-03-27
**v2.0 Shipped:** 2026-03-28
**Core Value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.

## v1 Requirements

### Authentication

- [x] **AUTH-01**: User can register with email and password — ✅ v1.0 Phase 1
- [x] **AUTH-02**: User can log in and keep a usable session across refreshes — ✅ v1.0 Phase 1
- [x] **AUTH-03**: User can access generation and learning features only after authentication where required by billing state — ✅ v1.0 Phase 1

### Billing

- [x] **BILL-01**: User can redeem codes into platform points or balance — ✅ v1.0 Phase 1
- [x] **BILL-02**: User is charged according to admin-configured pricing for Bottle 1.0 and Bottle 2.0 usage — ✅ Phase 5 (v2.0)
- [x] **BILL-03**: User never needs to provide a personal ASR API key to use paid generation — ✅ v1.0 (platform-managed keys)

### Web Generation

- [x] **WEB-01**: Web users can upload local media and generate lessons through Bottle 2.0 when the browser/runtime path supports it — ✅ v1.0 Phase 1 & 1.1
- [x] **WEB-02**: Web users receive clear feedback when a desired feature is desktop-only or temporarily unavailable — ✅ v1.0 Phase 1
- [x] **WEB-03**: Web generation avoids turning the central server into the default heavy media-processing bottleneck — ✅ v1.0 Phase 1 & 1.1

### Desktop Generation

- [x] **DESK-01**: Desktop users can generate lessons with Bottle 1.0 on their local machine — ✅ v1.0 Phase 2
- [x] **DESK-02**: Desktop users can generate lessons with Bottle 2.0 cloud ASR from the same product surface — ✅ v1.0 Phase 1 & 1.1
- [x] **DESK-03**: Desktop users can prepare Bottle 1.0 without manual model/tool setup knowledge — ✅ v1.0 Phase 2
- [x] **DESK-04**: Desktop users can import media from supported links through local tooling — ✅ Phase 4 (v1.1)

### Lesson Output

- [x] **LESS-01**: Generated content from Bottle 1.0 and Bottle 2.0 becomes a normalized lesson record — ✅ Phase 3 (v1.1)
- [x] **LESS-02**: User can open generated lessons and review generated sentence content — ✅ Phase 3 (v1.1)
- [x] **LESS-03**: Generation progress, partial failures, and success states are visible in product UI — ✅ Phase 3 (v1.1)

### Learning Experience

- [x] **LEARN-01**: User can enter spelling/lesson practice from generated lesson content — ✅ Phase 3 (v1.1)
- [x] **LEARN-02**: Learning experience remains usable regardless of whether the lesson came from desktop-local or cloud generation — ✅ Phase 3 (v1.1)
- [x] **LEARN-03**: Users do not need technical knowledge of ASR routes to continue learning after generation — ✅ Phase 6 (v2.0)

### Admin Operations

- [x] **ADMIN-01**: Admin can configure or adjust pricing for Bottle 1.0 and Bottle 2.0 — ✅ Phase 5 (v2.0)
- [x] **ADMIN-02**: Admin can inspect runtime health and generation-support status for operational troubleshooting — ✅ Phase 5 (v2.0)
- [x] **ADMIN-03**: Admin can continue managing redeem-code and wallet-related operations — ✅ Phase 5 (v2.0)

## v2 Requirements

### Expansion

- **V2-01**: Browser side capabilities expand only when they are reliable at learner scale
- **V2-02**: More advanced pricing segmentation by runtime, model, or speed/quality tier
- **V2-03**: Broader media-source support beyond the initial desktop link-import path

## Out of Scope

| Feature | Reason |
|---------|--------|
| User-managed ASR key configuration | Conflicts with low-friction learner experience |
| Full browser parity for local tooling features | Browser runtime is not the right place for ffmpeg/yt-dlp heavy flows |
| Server-first default media conversion pipeline | Conflicts with infrastructure and cost constraints |

## Traceability

| Requirement | Phase | Status |
|------------|-------|--------|
| AUTH-01 | Phase 1 | ✅ Complete |
| AUTH-02 | Phase 1 | ✅ Complete |
| AUTH-03 | Phase 1 | ✅ Complete |
| BILL-01 | Phase 1 | ✅ Complete |
| BILL-02 | Phase 5 | ✅ Complete |
| BILL-03 | — | ✅ Complete (platform-managed) |
| WEB-01 | Phase 1 | ✅ Complete |
| WEB-02 | Phase 1 | ✅ Complete |
| WEB-03 | Phase 1 | ✅ Complete |
| DESK-01 | Phase 2 | ✅ Complete |
| DESK-02 | Phase 1 | ✅ Complete |
| DESK-03 | Phase 2 | ✅ Complete |
| DESK-04 | Phase 4 | ✅ Complete |
| LESS-01 | Phase 3 | ✅ Complete |
| LESS-02 | Phase 3 | ✅ Complete |
| LESS-03 | Phase 3 | ✅ Complete |
| LEARN-01 | Phase 3 | ✅ Complete |
| LEARN-02 | Phase 3 | ✅ Complete |
| LEARN-03 | Phase 6 | ✅ Complete |
| ADMIN-01 | Phase 5 | ✅ Complete |
| ADMIN-02 | Phase 5 | ✅ Complete |
| ADMIN-03 | Phase 5 | ✅ Complete |

**Coverage:**
- v1 requirements: 22 total
- Satisfied by v1.0: 10 (AUTH-01/02/03, BILL-01, BILL-03, WEB-01/02/03, DESK-01/02/03)
- Satisfied by v1.1: 5 (LESS-01/02/03, LEARN-01/02)
- Satisfied by v2.0: 7 (BILL-02, DESK-04, LEARN-03, ADMIN-01/02/03)
- All v1 requirements now satisfied

---
*Requirements defined: 2026-03-26*
*v1.0 shipped: 2026-03-27*
*v1.1 shipped: 2026-03-27*
*v2.0 shipped: 2026-03-28*
*Last updated: 2026-03-28 after v2.0 milestone completion*
