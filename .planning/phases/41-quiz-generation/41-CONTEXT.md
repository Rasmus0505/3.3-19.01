# Phase 41: Quiz Generation - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can generate AI-powered comprehension quizzes from reading pack content, with at least three question types (single-choice, fill-in-the-blank, sentence ordering), answer interactively, and receive immediate correctness feedback. This phase adds quiz generation and quiz UI to the existing reading pack — it does NOT change the reading pipeline, input adapters, or pack storage.

</domain>

<decisions>
## Implementation Decisions

### Quiz Entry Point
- **D-01:** Add a "测验" Tab to the existing `ReadingPackPanel` Tabs row (原文 / i+1 / 对照 / **测验**). Reuses the established Radix Tabs pattern — no new routes or navigation changes needed.
- **D-02:** Quiz UI is embedded within the reading pack page (same page, tab switch). No independent route — keeps the user in the pack context.
- **D-03:** Quiz generation is user-triggered. User clicks the "测验" Tab, if no quiz exists yet, they see a "生成测验" button with loading state. LLM call happens on-demand, not pre-generated in background. Rationale: avoids wasting LLM tokens when users don't want a quiz.
- **D-04:** If the reading pack text is too short (< 100 words or < 3 sentences), hide the "测验" Tab entirely. No need to show a disabled state for content that can't produce meaningful questions.

### Question Types & Interaction Design
- **D-05:** Single-choice questions reuse the visual pattern from `ComprehensionCheckPanel.jsx` — option cards with A/B/C/D labels, selected state highlight, correct (green) / incorrect (red) reveal after submit. Adapted into the reading pack's CSS namespace (not immersive namespace).
- **D-06:** Fill-in-the-blank uses inline input fields. The sentence displays with a blank slot rendered as an underlined text input. User types freely. Validation is case-insensitive and trims whitespace. On submit, correct answers show green highlight, incorrect show red with the correct answer displayed below. Rationale: free input tests actual recall better than word-bank selection.
- **D-07:** Sentence ordering uses click-to-number interaction. Sentences are displayed as shuffled cards. User clicks cards in the order they believe is correct — each click assigns the next sequence number (1, 2, 3...). Click an already-numbered card to remove it and renumber. Rationale: more reliable than drag-and-drop across devices, simpler to implement, works well on mobile touch.
- **D-08:** Questions are presented in a scrollable list (all questions visible at once, not paginated one-by-one). Each question has its own submit button. A summary section at the bottom shows score after all questions are answered. Rationale: lets users scan the full quiz, answer in any order, and see their progress. Simpler UX than per-question navigation.

### Quiz Generation & Cost
- **D-09:** Each quiz generation produces 5-8 questions from the reading pack content: approximately 3 single-choice, 2 fill-in-the-blank, and 1-2 sentence ordering. The exact count depends on article length — shorter articles get fewer questions. LLM prompt specifies the target mix.
- **D-10:** Quiz generation consumes user balance (points). Uses the same `call_deepseek()` + `billing_service.consume_points()` pattern as reading material generation. Show estimated cost before generation ("生成测验约消耗 X 积分") with a confirm action.
- **D-11:** Add a new backend endpoint `POST /api/llm/quiz/generate` that accepts `{ pack_text: string, original_text: string, target_level: string }` and returns structured JSON with quiz questions. The endpoint calls DeepSeek with a quiz-generation system prompt, parses the JSON response, and validates question structure before returning.
- **D-12:** LLM prompt design direction: system prompt instructs DeepSeek to generate comprehension questions based on the article content. Questions should test understanding of main ideas, vocabulary in context, and text structure (not trivia). Output format is strict JSON with typed question objects. Temperature 0.7 for variety.
- **D-13:** Generation failure handling: if LLM returns invalid JSON or empty response, show inline error "测验生成失败，请重试" with a retry button. The `call_deepseek()` retry logic (up to 2 retries) handles transient API failures automatically.

### Quiz Result & State
- **D-14:** Quiz data (questions + user answers + score) is persisted in IndexedDB alongside the reading pack. Extend the existing `readingRewriteDB.js` pack record with a `quiz` field: `{ questions: [...], answers: {...}, score: { correct: N, total: M }, completedAt: ISO timestamp }`.
- **D-15:** Users can retake the quiz. A "重新测验" button clears answers and score, allowing the user to re-answer the same questions. A "重新生成" button calls LLM again to get fresh questions (consumes points again).
- **D-16:** After all questions are answered, show a score summary card at the top of the quiz: "答对 X / Y 题" with a percentage and a brief assessment (e.g., "很棒！" for >= 80%, "继续加油！" for < 80%). No detailed analytics — keep it simple and encouraging.
- **D-17:** Quiz completion status is reflected in history. Extend `HistoryPanel.jsx` to show a small quiz badge (e.g., "✓ 测验 5/6") next to packs that have completed quizzes. Aligns with PACK-03 history display.

### Claude's Discretion
- Question type visual styling details (colors, spacing, animations) — follow existing reading pack CSS patterns
- Exact LLM prompt wording and JSON schema — planner/researcher will finalize based on testing
- Whether to show question type labels ("选择题", "填空题", "排序题") as section headers or inline badges — Claude decides during implementation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Learning Pack — Comprehension Quiz — QUIZ-01 and QUIZ-02 define acceptance criteria

### Existing Quiz UI Pattern
- `frontend/src/features/immersive/ComprehensionCheckPanel.jsx` — Single-choice quiz panel with option cards, submit, correct/incorrect feedback. Visual pattern to adapt (not import directly — different feature namespace).
- `frontend/src/features/immersive/immersive.css` — `.immersive-quiz-panel__*` CSS classes for reference

### Reading Pack Integration Points
- `frontend/src/features/reading/ReadingPackPanel.jsx` — Current Tabs (original/rewritten/comparison) — add quiz Tab here
- `frontend/src/features/reading/ReadingPage.jsx` — Pipeline orchestrator, manages pack state
- `frontend/src/features/reading/readingRewriteDB.js` — IndexedDB storage, extend pack schema for quiz data
- `frontend/src/features/reading/HistoryPanel.jsx` — History display, add quiz completion badge

### LLM Infrastructure
- `app/infra/llm/deepseek.py` — `call_deepseek()` function with retry logic and token usage tracking
- `app/api/routers/llm.py` — Composed LLM router with submodule pattern (add `llm_quiz.py` submodule)
- `app/api/routers/llm_shared.py` — Shared LLM utilities (`_require_api_key`, model constants)
- `app/services/billing_service.py` — `consume_points()`, `calculate_llm_charge_by_tokens()`, `get_model_rate()`

### Prior Phase Context
- `.planning/phases/38-brand-rename/38-CONTEXT.md` — Brand is "Unlock" (user-visible strings)
- `.planning/phases/39-multi-modal-input-pipeline/39-CONTEXT.md` — sourceMetadata in IndexedDB, input adapters

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ComprehensionCheckPanel.jsx`: Single-choice question UI pattern (option cards, A/B/C/D labels, submit/reset, correct/incorrect state) — adapt visual pattern into reading pack quiz
- `call_deepseek()`: LLM call with retry, token usage extraction, billing integration — reuse directly for quiz generation
- `readingRewriteDB.js`: IndexedDB wrapper with `reading_rewrites_v3` store — extend pack record schema
- Radix UI `Tabs`, `Input`, `Button` components — use for quiz Tab and interactions
- `billing_service.py`: Point consumption, cost estimation, model rate lookup — reuse for quiz cost

### Established Patterns
- LLM API routes split by capability: `llm_reading.py`, `llm_sentence.py`, `llm_vocabulary.py` — add `llm_quiz.py`
- Pydantic request/response schemas in `app/schemas/` — add quiz schemas
- Frontend state: Zustand stores + React local state (quiz state can be local to the component, persisted to IndexedDB)
- CSS: BEM-like naming within feature namespace (e.g., `.reading-pack__*`, `.immersive-quiz-panel__*`)
- Error display: `sonner` toast for transient errors, inline messages for form validation

### Integration Points
- `ReadingPackPanel.jsx` Tabs — add new TabsTrigger + TabsContent for quiz
- `ReadingPage.jsx` — pass pack data + quiz state down to quiz component
- `readingRewriteDB.js` — extend `saveHistoryRecord()` and pack schema for quiz field
- `HistoryPanel.jsx` — extend history card to show quiz badge
- `app/api/routers/llm.py` — include new `quiz_router`
- `app/main.py` — router already composed via llm.py, no change needed if quiz router is a submodule of llm

</code_context>

<specifics>
## Specific Ideas

No specific requirements — user delegated all decisions to Claude ("你自己决策"). All decisions above are Claude's recommended defaults based on:
- Reusing existing quiz UI patterns from `ComprehensionCheckPanel.jsx`
- Following established LLM integration patterns (deepseek.py + billing)
- Keeping quiz inline with reading pack (Tab, not separate page) for context coherence
- Click-to-number for sentence ordering (more reliable than drag-and-drop)
- Scrollable question list (simpler than paginated navigation)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 41-quiz-generation*
*Context gathered: 2026-04-10*
