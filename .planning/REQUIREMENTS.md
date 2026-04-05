# Requirements: Bottle English Learning — v2.7 阅读板块重写增强

**Defined:** 2026-04-06
**Core Value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.

## v1 Requirements

### Rewrite Persistence (持久化)

- [ ] **RP-01**: User can unlock AI rewrite and the result is saved to IndexedDB (original text + rewritten text + mappings + articleId)
- [ ] **RP-02**: When reopening a previously-read article, the saved rewrite is automatically loaded and displayed without re-calling the API
- [ ] **RP-03**: User can toggle between "original text" and "rewritten text" views at any time; toggle state persists per article
- [ ] **RP-04**: Rewrite history list shows which articles have been rewritten (visual indicator) and allows clearing saved rewrites

### Rewrite UI Enhancement (重写UI)

- [ ] **UI-01**: Rewritten words/phrases display with a yellow background highlight block (oklch-based, distinct from CEFR underlines)
- [ ] **UI-02**: Hovering over a yellow highlighted word shows a tooltip with the original word/phrase
- [ ] **UI-03**: The original CEFR underlines (i+1 green, above-i+1 red) are no longer applied to words that have been rewritten — the yellow block takes visual priority
- [ ] **UI-04**: The yellow highlight is visually consistent between desktop and web surfaces
- [ ] **UI-05**: In "original text" view, CEFR underlines continue to display as before (no regression)

### Prompt Optimization (提示词优化)

- [ ] **PO-01**: The rewrite prompt is redesigned with sentence-level analysis + structured JSON output (simplified word list + sentence context + original-to-simplified mappings), reducing descriptive text in the output
- [ ] **PO-02**: The prompt instructs the model to preserve original sentence structure as much as possible (only replace vocabulary, minimize sentence restructuring) to reduce token churn
- [ ] **PO-03**: Rewrite API call cost (estimated tokens) is displayed to the user before confirming rewrite
- [ ] **PO-04**: The new prompt is tested with at least 3 sample texts of varying difficulty and lengths to verify quality and token savings

## v2 Requirements

### Advanced Rewrite Features

- **RW-01**: User can select a rewrite difficulty level (e.g., "slightly easier" vs. "much easier") similar to Rewordify's 6-level system, using CEFR as the scale
- **RW-02**: Vocabulary column panel showing all simplified words with original↔rewritten pairs alongside the text
- **RW-03**: Side-by-side original/rewritten two-column display mode

## Out of Scope

|| Feature | Reason |
|---------|--------|
| Server-side rewrite storage | Conflicts with local-first constraint; IndexedDB is sufficient |
| Batch rewrite multiple articles | Per-article rewrite is the current model; batch is future scope |
| Rewrite with user-provided API key | Platform manages keys to keep experience simple |
| Full Rewordify emulation (50k-word dictionary) | CEFR vocabulary table + AI covers the same need more precisely |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

|| Requirement | Phase | Status |
|-------------|-------|--------|
| RP-01 | — | Pending |
| RP-02 | — | Pending |
| RP-03 | — | Pending |
| RP-04 | — | Pending |
| UI-01 | — | Pending |
| UI-02 | — | Pending |
| UI-03 | — | Pending |
| UI-04 | — | Pending |
| UI-05 | — | Pending |
| PO-01 | — | Pending |
| PO-02 | — | Pending |
| PO-03 | — | Pending |
| PO-04 | — | Pending |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 0
- Unmapped: 13 ⚠️

---
*Requirements defined: 2026-04-06*
*Last updated: 2026-04-06 after initial definition*
