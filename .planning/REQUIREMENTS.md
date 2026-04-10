# Requirements: Bottle English Learning — v2.8 阅读生成流水线

**Defined:** 2026-04-10
**Core Value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.

## v1 Requirements

### Material Intake & Diagnosis

- [x] **DIAG-01**: User can submit a reading material from the reading workspace and receive a pre-generation diagnostic card before any AI simplification starts.
- [x] **DIAG-02**: User can see the estimated material difficulty, the user's current CEFR level, and the recommended target i+1 level for that material.
- [x] **DIAG-03**: User can see counts of preserved i+1 words, above-i+1 expressions that need simplification, and the expected simplification impact for the material.
- [x] **DIAG-04**: User can review estimated cost/time and explicitly confirm generation from the diagnostic card instead of triggering a blind one-click rewrite.

### Generation Pipeline Experience

- [ ] **PIPE-01**: User can watch a staged generation flow that explicitly shows material parsing, difficulty judgment, simplification planning, text rewriting, and reading-pack assembly.
- [ ] **PIPE-02**: User can see stage-specific progress and failure states that explain what failed and whether the material can still be opened in original mode.
- [ ] **PIPE-03**: If generation is interrupted by refresh or navigation, user can recover the latest in-progress state or completed output without restarting from scratch.

### Reading Pack Output

- [ ] **PACK-01**: User receives a persistent reading pack asset containing original text, i+1 rewritten text, target-level metadata, rewrite mappings, and diagnostic summary for one material.
- [ ] **PACK-02**: User can switch between original view, i+1 view, and sentence-by-sentence comparison view inside the reading pack.
- [ ] **PACK-03**: User can inspect which words were preserved as i+1 learning opportunities and which expressions were simplified, through a structured explanation panel rather than only inline highlights.
- [ ] **PACK-04**: User can reopen a previously generated reading pack from history and see its difficulty badge and generation status without regenerating.

### Learning Handoff

- [ ] **HAND-01**: User can add preserved i+1 words and simplified expressions to wordbook directly from the reading pack.
- [ ] **HAND-02**: User can see a clear next action after generation, such as continue reading, compare with original, or collect target words for review.

## v2 Requirements

### Source Expansion

- **SRC-01**: User can import webpage, PDF, subtitle, or transcript sources directly into the reading generation pipeline without manual copy/paste.

### Pack Variants

- **VAR-01**: User can generate and keep multiple target-level variants of the same material without overwriting earlier reading packs.

### Post-Reading Practice

- **POST-01**: User can generate reading-comprehension questions or review tasks from a finished reading pack.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-agent classroom or slide-generation experiences inside reading | This milestone is about i+1 reading-pack generation, not converting Bottle into an OpenMAIC-style classroom product |
| Full server-side heavy document parsing pipeline | Conflicts with the local-first and light-server product boundary; demo scope can start from pasted text and existing reading materials |
| Automatic quiz, summary, and audio generation as milestone-defining deliverables | Useful follow-ons, but they distract from the core "material -> i+1 pack" demo story |
| Replacing lesson generation or immersive learning as the main product surface | v2.8 upgrades the reading workflow and should layer onto the existing Bottle product rather than displacing it |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DIAG-01 | Phase 35 | Complete |
| DIAG-02 | Phase 35 | Complete |
| DIAG-03 | Phase 35 | Complete |
| DIAG-04 | Phase 35 | Complete |
| PIPE-01 | Phase 36 | Pending |
| PIPE-02 | Phase 36 | Pending |
| PIPE-03 | Phase 36 | Pending |
| PACK-01 | Phase 36 | Pending |
| PACK-02 | Phase 36 | Pending |
| PACK-03 | Phase 37 | Pending |
| PACK-04 | Phase 37 | Pending |
| HAND-01 | Phase 37 | Pending |
| HAND-02 | Phase 37 | Pending |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 after v2.8 milestone draft*
