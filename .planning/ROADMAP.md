# Roadmap: Unlock English Learning

**Milestone:** v3.0 Unlock Anything
**Granularity:** Standard (7 phases)

## Milestones

- ✅ **v2.7 阅读板块重写增强** — Phases 32-34 (shipped 2026-04-06)
  - 13/14 requirements complete; PO-04 pending human verification
  - [Archived](.planning/milestones/v2.7-ROADMAP.md)
- ✅ **v2.8 阅读生成流水线** — Phases 35-36 (shipped 2026-04-10, partial)
  - Phases 35-36 complete; Phase 37 requirements merged into v3.0 as PACK-01~04
  - [Archived](.planning/milestones/v2.8-ROADMAP.md)
- 🚧 **v3.0 Unlock Anything** — Phases 38-44 (in progress)

---

## Phases

### 🚧 v3.0 Unlock Anything

- [ ] **Phase 38: Brand Rename** — Replace all "Bottle" user-visible surfaces with "Unlock" branding
- [ ] **Phase 39: Multi-Modal Input Pipeline** — Add webpage, PDF, subtitle, and OCR input sources into the reading pipeline
- [ ] **Phase 40: Reading Pack Completion** — Finish vocab panel, wordbook collection, history reopen, and next-step actions in the reading pack
- [ ] **Phase 41: Quiz Generation** — LLM-powered comprehension quizzes generated from reading pack content
- [ ] **Phase 42: Vocabulary Cards & AI Images** — i+1 vocabulary cards with contextual definitions, example sentences, and AI scene images
- [ ] **Phase 43: Dictation Course Generation** — Bridge reading pack sentences into the existing immersive dictation flow
- [ ] **Phase 44: Learning Dashboard** — CEFR progress, vocabulary growth curve, learning heatmap, and unlock statistics

---

## Phase Details

### Phase 38: Brand Rename
**Goal**: Users perceive the product as "Unlock" across every touchpoint — no "Bottle" references remain in user-visible surfaces.
**Depends on**: Nothing (first phase of v3.0)
**Requirements**: BRAND-01, BRAND-02
**Success Criteria** (what must be TRUE):
  1. User sees "Unlock" in the browser tab title, navigation bar, page headers, and footer — zero "Bottle" references remain in any user-visible surface.
  2. Favicon, Open Graph metadata, and any share/bookmark previews reflect the Unlock brand identity.
**Plans**: TBD
**UI hint**: yes

---

### Phase 39: Multi-Modal Input Pipeline
**Goal**: Users can bring any English material — webpage, PDF, subtitles, or photo — into the learning pipeline, not just pasted text.
**Depends on**: Phase 38
**Requirements**: INPUT-01, INPUT-02, INPUT-03, INPUT-04
**Success Criteria** (what must be TRUE):
  1. User can paste a webpage URL and see extracted article text enter the reading pipeline without manual copy-paste.
  2. User can upload a PDF file and see its English text extracted into the reading pipeline.
  3. User can upload a .srt or .vtt subtitle file and see its text extracted into the reading pipeline.
  4. User can upload an image of English text and see OCR-extracted content enter the reading pipeline.
  5. Each input source preserves enough metadata (source URL, filename, or format label) to identify the material in history.
**Plans**: TBD
**UI hint**: yes

---

### Phase 40: Reading Pack Completion
**Goal**: Reading packs become complete learning assets with vocabulary tools, history access, and clear next steps — finishing the carryover from v2.8 Phase 37.
**Depends on**: Phase 39
**Requirements**: PACK-01, PACK-02, PACK-03, PACK-04
**Success Criteria** (what must be TRUE):
  1. User can open a structured vocabulary explanation panel inside the reading pack that separates preserved i+1 words from simplified expressions.
  2. User can add preserved i+1 words and simplified expressions to wordbook directly from the reading pack panel.
  3. User can reopen previously generated reading packs from history, showing difficulty badges and generation status.
  4. User sees explicit next-step actions after pack generation — continue reading, compare with original, collect words, or generate quiz/dictation.
**Plans**: TBD
**UI hint**: yes

---

### Phase 41: Quiz Generation
**Goal**: Users can test comprehension of reading materials through AI-generated quizzes with multiple question types.
**Depends on**: Phase 40
**Requirements**: QUIZ-01, QUIZ-02
**Success Criteria** (what must be TRUE):
  1. User can trigger quiz generation from a reading pack and receive AI-generated comprehension questions based on the article content.
  2. Quiz presents at least three question types: single-choice, fill-in-the-blank, and sentence ordering.
  3. User can answer questions interactively and see immediate correctness feedback.
**Plans**: TBD
**UI hint**: yes

---

### Phase 42: Vocabulary Cards & AI Images
**Goal**: Users can study i+1 vocabulary from reading packs with rich context, example sentences, and AI-generated scene imagery.
**Depends on**: Phase 40
**Requirements**: VOCAB-01, VOCAB-02, VOCAB-03
**Success Criteria** (what must be TRUE):
  1. User can view vocabulary cards extracted from the reading pack, each showing the word, its CEFR level, and a contextual definition.
  2. Each vocabulary card includes at least one example sentence drawn from the reading pack content.
  3. Vocabulary cards display an AI-generated scene image that illustrates the word meaning.
  4. User can browse through vocabulary cards and add words to wordbook from the card view.
**Plans**: TBD
**UI hint**: yes

---

### Phase 43: Dictation Course Generation
**Goal**: Users can practice dictation using sentences from their reading packs, entering the existing immersive learning flow.
**Depends on**: Phase 40
**Requirements**: DICT-01
**Success Criteria** (what must be TRUE):
  1. User can trigger dictation course generation from a reading pack and see it produce a lesson from pack sentences.
  2. Generated dictation course enters the existing immersive dictation practice flow without degrading the reducer-driven state machine architecture.
  3. Existing immersive learning contracts (loop, rate, display, navigation) are preserved — no regression in spelling/listening practice.
**Plans**: TBD
**UI hint**: yes

---

### Phase 44: Learning Dashboard
**Goal**: Users can visualize their learning journey — CEFR progress, vocabulary growth, study habits, and unlock achievements — on a dedicated dashboard.
**Depends on**: Phase 40
**Requirements**: DASH-01, DASH-02, DASH-03
**Success Criteria** (what must be TRUE):
  1. User can view a CEFR level progress indicator and vocabulary growth curve showing words learned over time.
  2. User can view a daily learning heatmap (GitHub-style calendar) showing study activity across days.
  3. User can see core statistics: unlocked materials count, mastered new words, and completed quizzes.
  4. Dashboard data reflects actual usage from reading packs, wordbook entries, and quiz completions.
**Plans**: TBD
**UI hint**: yes

---

## Progress

**Execution Order:**
Phases execute in numeric order: 38 → 39 → 40 → 41/42/43 (parallel-eligible after 40) → 44

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|---------------|--------|-----------|
| 38. Brand Rename | v3.0 | 0/? | Not started | - |
| 39. Multi-Modal Input Pipeline | v3.0 | 0/? | Not started | - |
| 40. Reading Pack Completion | v3.0 | 0/? | Not started | - |
| 41. Quiz Generation | v3.0 | 0/? | Not started | - |
| 42. Vocabulary Cards & AI Images | v3.0 | 0/? | Not started | - |
| 43. Dictation Course Generation | v3.0 | 0/? | Not started | - |
| 44. Learning Dashboard | v3.0 | 0/? | Not started | - |

---

## Coverage

**v3.0 Requirements: 19 total**
**Mapped to phases: 19 / 19**
**Unmapped: 0**

| Requirement | Phase |
|-------------|-------|
| BRAND-01 | Phase 38 |
| BRAND-02 | Phase 38 |
| INPUT-01 | Phase 39 |
| INPUT-02 | Phase 39 |
| INPUT-03 | Phase 39 |
| INPUT-04 | Phase 39 |
| PACK-01 | Phase 40 |
| PACK-02 | Phase 40 |
| PACK-03 | Phase 40 |
| PACK-04 | Phase 40 |
| QUIZ-01 | Phase 41 |
| QUIZ-02 | Phase 41 |
| VOCAB-01 | Phase 42 |
| VOCAB-02 | Phase 42 |
| VOCAB-03 | Phase 42 |
| DICT-01 | Phase 43 |
| DASH-01 | Phase 44 |
| DASH-02 | Phase 44 |
| DASH-03 | Phase 44 |

---

## Milestone Context

**Previous milestone:** v2.8 阅读生成流水线 — shipped 2026-04-10 (Phases 35-36 complete; Phase 37 merged into v3.0)

**Milestone story:** v3.0 transforms the product from "Bottle reading tool" into "Unlock Anything" — a complete learning platform where any English material (webpage, PDF, subtitles, photo) becomes a personalized learning pack containing i+1 reading, comprehension quizzes, vocabulary cards with AI imagery, and dictation courses. The brand rename, multi-modal inputs, and learning dashboard create a competition-ready demo that tells a complete "input anything, learn everything" narrative.

**Dependency structure:**
- Phase 38 (brand) is standalone and low-risk — touches many files but simple text replacements.
- Phase 39 (inputs) comes early to expand material sources for everything downstream.
- Phase 40 (pack completion) finishes v2.8 carryover and becomes the hub that quiz, vocab, dictation, and dashboard build upon.
- Phases 41, 42, 43 all depend on Phase 40 but are independent of each other — could execute in parallel or any order.
- Phase 44 (dashboard) depends on Phase 40 for data sources but is otherwise independent.

**Next milestone:** TBD after v3.0 validation (AI conversation practice is the leading candidate)

---
*Roadmap drafted: 2026-04-10*
*Last updated: 2026-04-10*
