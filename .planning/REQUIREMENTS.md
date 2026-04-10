# Requirements: Unlock — v3.0 Unlock Anything

**Defined:** 2026-04-10
**Core Value:** Users can unlock any English material into personalized i+1 learning packs — reading, vocabulary, comprehension, and dictation — powered by AI across the full pipeline.

## v1 Requirements

### Brand Upgrade

- [ ] **BRAND-01**: User sees "Unlock" branding across all visible surfaces — app title, navigation, headers, footer, and meta tags — instead of "Bottle".
- [ ] **BRAND-02**: App logo placeholder, favicon, and Open Graph metadata reflect the Unlock brand identity.

### Multi-Modal Material Input

- [ ] **INPUT-01**: User can paste a webpage URL and the system extracts article text into the reading pipeline without manual copy-paste.
- [ ] **INPUT-02**: User can upload a PDF file and the system extracts English text into the reading pipeline.
- [ ] **INPUT-03**: User can upload subtitle files (.srt or .vtt) and the system extracts the text into the reading pipeline.
- [ ] **INPUT-04**: User can upload an image (photo of a textbook page, screenshot) and the system extracts English text via OCR into the reading pipeline.

### Reading Pack Completion

- [ ] **PACK-01**: User can inspect a structured vocabulary explanation panel inside the reading pack that separates preserved i+1 words from simplified expressions.
- [ ] **PACK-02**: User can add preserved i+1 words and simplified expressions to wordbook directly from the reading pack.
- [ ] **PACK-03**: User can reopen previously generated reading packs from history, showing difficulty badges and generation status.
- [ ] **PACK-04**: User sees explicit next-step actions after reading pack generation — continue reading, compare with original, collect words, or generate quiz/dictation.

### Learning Pack — Comprehension Quiz

- [ ] **QUIZ-01**: User can generate a comprehension quiz from a reading pack, with questions based on the article content via LLM.
- [ ] **QUIZ-02**: Quiz supports multiple question types: single-choice, fill-in-the-blank, and sentence ordering.

### Learning Pack — Vocabulary Cards

- [ ] **VOCAB-01**: User can view i+1 vocabulary cards extracted from the reading pack, each showing the word, its CEFR level, and contextual definition.
- [ ] **VOCAB-02**: Vocabulary cards include example sentences drawn from the reading pack content.
- [ ] **VOCAB-03**: Vocabulary cards include AI-generated scene images that illustrate the word meaning.

### Learning Pack — Dictation Course

- [ ] **DICT-01**: User can generate a dictation course from reading pack sentences, entering the existing immersive dictation practice flow.

### Learning Dashboard

- [ ] **DASH-01**: User can view a CEFR level progress indicator and vocabulary growth curve showing words learned over time.
- [ ] **DASH-02**: User can view a daily learning heatmap (GitHub-style calendar) showing study activity.
- [ ] **DASH-03**: User can see core statistics: "unlocked X materials, mastered Y new words, completed Z quizzes".

## v2 Requirements

### Source Expansion

- **SRC-01**: User can import content from additional sources (ebook formats, clipboard paste, audio transcription) into the reading pipeline.

### Advanced Quiz

- **ADVQ-01**: User can take adaptive quizzes that adjust difficulty based on previous answers.

### AI Conversation Practice

- **CONV-01**: User can practice spoken conversation with an AI partner based on reading pack content, using ASR + SOE + TTS.

### Spaced Review Integration

- **REV-01**: User can see a unified review queue that combines wordbook due items with quiz retry suggestions.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-agent classroom or slide-generation (OpenMAIC-style) | v3.0 focuses on "material -> learning pack", not classroom simulation |
| AI conversation / oral practice | Deferred to post-v3.0 — requires full ASR+SOE+TTS+LLM chain, separate milestone |
| Full server-side document parsing | Conflicts with light-server constraint; client-side + lightweight API preferred |
| Subscription / membership model | Per-use billing model preserved |
| Desktop-only features in this milestone | v3.0 focuses on web experience; desktop parity is follow-up |
| Forgetting curve visualization | Deferred — useful but not core to "Unlock Anything" narrative |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BRAND-01 | TBD | Pending |
| BRAND-02 | TBD | Pending |
| INPUT-01 | TBD | Pending |
| INPUT-02 | TBD | Pending |
| INPUT-03 | TBD | Pending |
| INPUT-04 | TBD | Pending |
| PACK-01 | TBD | Pending |
| PACK-02 | TBD | Pending |
| PACK-03 | TBD | Pending |
| PACK-04 | TBD | Pending |
| QUIZ-01 | TBD | Pending |
| QUIZ-02 | TBD | Pending |
| VOCAB-01 | TBD | Pending |
| VOCAB-02 | TBD | Pending |
| VOCAB-03 | TBD | Pending |
| DICT-01 | TBD | Pending |
| DASH-01 | TBD | Pending |
| DASH-02 | TBD | Pending |
| DASH-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 0 (awaiting roadmap)
- Unmapped: 19

---
*Requirements defined: 2026-04-10*
