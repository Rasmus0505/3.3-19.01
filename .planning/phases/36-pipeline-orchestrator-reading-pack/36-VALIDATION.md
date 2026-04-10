---
phase: 36
slug: pipeline-orchestrator-reading-pack
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 + Testing Library for frontend; pytest 8.3.5 only if backend API contracts change |
| **Config file** | `frontend/vitest.config.ts`; `pytest.ini` |
| **Quick run command** | `npm run test -- --run src/features/reading/readingDiagnostics.test.js` |
| **Full suite command** | `npm run test -- --run` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run src/features/reading/readingDiagnostics.test.js` plus the new focused test file for the touched area
- **After every plan wave:** Run `npm run test -- --run`
- **Before `/gsd-verify-work`:** Frontend reading tests must be green; run `pytest tests/api/test_llm_rewrite.py -q` only if the phase changes backend API contracts
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | PIPE-01 | T-36-01 | Pipeline UI shows only the named stages and sanitized user-facing copy | component + reducer | `npm run test -- --run src/features/reading/readingPipelineMachine.test.js src/features/reading/ReadingPage.pipeline.test.jsx` | ❌ W0 | ⬜ pending |
| 36-02-01 | 02 | 1 | PIPE-03, PACK-01 | T-36-02 | Persisted pack and pipeline snapshots stay article-scoped and reopen safely without raw HTML rendering | persistence + helper | `npm run test -- --run src/features/reading/readingPack.test.js src/features/reading/readingRewriteDB.pack.test.js src/features/reading/useReadingRewrite.resume.test.js` | ❌ W0 | ⬜ pending |
| 36-03-01 | 03 | 2 | PACK-02, PIPE-02 | T-36-03 | Pack modes preserve existing highlight/mapping behavior and failure copy keeps original-mode fallback legible | component | `npm run test -- --run src/features/reading/ReadingPackPanel.test.jsx src/features/reading/ReadingPage.pipeline.test.jsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/features/reading/readingPipelineMachine.test.js` — reducer transition coverage for all five stages and failure/resume cases
- [ ] `frontend/src/features/reading/readingPack.test.js` — pack assembly and comparison-card construction
- [ ] `frontend/src/features/reading/readingRewriteDB.pack.test.js` — pack/pipeline persistence shape and reopen semantics
- [ ] `frontend/src/features/reading/ReadingPage.pipeline.test.jsx` — staged UX, failure copy, and continue CTA
- [ ] `frontend/src/features/reading/ReadingPackPanel.test.jsx` — `original` / `i+1` / `comparison` mode switching without regression

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Stage view delivers a clear “比赛展示” narrative while keeping the last completed stage and next output obvious | PIPE-01, PIPE-02 | Visual storytelling and copy hierarchy are better judged by a human than snapshot tests alone | Start generation from the diagnostic card, watch all five named stages, and confirm the current stage, last-completed stage, and next artifact are understandable without reading code |
| Refresh/reopen lands on the correct recovery surface for both interrupted and completed runs | PIPE-03 | Browser refresh/navigation behavior is best confirmed in a real session | Start generation, refresh after an intermediate stage, confirm the stage view restores the last persisted checkpoint with a continue action; finish a run, reopen from history, and confirm it opens the finished pack directly |
| Sentence-by-sentence comparison mode remains useful while word-level hover still works in `original` / `i+1` modes | PACK-02 | This mixes interaction feel and content comprehension | Open a finished pack, switch across all three modes, verify comparison uses sentence cards, and verify rewritten-word hover still exposes original wording in the relevant reading mode |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
