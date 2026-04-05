# Domain Pitfalls: CEFR Vocabulary Data Cleaning & Normalization

**Domain:** English language learning — CEFR vocabulary dataset correction and POS enrichment
**Researched:** 2026-04-05
**Confidence:** HIGH (based on existing codebase analysis + language learning domain patterns)

---

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

---

### Pitfall 1: Vocab Version Mismatch Breaks All CEFR Analysis

**What goes wrong:** After running `fix_cefr_levels.py`, the frontend refuses to load the new vocabulary file. All CEFR analysis silently falls back to `SUPER` (unknown/orange). The whole feature appears broken.

**Why it happens:**
- `vocabAnalyzer.js` validates `_vocab_version === CURRENT_VOCAB_VERSION` ("fixed-v1") before loading
- The current `cefr_vocab.json` does NOT have this field — only `cefr_vocab_fixed.json` will
- If `fix_cefr_levels.py` outputs to a file without adding `_vocab_version`, the validator rejects it
- Browser `sessionStorage` caches the old (rejected) payload, causing persistent 404-equivalent behavior

**Consequences:**
- All CEFR levels render as orange ("unknown") even for simple words like "the", "have"
- User sees near-100% SUPER distribution — completely misleading
- Vite comment confirms this: "// 本地 dev：把 /data 代理到后端，否则 cefr_vocab_fixed.json 404 会导致 CEFR 全为 SUPER（橙色）"

**Prevention:**
```javascript
// fix_cefr_levels.py MUST add this on output:
vocab["_vocab_version"] = "fixed-v1"
```

- Bump `_vocab_version` whenever `pos_entries` or level changes occur
- Add `_vocab_version` to the version-tracking output

**Warning signs:**
- Console: `[CEFR] vocab loaded, wordMap size: 0` (empty wordMap after load)
- Console: `词汇表格式无效` validation error
- All words showing orange/highlighted as "SUPER" in UI

**Phase to address:** The data-cleaning phase itself must include version metadata.

---

### Pitfall 2: Browser Cache Persistence Blocks Vocabulary Updates

**What goes wrong:** After saving the corrected vocab file, users still see old/misclassified levels because their browser has cached the old JSON in `sessionStorage`.

**Why it happens:**
- `vocabAnalyzer.js` first checks `sessionStorage.getItem("cefr_vocab_cache")`
- Validation via `isValidCefrVocabPayload` only checks version tag — doesn't bust cache on file change
- Old cached JSON with wrong levels persists until manually cleared or `forceReload=true` is passed

**Consequences:**
- Users report "vocabulary still shows wrong levels" for days/weeks
- "Works on my machine" reports from developers testing locally
- Mobile users (who never clear cache) never see the fix

**Prevention:**
1. **Version bump on any structural change:** When adding `pos_entries` or fixing levels, also update `_vocab_version` so the new file fails old cache validation
2. **Cache-bust parameter (optional):** Add `?v=N` to the vocab URL for force-reload scenarios
3. **Dev-mode auto-clear:** Warn users during development when version mismatch detected

**Warning signs:**
- "I fixed it but it still shows the old levels"
- `sessionStorage` key `cefr_vocab_cache` contains stale data
- User reports the same wrong word classification repeatedly

**Phase to address:** Any phase that changes the vocabulary file must include cache-busting strategy.

---

### Pitfall 3: "SUPER" Level Hardcoded Throughout Frontend

**What goes wrong:** Adding a new CEFR level (e.g., "EXTREME", "NATIVE") would break frontend display. Every component that renders levels has `SUPER` hardcoded.

**Why it happens:**
- `CEFR_LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2", "SUPER"]` is defined in 6+ files
- `_levelToNum()` maps `SUPER` to 6 — new levels would return `undefined`
- `LEVEL_CONFIG` in `AnalysisPanel.jsx` has explicit `SUPER` entry
- `computeWordStats()` in `ReadingPage.jsx` hardcodes `{ A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, SUPER: 0 }`

**Consequences:**
- New levels render without styling (no color, no label)
- Sorting/ordering of levels puts new levels in wrong position
- Coverage calculations break — `SUPER` is treated as hardest tier

**Prevention:**
1. Extract `CEFR_LEVEL_ORDER` to a shared constants file (`cefrLevels.js`)
2. Generate `levelToNum` map dynamically from the order array
3. Never hardcode level strings — always derive from data or constants

**Warning signs:**
- New level appears as `?` or blank in UI
- Level distribution percentages don't sum to 100%
- Console warning about unknown level value

**Phase to address:** Phase that adds new vocabulary metadata must refactor hardcoded level constants.

---

### Pitfall 4: CEFR-J Coverage Gap — Silent Misclassification of 86.8% of Words

**What goes wrong:** 86.8% of words (41,280 out of 50,000) fall back to rank-based classification, which is known to be inaccurate. Users see wrong CEFR levels for the majority of vocabulary with no indication that these are "guesses."

**Why it happens:**
- CEFR-J vocabulary profile covers only 7,020 unique headwords
- `fix_cefr_levels.py` sets `pos_entries: []` and `_source: "rank-based"` for unmatched words
- No UI indicator distinguishes "CEFR-J verified" from "rank-based estimated"
- Rank-based thresholds (A1: rank 1-600, A2: 601-1200, etc.) are statistical proxies, not semantic classifications

**Consequences:**
- Users trust wrong CEFR levels on the majority of words
- "abandon" might show as A1 (rank 4,587) when it's actually B1 per CEFR-J
- Learning material selection based on wrong levels leads to poor i+1 targeting

**Prevention:**
1. **Surface confidence in UI:** Add a `confidence` indicator (`"verified"` vs `"estimated"`) to word info
2. **Track coverage statistics:** Log what % of words in a given content piece are CEFR-J-verified
3. **Prioritize high-frequency gap filling:** Identify which rank-based words appear most in learning content and manually verify their levels

**Warning signs:**
- Content analysis shows 80%+ words are "SUPER" (indicates lookup failure, not just unknown words)
- User complaints about "wrong level for easy word" — likely rank-based misclassification
- Wide variance in level distribution for content that should be consistent

**Phase to address:** Phase that builds vocabulary analytics should expose verification source to users.

---

### Pitfall 5: Multi-Word Expressions and Hyphenated Words Not Handled

**What goes wrong:** Phrases like "a lot of", "in order to", "well-known", "self-esteem" either don't appear in the vocab or are normalized inconsistently.

**Why it happens:**
- `cefr_vocab.json` contains only single-word entries (COCA-based list)
- Multi-word expressions are compound nouns/idioms not in single-word frequency lists
- Hyphenated words: "well-known" vs "well known" vs "wellknown" are treated as different tokens
- No lemmatization or phrase-tokenization for multi-word units

**Consequences:**
- "a lot of" — each word looked up separately, no phrase-level meaning
- "well-known" — may not match "wellknown" or "well known" in vocab
- "self-esteem" — treated as one token (likely SUPER) instead of two common words

**Prevention:**
1. **Normalize hyphens:** Standardize "well-known" → "well known" (space) or expand to "well_known"
2. **Add phrase entries:** Supplement vocab with common multi-word expressions mapped to appropriate CEFR level
3. **Compound word splitting:** Add heuristic rules for "self-*", "*-like", "-ed" compounds

**Warning signs:**
- Content with hyphenated words shows unexpected "SUPER" distribution
- Phrase-level idioms not appearing in vocabulary sidebar
- "well known" vs "well-known" producing different CEFR results for same phrase

**Phase to address:** Future phase that handles vocabulary enrichment should address multi-word expressions.

---

### Pitfall 6: Contraction Expansion Semantics — "it's" ≠ "it"

**What goes wrong:** `_stripContraction()` maps "it's" → "it", but CEFR level for "it" may not match "it is" (the contraction implies a different context). Contractions like "I'm" → "I" lose the auxiliary verb semantics.

**Why it happens:**
- "it's" maps to "it" (pronoun level), but "it's" in CEFR-J might be at a different level than the pronoun "it"
- "don't" → "do" loses negation semantics — "do" (verb) is different from "do not"
- "I'm" → "I" loses the "am" auxiliary entirely

**Consequences:**
- "It's" (contraction) gets same level as "it" (pronoun) — might be wrong
- Contractions in content analyzed as base words, losing context
- Special CEFR handling for contractions in learning content not captured

**Prevention:**
1. **Add contractions as separate entries:** Include "it's", "don't", "I'm" directly in vocabulary (or as aliases to their expanded forms)
2. **Check CEFR-J for contractions:** Verify if CEFR-J has specific entries for contracted forms
3. **Separate lookup chain:** Contraction → contraction-in-vocab → expansion (current approach) vs Contraction → expansion

**Warning signs:**
- Contraction-heavy content (casual text, dialogue) shows unexpected level distribution
- "don't" analyzed as "do" — verb level may differ from "do not" phrase level
- Contractions not appearing in vocabulary sidebar

**Phase to address:** Phase that improves vocabulary lookup should handle contractions explicitly.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using rank-based levels as fallback | No reference data needed | 86.8% of words misclassified silently | Never — always surface as "estimated" |
| Hardcoding CEFR_LEVEL_ORDER array | Simple, no imports | Adding levels requires editing 6+ files | Only in MVP |
| Session storage for vocab cache | Fast repeated loads | Stale data after updates | Only with version validation |
| Simple suffix lemmatization | Handles common cases | Irregular forms wrong | Acceptable with fallback to contraction stripping |
| Case-insensitive lookup only | Simpler tokenization | Loses "Apple" (proper noun) vs "apple" distinction | Acceptable (proper nouns are rare) |

---

## Integration Gotchas

Common mistakes when connecting data pipeline to frontend.

| Integration Point | Common Mistake | Correct Approach |
|-------------------|----------------|------------------|
| `fix_cefr_levels.py` → `cefr_vocab_fixed.json` | Forgetting to add `_vocab_version` | Always add `_vocab_version: "fixed-v1"` on output |
| JSON file → `vocabAnalyzer.load()` | Mismatched file path in code vs filesystem | Use `resolveCefrVocabFetchUrls()` for multi-path fallback |
| Browser cache → New vocab file | Old cached JSON blocks new file | Bump version OR use `load(forceReload=true)` |
| `cefr_vocab.json` → `cefr_vocab_fixed.json` | Forgetting to update frontend path | Frontend defaults to `cefr_vocab_fixed.json` — just save there |
| Word info → UI display | Adding `pos_entries` without updating UI | `pos_entries` is optional — won't break existing display |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full vocab JSON in sessionStorage | 50k-word JSON (~8MB) may exceed sessionStorage limits | Wrap in try/catch — code already does this | Mobile browsers with 5MB limit |
| Object.entries() on 50k words | `new Map(Object.entries(data.words))` is O(n) on every load | Only do once on `load()`, cache the Map | Repeated hot reloads in dev |
| Regex per token in `extractWordsAboveLevel` | `/[a-zA-Z]+(?:'[a-zA-Z]+)?/g` compiled on every call | Move regex to class-level constant | High-frequency sentence analysis |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Version metadata:** `_vocab_version` field added to output JSON — verify in file before assuming it works
- [ ] **Browser cache cleared:** After saving new vocab, test with `forceReload=true` to verify the fix works
- [ ] **All 50,000 words present:** Add word count assertion in `fix_cefr_levels.py` — warn if count differs
- [ ] **POS entries don't break frontend:** Verify existing components still render levels correctly with new `pos_entries` field
- [ ] **Level change statistics reported:** `fix_cefr_levels.py` reports how many words changed level — check this before shipping
- [ ] **Fallback words marked:** Words using rank-based fallback should have `_source: "rank-based"` for QA visibility
- [ ] **SUPER level handled:** After any change, verify unknown words still render correctly as SUPER

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Vocab version mismatch | MEDIUM | 1. Open DevTools → Application → Session Storage → clear `cefr_vocab_cache`<br>2. Force reload page with cache-bust<br>3. Verify `_vocab_version` in new file matches expected value |
| Browser cache blocks update | LOW | Call `analyzer.load(forceReload=true)` programmatically OR clear sessionStorage |
| SUPER hardcoding breaks | HIGH | Refactor CEFR_LEVEL_ORDER to shared constant — requires multi-file edit |
| Rank-based misclassification | MEDIUM | Identify affected words, manually verify CEFR levels, update reference data |
| Contraction semantics lost | MEDIUM | Add contractions as separate vocabulary entries OR improve lookup chain |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Vocab version mismatch | Data cleaning phase (current) | Check `_vocab_version` field exists in output JSON |
| Browser cache blocks update | Data cleaning phase | Test load with `forceReload=true` after save |
| SUPER hardcoding | Any future UI phase | Verify all CEFR_LEVEL_ORDER references use shared constant |
| CEFR-J coverage gap (86.8%) | Future vocab enrichment phase | Log `_source` distribution — should have "estimated" indicator |
| Multi-word/hyphenated words | Future vocab enrichment phase | Test hyphenated and phrase content renders correctly |
| Contraction semantics | Future vocab enrichment phase | Verify contractions in content produce expected levels |

---

## Sources

- Existing codebase analysis: `vocabAnalyzer.js`, `CefrBadge.jsx`, `AnalysisPanel.jsx`, `ReadingPage.jsx`
- `fix_cefr_levels.py` — planned correction script
- CEFR-J Vocabulary Profile (cefrj-vocabulary-profile-1.5.csv) — 7,020 unique headwords
- COCA frequency data (`cefr_vocab.json`) — 50,000 words with rank-based levels
- Vite config comment confirming SUPER fallback behavior
- Language learning domain patterns: CEFR classification methodology, vocabulary profile standards

---

*Pitfalls research for: CEFR vocabulary data cleaning and normalization*
*Researched: 2026-04-05*
