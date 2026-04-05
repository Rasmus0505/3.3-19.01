# Phase 34 Summary — Prompt Optimization

**Phase:** 34
**Completed:** 2026-04-06
**Status:** Complete

---

## What Was Built

### Backend (Wave 1)

**`POST /api/llm/simplify-words`** — New schema endpoint (Phase 34)
- Accepts `sentence` + `words[]` (list of high-difficulty words in order)
- Returns `simplified_words[]` (simplified replacements in same order)
- System prompt + 2-shot examples included
- Billing, token tracking, llm_usage logging all wired
- `SimplifyWordsRequest` Pydantic model with `field_validator` for max 2000-char sentence

**`GET /api/llm/estimate-tokens`** — Rough token estimation for fee preview
- Uses char/4 heuristic for rough estimate
- Reads billing rate from DB via `SessionLocal` (no external context dependency)

**Tests:** 9/9 passing in `tests/api/test_llm_rewrite.py`

### Frontend (Wave 2)

**`frontend/src/features/reading/api/readingRewriteApi.js`** — New API module
- `simplifyWords()` — calls `/simplify-words`
- `estimateRewriteTokens()` — calls `/estimate-tokens`

**`frontend/src/hooks/useReadingRewrite.js`** — Updated hook
- Added `extractHighDiffWordsFromMappings()` helper
- Added `applySimplifiedWords()` — word-boundary regex replacement in order
- `handleRewrite` now: token estimation → extract words → `/simplify-words` → local replace
- Falls back gracefully if no high-difficulty words found

**`frontend/src/features/reading/RewriteEstimateBanner.jsx`** — New component
- Displays estimated charge before rewrite

**`reading.css`** — `.rewrite-estimate-banner` styles

---

## Key Design Decisions

1. **Per-order array schema** (方案 B) — Frontend matches `words[i]` → `simplified_words[i]` by position, no mapping objects needed
2. **Local replacement** — Simplified words are applied client-side to original text, never send full article to model
3. **Token estimation before rewrite** — Shows approximate cost as toast before committing the API call
4. **Backward compatible** — Existing `POST /api/llm/rewrite-text` preserved, no breaking changes

---

## Files Created

- `tests/api/test_llm_rewrite.py`
- `frontend/src/features/reading/api/readingRewriteApi.js`
- `frontend/src/features/reading/RewriteEstimateBanner.jsx`

## Files Modified

- `app/api/routers/llm.py` — `SIMPLIFY_WORDS_SYSTEM_PROMPT`, `SIMPLIFY_WORDS_EXAMPLE`, `SimplifyWordsRequest`, `estimate_tokens_endpoint`, `simplify_words_endpoint`
- `frontend/src/hooks/useReadingRewrite.js` — new flow with `simplifyWords` + local replacement
- `frontend/src/features/reading/reading.css` — `.rewrite-estimate-banner`

## Verification

- Backend: `pytest tests/api/test_llm_rewrite.py` — 9/9 passed
- Frontend: ESLint — no errors, JS syntax valid
- Git: 2 commits (Wave 1 backend, Wave 2 frontend)

## Outstanding

- RewriteEstimateBanner component created but not yet wired into ReadingPage (needs a follow-up task to integrate into the actual UI layout — the toast-based preview in `handleRewrite` covers the functional requirement)
- Token saving verification (PO-04) requires human testing with real API calls
