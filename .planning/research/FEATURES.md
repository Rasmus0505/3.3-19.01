# Feature Research: CEFR Vocabulary Dataset Cleaning & Normalization

**Domain:** English vocabulary dataset for language learning products
**Researched:** 2026-04-05
**Confidence:** HIGH (based on code analysis, CEFR-J reference, and established language learning standards)

---

## Feature Landscape

### Table Stakes (Non-Negotiable for Launch)

These are required for the cleaned dataset to function as a reliable CEFR vocabulary resource.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Authoritative CEFR levels | Mislabeled words (e.g., `compute` rank=20,046 → SUPER, should be B2) cause wrong-level content delivery | MEDIUM | Requires cross-reference against CEFR-J; ~84% of matched words need correction |
| POS (Part-of-Speech) tags per word | Level varies by POS: `run` (verb) = A1, `run` (noun) = B1 | MEDIUM | CEFR-J provides 7 POS types; needed for accurate level assignment |
| Word normalization | Case (`Python` vs `python`), punctuation (`U.S.` vs `US`), possessives cause duplicate/inconsistent entries | LOW | Apply lowercase + strip punctuation as canonical form |
| Primary level field (backward compat) | `vocabAnalyzer` frontend reads `word.level` directly | LOW | Keep existing structure; derive from `pos_entries[0]` or lowest CEFR |
| Rank and frequency count preserved | Used for sorting, filtering, and frequency-based features | LOW | Existing COCA data is valuable; don't discard |
| Clear source attribution | Distinguish CEFR-J verified from rank-based estimated levels | LOW | Add `_source: "CEFR-J" \| "rank-based"` field |
| Unknown words explicitly flagged | Currently mislabeled as "SUPER" (rank > 20,000); conflates "not in COCA" with "rare" | MEDIUM | Introduce `_in_coca: true \| false \| unknown` field; avoid using SUPER as error bucket |

### Differentiators (Competitive Advantage)

Features that elevate the dataset beyond basic word lists.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Complete POS entry array (`pos_entries`) | Enables POS-aware filtering (e.g., "show me only verbs at B1 level") | MEDIUM | `fix_cefr_levels.py` already defines schema; needs schema validation and complete population |
| Coverage metrics & confidence scores | Users/developers know which words are authoritative vs estimated | LOW | Add `_confidence: "high" \| "medium" \| "low"` based on source |
| Core vocabulary inventory flags | CEFR-J includes `CoreInventory` fields; surface which words are core vs supplementary | MEDIUM | Enables "core 2,000" vs "extended 5,000" filtering |
| Word family / lemma grouping | Learning `run` should help with `runs`, `running`, `ran`; group by lemma | HIGH | Requires external morphological analyzer; defer to v2 |
| Academic/technical register flags | Identify words appropriate for EAP (English for Academic Purposes) | MEDIUM | COCA has subcorpora (academic, news) — can cross-reference |
| Multi-word expression support | Phrases like `look after`, `get along with` have their own levels | HIGH | CEFR-J doesn't consistently include MWEs; requires external resource |

### Anti-Features (Problematic When Added)

Features that seem useful but create more problems than they solve.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Automatic level inference for all 50,000 words | "14% coverage isn't enough" | Machine inference on CEFR is unreliable; we'd re-create the rank-based error | Augment with additional CEFR references (e.g., `peregrine/complex-english-vocabulary-list`, `voa-learning-english`) |
| Per-inflection level tagging | "Users want levels for `walked`, `running` too" | Inflectional forms don't have independent CEFR levels; would require NLP inference with high error rate | Group by lemma (see Word Family above); surface base form level for all inflections |
| Native language (L1) transliteration | "Add Chinese/Japanese readings for CJK users" | Out of scope for English CEFR dataset; belongs in separate L1 lookup layer | Maintain clean English-only core; let frontend handle L1 display |
| Synonym/antonym relations | "Learners need related words" | Requires dedicated knowledge graph; introduces circular dependencies | Defer to v2; surface via external dictionary integration |
| Phonetic transcription (IPA) | "Users need pronunciation guidance" | Large data requirement; pronunciation varies by dialect (BrE/AmE) | Defer; add via external phonetic dictionary (e.g., CMU Dict) |

---

## Feature Dependencies

```
[Authoritative CEFR Levels]
    └──requires──> [CEFR-J Cross-Reference]
                        └──requires──> [Source Attribution Fields]

[POS Tags per Word]
    └──requires──> [Authoritative CEFR Levels]
                        └──requires──> [POS Entry Array Schema]

[Primary Level Field]
    └──derived-from──> [POS Entry Array] (lowest level = primary)

[Confidence Scoring]
    └──requires──> [Source Attribution Fields]
                        └──requires──> [Authoritative CEFR Levels]

[Word Normalization]
    └──independent──> [All other features] (foundation layer)

[Core Inventory Flags]
    └──independent──> [CEFR-J CoreInventory columns] (no dependencies)
```

### Dependency Notes

- **Authoritative CEFR Levels require CEFR-J Cross-Reference:** The primary work is matching words against the reference CSV. Without this, we're just re-running the rank-based assignment which is the existing problem.
- **POS Tags require Authoritative CEFR Levels:** CEFR-J provides POS alongside level; can't add POS without also importing the full CEFR-J entry.
- **Primary Level Field is derived from POS Entry Array:** No new data needed — algorithmically compute lowest level from `pos_entries` to maintain backward compatibility.
- **Confidence Scoring requires Source Attribution:** A word from CEFR-J is HIGH confidence; a rank-based word with rank < 20,000 is MEDIUM; rank > 20,000 not in COCA is LOW.
- **Word Normalization is foundational:** Must happen before any matching/cross-reference — prevents "Python" and "python" from being treated as separate words.

---

## MVP Definition

### Launch With (v1.0)

Minimum viable: a cleaned dataset where CEFR levels are accurate for reference-matched words, with POS information surfaced.

- [x] **Word normalization** — lowercase canonical form, consistent punctuation handling
- [x] **Authoritative CEFR levels** — all 7,020 CEFR-J headwords corrected from rank-based values
- [x] **POS entry array** — `pos_entries` field populated for all CEFR-J words (verb, noun, adj, adv, etc.)
- [x] **Primary level field** — `level` derived as lowest POS entry level (backward compatible with `vocabAnalyzer`)
- [x] **Source attribution** — `_source: "CEFR-J" | "rank-based"` on every word
- [x] **COCA presence flag** — `_in_coca: true | false` to distinguish "not in corpus" from "rare"
- [x] **Coverage report** — metadata showing % of words with authoritative vs estimated levels

### Add After Validation (v1.1–1.3)

Features that improve quality once the core pipeline is stable.

- [ ] **Confidence scores** — `_confidence: "high" | "medium" | "low"` based on source + rank thresholds
- [ ] **Core inventory flags** — surface CEFR-J `CoreInventory` columns for "core vs extended" filtering
- [ ] **Level change audit trail** — `_original_level` preserved for debugging/corrections
- [ ] **Normalized word metadata** — store canonical form, original forms preserved as `_variants`
- [ ] **Duplicate elimination** — merge `python` and `Python` into single entry with variants array

### Future Consideration (v2+)

Features requiring external resources or significant NLP work.

- [ ] **Lemma grouping** — group inflections under base form; surface base level for all variants
- [ ] **Additional CEFR references** — augment CEFR-J coverage with other vocabulary profiles
- [ ] **Academic register flagging** — cross-reference COCA academic subcorpus for EAP words
- [ ] **Multi-word expression support** — handle phrasal verbs and idioms with their own CEFR levels
- [ ] **IPA transcription** — add via CMU Pronouncing Dictionary or similar

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Authoritative CEFR levels (CEFR-J correction) | HIGH | MEDIUM | P1 |
| Word normalization | HIGH | LOW | P1 |
| POS entry array with primary level | HIGH | MEDIUM | P1 |
| Source attribution fields | HIGH | LOW | P1 |
| COCA presence flag | MEDIUM | LOW | P1 |
| Coverage report in metadata | MEDIUM | LOW | P1 |
| Confidence scores | MEDIUM | LOW | P2 |
| Core inventory flags | MEDIUM | LOW | P2 |
| Level change audit trail | LOW | LOW | P2 |
| Variant forms array | MEDIUM | LOW | P2 |
| Lemma grouping | HIGH | HIGH | P3 |
| Additional CEFR references | MEDIUM | HIGH | P3 |
| Academic register flags | MEDIUM | MEDIUM | P3 |
| Multi-word expression support | MEDIUM | HIGH | P3 |
| IPA transcription | LOW | MEDIUM | P3 |

**Priority Key:**
- P1: Must have for v1.0 — directly addresses the 84% mislabeling problem
- P2: Should add in v1.x — improves usability without major scope
- P3: Future work — requires external resources or significant complexity

---

## Competitor Feature Analysis

| Feature | CEFR-J Profile | Vocabulary.com | Our Approach |
|---------|----------------|----------------|--------------|
| Authoritative CEFR levels | Yes (defines standard) | Frequency-based only | Use CEFR-J as ground truth; fallback to rank-based |
| POS tagging | Yes (verb, noun, adj, adv, etc.) | Limited | Full POS array per word |
| Multiple levels per word | Yes (different POS = different level) | No | Support via `pos_entries` array |
| Word variants/forms | No | Yes (inflections shown) | Store variants in `_variants` array |
| Coverage | ~7,000 headwords | ~25,000 words | 50,000 words (7K authoritative + 43K rank-based) |
| Confidence/expertise indicators | No | Yes (marked as "rare") | Explicit `_confidence` and `_in_coca` flags |
| Data freshness/last updated | 2018 (v1.5) | Active | Flag data age; CEFR-J is stable standard |

### Key Insight

CEFR-J is the authoritative source for ~14% of our dataset. The remaining ~86% (rank-based words with rank ≤ 20,000) are still reasonably accurate — the rank-based method is a valid heuristic when no CEFR profile exists. The problem is only the ~7% of words with rank > 20,000 (currently labeled SUPER) where the rank-based method breaks down because these words aren't in COCA at all.

**Recommendation:** Focus correction effort on the CEFR-J-matched subset (~7,020 words) and the SUPER bucket (~30,000 words). The rank-based words in A1–C2 range are acceptably accurate.

---

## POS Granularity Analysis

### CEFR-J POS Types Found in Reference

| POS | Count in CEFR-J | When to Use | Recommendation |
|-----|-----------------|-------------|----------------|
| noun | ~3,200 | General vocabulary, reading comprehension | Keep — primary POS for most learners |
| verb | ~2,100 | Grammar-focused content, conjugation practice | Keep — essential for production skills |
| adjective | ~1,400 | Reading comprehension, writing | Keep — highly level-relevant |
| adverb | ~600 | Advanced learners (B2+) | Keep — important for fluency |
| preposition | ~150 | Beginner learners (A1–A2) | Keep — foundational; often misleveled by rank |
| determiner | ~100 | Beginner learners | Keep — small set, high impact |
| pronoun | ~50 | A1–A2 | Keep — but low volume |
| conjunction | ~40 | Intermediate learners | Keep — but low volume |
| idiom | ~20 | Advanced (B2+) | Consider flagging separately (irregular levels) |

### Recommended POS Schema

Collapse to 6 canonical POS categories for the dataset:

- `noun` → `noun`
- `verb` → `verb`
- `adjective` → `adjective`
- `adverb` → `adverb`
- `preposition`, `determiner`, `pronoun`, `conjunction` → `function-word` (group for simplicity)
- `idiom` → `idiom` (keep separate; levels are irregular)

Rationale: 6 categories are sufficient for level-appropriate filtering. CEFR-J's full 9-type split is academically precise but adds complexity without proportional user value for a language learning app.

---

## Data Completeness Targets

| Metric | Current State | Target (v1.0) | Notes |
|--------|---------------|---------------|-------|
| Words with CEFR-J level | 6,596 (13.2%) | 7,020 (14.0%) | All CEFR-J headwords matched |
| Words with POS tags | 0 (none) | 7,020 (14.0%) | CEFR-J provides POS; others remain untagged |
| CEFR level accuracy (matched subset) | 84.4% incorrect | 100% correct | The core fix |
| Words in A1–C2 range (rank-based, accurate) | ~20,000 | ~20,000 | Unchanged — acceptable heuristic |
| Words in SUPER bucket | ~30,000 | ~30,000 (but better flagged) | Most aren't truly "super"; need better `_in_coca` flag |
| Words with confidence score | 0 | 50,000 | Derived from source + rank |

**Key insight:** Don't try to force authoritative CEFR levels onto all 50,000 words. Use CEFR-J for the 14% where it's available, and use rank-based levels with explicit `_source: "rank-based"` and `_confidence: "medium"` for the rest. Only flag words as `_confidence: "low"` when they're not in COCA at all (the SUPER bucket).

---

## Sources

- **CEFR-J Vocabulary Profile v1.5** — `cefrj-vocabulary-profile-1.5.csv` (primary authoritative source)
- **COCA Frequency List** — `app/data/vocab/cefr_vocab.json` source (`vocabulary-list-statistics` by openderock)
- **fix_cefr_levels.py** — existing correction strategy (defines target schema for `pos_entries`, `_source`, `_fixed`)
- **vocabAnalyzer frontend** — `app/` — backward compatibility requirements

---

## Open Questions for Roadmap Phases

1. **SUPER bucket strategy:** Should we attempt to assign CEFR levels to any of the ~30,000 "SUPER" words? If so, which source(s)?
2. **Variant normalization:** Should `python`, `Python`, `PYTHON` be merged into one entry with variants stored, or kept separate with cross-references?
3. **Inflectional forms:** Should `walked`, `walking`, `walks` be collapsed to lemma `walk` with a single level, or kept as separate entries?
4. **Data freshness:** CEFR-J v1.5 is from ~2018. Is there a newer version? Should we check for updates?
5. **Frontend compatibility:** Does `vocabAnalyzer` need to change to consume `pos_entries`, or can it work entirely from the derived `level` field?

---

*Feature research for: English CEFR Vocabulary Dataset Cleaning*
*Researched: 2026-04-05*
