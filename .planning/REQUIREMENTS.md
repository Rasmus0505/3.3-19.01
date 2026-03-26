# Requirements: Bottle English Learning

**Defined:** 2026-03-26
**Core Value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.

## v1 Requirements

### Authentication

- [ ] **AUTH-01**: User can register with email and password
- [ ] **AUTH-02**: User can log in and keep a usable session across refreshes
- [ ] **AUTH-03**: User can access generation and learning features only after authentication where required by billing state

### Billing

- [ ] **BILL-01**: User can redeem codes into platform points or balance
- [ ] **BILL-02**: User is charged according to admin-configured pricing for Bottle 1.0 and Bottle 2.0 usage
- [ ] **BILL-03**: User never needs to provide a personal ASR API key to use paid generation

### Web Generation

- [x] **WEB-01**: Web users can upload local media and generate lessons through Bottle 2.0 when the browser/runtime path supports it
- [x] **WEB-02**: Web users receive clear feedback when a desired feature is desktop-only or temporarily unavailable
- [x] **WEB-03**: Web generation avoids turning the central server into the default heavy media-processing bottleneck

### Desktop Generation

- [ ] **DESK-01**: Desktop users can generate lessons with Bottle 1.0 on their local machine
- [x] **DESK-02**: Desktop users can generate lessons with Bottle 2.0 cloud ASR from the same product surface
- [ ] **DESK-03**: Desktop users can prepare Bottle 1.0 without manual model/tool setup knowledge
- [ ] **DESK-04**: Desktop users can import media from supported links through local tooling

### Lesson Output

- [ ] **LESS-01**: Generated content from Bottle 1.0 and Bottle 2.0 becomes a normalized lesson record
- [ ] **LESS-02**: User can open generated lessons and review generated sentence content
- [ ] **LESS-03**: Generation progress, partial failures, and success states are visible in product UI

### Learning Experience

- [ ] **LEARN-01**: User can enter spelling/lesson practice from generated lesson content
- [ ] **LEARN-02**: Learning experience remains usable regardless of whether the lesson came from desktop-local or cloud generation
- [ ] **LEARN-03**: Users do not need technical knowledge of ASR routes to continue learning after generation

### Admin Operations

- [ ] **ADMIN-01**: Admin can configure or adjust pricing for Bottle 1.0 and Bottle 2.0
- [ ] **ADMIN-02**: Admin can inspect runtime health and generation-support status for operational troubleshooting
- [ ] **ADMIN-03**: Admin can continue managing redeem-code and wallet-related operations

## v2 Requirements

### Expansion

- **V2-01**: Browser-side capabilities expand only when they are reliable at learner scale
- **V2-02**: More advanced pricing segmentation by runtime, model, or speed/quality tier
- **V2-03**: Broader media-source support beyond the initial desktop link-import path

## Out of Scope

| Feature | Reason |
|---------|--------|
| User-managed ASR key configuration | Conflicts with low-friction learner experience |
| Full browser parity for local tooling features | Browser runtime is not the right place for ffmpeg / yt-dlp heavy flows |
| Server-first default media conversion pipeline | Conflicts with infrastructure and cost constraints |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| BILL-01 | Phase 1 | Pending |
| BILL-02 | Phase 5 | Pending |
| BILL-03 | Phase 5 | Pending |
| WEB-01 | Phase 1 | Complete |
| WEB-02 | Phase 1 | Complete |
| WEB-03 | Phase 1 | Complete |
| DESK-01 | Phase 2 | Pending |
| DESK-02 | Phase 1 | Complete |
| DESK-03 | Phase 2 | Pending |
| DESK-04 | Phase 4 | Pending |
| LESS-01 | Phase 3 | Pending |
| LESS-02 | Phase 3 | Pending |
| LESS-03 | Phase 3 | Pending |
| LEARN-01 | Phase 3 | Pending |
| LEARN-02 | Phase 3 | Pending |
| LEARN-03 | Phase 6 | Pending |
| ADMIN-01 | Phase 5 | Pending |
| ADMIN-02 | Phase 5 | Pending |
| ADMIN-03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 after initial definition*
