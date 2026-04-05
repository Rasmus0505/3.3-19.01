# Project Research Summary

**Project:** v2.6 清洗 CEFR 词典数据源
**Domain:** Python data-processing tool for CEFR vocabulary cleaning and normalization
**Researched:** 2026-04-05
**Confidence:** HIGH (based on codebase analysis, CEFR-J reference, and established language learning standards)

## Executive Summary

This milestone is a focused data-cleaning operation to replace inaccurate COCA rank-based CEFR levels with authoritative CEFR-J Vocabulary Profile levels, and to add Part-of-Speech (POS) tagging for the 14% of vocabulary covered by the reference dataset. The task has been extensively analyzed: the correction script (`fix_cefr_levels.py`) already exists with defined schema, the CEFR-J reference data (7,799 entries) is validated, and the frontend `vocabAnalyzer.js` is designed to accept the new `pos_entries` field without breaking existing functionality.

**Recommended approach:** Execute the existing `fix_cefr_levels.py` script with proper version metadata, validate output coverage and level-change statistics, and deploy the corrected `cefr_vocab_fixed.json`. Key decisions include: keeping the flat 50K-key structure for O(1) lookup, deriving the primary `level` field from lowest POS entry for backward compatibility, and using `_vocab_version: "fixed-v1"` for cache-busting. **Do not** attempt to force-authoritative CEFR levels on the remaining 86% — use rank-based fallback with explicit `_source: "rank-based"` and `_confidence` indicators.

**Key risks:** Browser cache persistence (sessionStorage blocks updates), version field missing from output (causes silent fallback to SUPER), and frontend hardcoding of CEFR_LEVEL_ORDER array (blocks future level additions). All three are preventable with proper implementation checks.

## Key Findings

### Recommended Stack

**Use Python standard library only — zero external dependencies needed.** The 50K-word JSON file (~4.6 MB) is trivially handled by `json.load()` (~300-500ms). Third-party libraries like `pandas` or `orjson` add dependency overhead with no meaningful benefit for this one-time (or infrequent) data-cleaning task.

**Core technologies:**
- `json`: Read/write 50K-word JSON — standard library sufficient, no orjson/ujson needed
- `csv.DictReader`: Load CEFR-J reference CSV — 7,799 rows handled instantly
- `unicodedata`: Unicode normalization for variant handling (café vs cafe)
- `collections.defaultdict`: Efficient grouping by (word, POS) for reference matching

**No fuzzy matching needed:** CEFR-J provides exact-match headwords. String similarity libraries (rapidfuzz, textdistance) are unnecessary for this task.

### Expected Features

**Must have (table stakes) — core fix:**
- Authoritative CEFR levels for CEFR-J matched words (~7,020) — fixes 84.4% incorrect level rate
- POS entry array (`pos_entries`) with verb, noun, adjective, adverb per word
- Primary `level` field derived from lowest POS entry — backward compatible with `vocabAnalyzer`
- Source attribution (`_source: "CEFR-J" | "rank-based"`) — distinguishes verified vs estimated
- COCA presence flag (`_in_coca: true | false`) — separates "not in corpus" from "rare"
- Version metadata (`_vocab_version: "fixed-v1"`) — enables frontend validation and cache-busting
- Coverage report in output — shows % authoritative vs rank-based for QA

**Should have (quality improvements):**
- Confidence scores (`_confidence: "high" | "medium" | "low"`) based on source + rank thresholds
- Core inventory flags from CEFR-J `CoreInventory` columns
- Level change audit trail (`_original_level` preserved)

**Defer to v2+ (requires external resources):**
- Lemma grouping for inflectional forms (walk/walks/walking)
- Additional CEFR references to augment 14% coverage
- Multi-word expression support (phrasal verbs, idioms)
- IPA transcription via CMU Pronouncing Dictionary

### Architecture Approach

**Single-file flat structure with embedded POS entries.** The 50,000-word vocabulary stays as top-level keys in one JSON file (~4.6 MB, gzip ~1.2 MB). Each word object contains: `rank`, `level` (primary, backward-compatible), `count`, and `pos_entries` array. This structure is optimal because: `vocabAnalyzer.load()` already uses `new Map(Object.entries(data.words))` for O(1) lookups, `analyzeVideo()` requires global word statistics that need unified access, and the file fits in sessionStorage with proper error handling.

**Backward compatibility via derived `level` field.** The primary `level` is algorithmically derived as the lowest complexity POS entry level. Existing frontend code reading `word.level` continues to work unchanged. The new `pos_entries` field is optional — `vocabAnalyzer.getWordInfo()` returns it but existing components can ignore it.

**Version control via `_vocab_version` field.** File name stays `cefr_vocab_fixed.json` permanently. Version tracked via `_vocab_version: "fixed-v1"` in the JSON header. VocabAnalyzer validates this before accepting the file.

### Critical Pitfalls

1. **Vocab Version Mismatch Breaks All CEFR Analysis** — If `fix_cefr_levels.py` omits `_vocab_version`, `vocabAnalyzer` validation rejects the file, silently falling back to SUPER (orange) for all words. Prevention: always add `_vocab_version: "fixed-v1"` on output.

2. **Browser Cache Blocks Vocabulary Updates** — `sessionStorage` caches old vocabulary. Users see stale levels for days. Prevention: bump `_vocab_version` on any structural change; test with `load(forceReload=true)`.

3. **"SUPER" Level Hardcoded Throughout Frontend** — `CEFR_LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2", "SUPER"]` is defined in 6+ files. Future level additions break silently. Prevention: extract to shared constant file (defer to future UI phase).

4. **CEFR-J Coverage Gap — Silent Misclassification** — 86.8% of words use rank-based fallback with no UI indication they're "estimated." Prevention: surface `_confidence` and `_source` fields in analytics; log coverage % for content analysis.

5. **Multi-Word Expressions Not Handled** — Hyphenated words (well-known) and phrases (a lot of) cause lookup failures or inconsistent normalization. Prevention: standardize hyphen handling in normalization; document limitation.

6. **Contraction Expansion Loses Semantics** — "it's" → "it" maps contraction to pronoun, losing "is" semantics. Prevention: add contractions as separate vocabulary entries (defer to future phase).

## Implications for Roadmap

This is a single focused phase, not a multi-phase roadmap. The data-cleaning task is well-defined and executable in one pass. However, the research reveals clear follow-up work that should be planned.

### Phase 1: Execute CEFR-J Data Correction
**Rationale:** Core problem is 84.4% incorrect levels on CEFR-J-matched words. This is the only work needed to fix the authoritative subset.

**Delivers:**
- Corrected `cefr_vocab_fixed.json` with `_vocab_version: "fixed-v1"`
- 7,020 words with accurate CEFR levels and POS entries
- Coverage report: ~14% CEFR-J verified, ~86% rank-based fallback

**Addresses from FEATURES.md:**
- Authoritative CEFR levels (P1)
- POS entry array (P1)
- Primary level field backward compat (P1)
- Source attribution (P1)
- COCA presence flag (P1)
- Coverage report (P1)

**Avoids from PITFALLS.md:**
- Version mismatch (must add `_vocab_version`)
- Browser cache blocks (must bump version on structural change)

**Execution steps:**
1. Run `fix_cefr_levels.py --dry-run` to preview statistics
2. Review level-change count (should fix ~7,020 words)
3. Run `fix_cefr_levels.py --save` to write output
4. Validate output: check `_vocab_version`, word count (50,000), pos_entries populated
5. Commit and trigger frontend build

**Research flags:** None needed — implementation is well-defined, patterns are established in existing code.

### Phase 2: Frontend VocabAnalyzer Enhancement (Future)
**Rationale:** Expose POS information and confidence scores to users. Currently `pos_entries` is stored but not surfaced.

**Delivers:**
- Word info display showing all POS entries for multi-pos words
- Confidence indicator ("verified" vs "estimated") in analysis panels
- Coverage statistics in content analysis results

**Dependencies:** Requires Phase 1 output

### Phase 3: Shared CEFR Constants Refactor (Future)
**Rationale:** `CEFR_LEVEL_ORDER` hardcoded in 6+ files blocks future level additions. Extract to shared module.

**Delivers:**
- `cefrLevels.js` constant file
- All components reference shared constants
- Future level additions require single-file edit

**Note:** This is a refactor phase, not data-cleaning. Plan separately when UI work is needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Standard library proven sufficient; 50K JSON is trivial scale |
| Features | HIGH | Based on CEFR-J reference data and existing correction script schema |
| Architecture | HIGH | Flat structure validated by existing VocabAnalyzer implementation |
| Pitfalls | HIGH | Based on existing codebase analysis and Vite config comments |

**Overall confidence:** HIGH

**Gaps to Address:**
- **SUPER bucket strategy:** ~30,000 words currently labeled SUPER (rank > 20,000). Research recommends better `_in_coca` flagging over attempting inference. Decision needed on whether to add more CEFR references or accept current coverage.
- **Variant normalization:** `python` vs `Python` — research recommends storing variants in `_variants` array but defers implementation. Should confirm with frontend team whether case-variant dedup is needed.
- **Inflectional forms:** `walk` vs `walked` — lemma grouping deferred to v2. No decision needed now.

## Sources

### Primary (HIGH confidence)
- `cefrj-vocabulary-profile-1.5.csv` — 7,799 entries, authoritative CEFR-J Vocabulary Profile v1.5
- `app/data/vocab/cefr_vocab.json` — 50,000 words with COCA rank-based levels
- `fix_cefr_levels.py` — existing correction script defining target schema
- `app/frontend/src/utils/vocabAnalyzer.js` — frontend vocabulary loading and lookup logic

### Secondary (MEDIUM confidence)
- COCA frequency methodology — rank-based thresholds are statistical proxies, not semantic classifications
- CEFR classification methodology — level assignment varies by POS, confirmed by CEFR-J structure

### Tertiary (LOW confidence)
- CEFR-J data freshness — v1.5 from ~2018; newer version existence unverified

---

*Research completed: 2026-04-05*
*Ready for roadmap: yes (single-phase execution confirmed)*
