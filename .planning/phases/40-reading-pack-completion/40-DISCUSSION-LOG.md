# Phase 40: Reading Pack Completion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 40-reading-pack-completion
**Areas discussed:** Vocabulary Explanation Panel, Wordbook Collection, History Reopen & Badges, Next-Step Actions

---

## Vocabulary Explanation Panel

### Q1: Panel architecture

| Option | Description | Selected |
|--------|-------------|----------|
| A) Evolve AnalysisPanel | Add structured sections to existing right sidebar | |
| B) New VocabExplainPanel | Independent component, AnalysisPanel keeps original role | ✓ |

**User's choice:** B — New VocabExplainPanel
**Notes:** User prefers separation of concerns.

### Q2: Definition content source

| Option | Description | Selected |
|--------|-------------|----------|
| A) LLM pipeline-time | Definitions generated during rewrite pipeline, displayed here | ✓ |
| B) LLM on-demand | Real-time LLM API call when user clicks a word | |
| C) Static definitions | CEFR vocab table definitions + context sentence extraction | |

**User's choice:** A — LLM pipeline-time generation
**Notes:** No extra API cost at display time.

### Q3: i+1 and simplified display layout

| Option | Description | Selected |
|--------|-------------|----------|
| A) Two-section list | Upper "worth learning" + lower "simplified expressions" | ✓ |
| B) Mixed timeline | Ordered by article position, icons distinguish type | |
| C) Claude decides | | |

**User's choice:** A — Two-section list
**Notes:** None.

### Q4: Panel placement

| Option | Description | Selected |
|--------|-------------|----------|
| A) Fixed right sidebar | Side-by-side with pack, independently scrollable | ✓ |
| B) Fourth tab in pack | Additional tab alongside original/rewritten/comparison | |
| C) Claude decides | | |

**User's choice:** A — Fixed right sidebar
**Notes:** None.

---

## Wordbook Collection

### Q1: Collection entry points

| Option | Description | Selected |
|--------|-------------|----------|
| A) VocabExplainPanel per-word + batch | "+" button per word + "Add All" header button | ✓ |
| B) AnalysisPanel only | Keep in existing flow, no VocabExplainPanel collection | |
| C) Both panels | VocabExplainPanel single-word + AnalysisPanel batch | |

**User's choice:** A — VocabExplainPanel per-word + batch
**Notes:** None.

### Q2: Collected entry data

| Option | Description | Selected |
|--------|-------------|----------|
| A) Word + source tag only | Minimal metadata | |
| B) Word + LLM definition + example sentence | Rich entry from pipeline | ✓ |
| C) Word + CEFR level + example sentence | No LLM definition | |

**User's choice:** B — Word + LLM definition + example sentence
**Notes:** None.

### Q3: Success feedback

| Option | Description | Selected |
|--------|-------------|----------|
| A) Scale + border flash | Phase 25 animation pattern (scale 200ms + green border 350ms) | ✓ |
| B) Toast + disable | Toast notification + button disabled | |
| C) Claude decides | | |

**User's choice:** A — Scale + border flash animation
**Notes:** Consistency with Phase 25.

---

## History Reopen & Badges (Claude's Discretion)

User delegated: "剩下的 discuss 你自己决策把"

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Difficulty badge format | Overall CEFR level + color dot | Compact, matches existing badge density in HistoryPanel |
| History reopen scope | Full pack state from IndexedDB | VocabExplainPanel needs validI1Words/removedWords/wordLevels |
| Badge coexistence | CEFR badge alongside existing status badges | No visual replacement — additive |

---

## Next-Step Actions (Claude's Discretion)

User delegated: "剩下的 discuss 你自己决策把"

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Action bar layout | Horizontal button bar below content | Natural scan order, doesn't compete with sidebar |
| Quiz/Dictation buttons | Visible but disabled + "Coming Soon" tooltip | Sets user expectation, Phase 41/43 enables them |
| Visibility gate | flowStatus === "generated" only | No confusing actions during incomplete pipeline |

---

## Claude's Discretion

- History badge styling details
- VocabExplainPanel scroll and section collapse behavior
- "Continue Reading" / "Compare Original" exact button actions
- "Collect Vocabulary" button focus behavior

## Deferred Ideas

None — discussion stayed within phase scope.
