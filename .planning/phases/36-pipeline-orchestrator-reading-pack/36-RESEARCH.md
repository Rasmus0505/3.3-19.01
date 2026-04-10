# Phase 36: Pipeline Orchestrator & Reading Pack - Research

**Researched:** 2026-04-10  
**Domain:** Reading pipeline orchestration, local-first reading-pack persistence, staged frontend UX  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

Copied verbatim from `.planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md`. [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md]

### Locked Decisions
- **D-01:** 生成过程采用更强的“舞台式主视图”，而不是继续沿用当前普通阅读页骨架上叠一个弱覆盖层。
- **D-02:** 舞台式主视图必须显式展示以下命名阶段：`parsing`、`difficulty judgment`、`simplification planning`、`text rewriting`、`reading-pack assembly`。
- **D-03:** 生成中的主要视觉重心是“当前正在推进哪一个阶段、上一步完成了什么、下一步将产出什么”，而不是只显示一个通用 loading spinner。
- **D-04:** 生成成功后进入独立的“阅读包资产页”结果态，而不是简单回到当前阅读工作台并把它当作普通 rewrite 结果。
- **D-05:** 阅读包页顶部需要有明确的 pack 头部，至少包含材料状态、目标等级、诊断摘要入口或概览，以及这是一个“已生成资产”而不是临时结果的信号。
- **D-06:** 阅读包是本 phase 的持久化单位，现有 `reading_rewrites_v3` 记录结构应向 reading pack 演进，而不是另起一套完全独立的结果模型。
- **D-07:** 阅读包内保留三种阅读模式：`original`、`i+1`、`sentence-by-sentence comparison`，以满足 Phase 36 的正式范围。
- **D-08:** `sentence-by-sentence comparison` 采用“句子卡片式”对照，而不是纯左右并排表格或简单上下堆叠。
- **D-09:** 逐句对照视图的用途是展示整句 before/after 变化，帮助用户理解系统整体保留了什么、改动了什么；它不是用来替代词级提示。
- **D-10:** 被改写后的词仍然保留 hover 查看原文的轻量交互，用于词级即时对照；句级对照与词级 hover 同时存在，不做二选一。
- **D-11:** 交互原则优先级为“最少丢失上下文、最容易继续”，因此刷新或离开后应优先恢复到最近一次已持久化的阶段状态，而不是让用户回到空白输入态重来。
- **D-12:** 如果已有完成的 reading pack，重新打开材料时应直接进入对应阅读包，而不是重新播放整个生成流程。
- **D-13:** 如果生成在中途被打断，重新进入时应回到舞台式主视图，并明确显示最近完成到哪一阶段，同时提供“继续生成”入口。
- **D-14:** 如果某一阶段失败，界面必须说明失败发生在哪个阶段，并保留原文可读 / 可回退能力；失败不应让用户失去已完成的诊断和已保存的材料上下文。

### Claude's Discretion
- **D-15:** 舞台式主视图内部是横向 stage rail、卡片栈还是中心舞台 + 侧边阶段列表，可由后续规划根据现有布局成本决定，只要“阶段可见性”和“比赛展示感”不被削弱。
- **D-16:** 阅读包头部中诊断摘要是做成固定摘要条、折叠卡还是轻量信息区，可由后续规划决定。
- **D-17:** 中断恢复是自动续跑还是默认停在最近已完成阶段等待用户点击继续，可由后续规划按可靠性权衡，但不能让用户无感丢状态。

### Deferred Ideas (OUT OF SCOPE)
- 结构化词汇解释面板（保留 i+1 词 / 被简化表达分栏解释）属于 Phase 37。
- 从 reading pack 直接加入生词本、继续学习、进入历史 pack library 的学习接力属于 Phase 37。
- 历史列表升级为正式 reading pack 资产卡片库属于 Phase 37。
- 同一材料多 target-level variants 和阅读后题目生成属于后续 requirements，不在 Phase 36 内锁定。
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-01 | User can watch a staged generation flow with parsing, difficulty judgment, simplification planning, text rewriting, and reading-pack assembly. | Use a reducer-backed local pipeline ledger plus a dedicated stage UI that reuses the upload module's staged progress pattern. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: frontend/src/features/upload/uploadTaskViewModel.js] [CITED: https://react.dev/learn/extracting-state-logic-into-a-reducer] |
| PIPE-02 | User can see stage-specific progress and failure states, including original-mode fallback. | Persist per-stage status, current copy, and failure metadata in the existing rewrite record; keep original text readable regardless of pipeline outcome. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: frontend/src/hooks/useReadingRewrite.js] [VERIFIED: frontend/src/features/reading/LeftPanel.jsx] |
| PIPE-03 | Refresh/navigation interruption can recover the latest in-progress state or completed output. | Save pipeline snapshots after every stage transition inside `reading_rewrites_v3`, and route history reopen to either pipeline resume or finished pack view. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: frontend/src/features/reading/readingRewriteDB.js] [VERIFIED: frontend/src/features/reading/HistoryPanel.jsx] [CITED: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB] |
| PACK-01 | User receives a persistent reading pack asset with original text, rewritten text, target metadata, mappings, and diagnostic summary. | Evolve the current rewrite record into a pack record instead of creating a parallel store. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md] [VERIFIED: frontend/src/features/reading/readingRewriteDB.js] |
| PACK-02 | User can switch between original, i+1, and sentence-by-sentence comparison view inside the pack. | Keep `original` and rewritten rendering on `ArticlePanel`, add a comparison-card mode backed by assembled pack data and the existing mapping contract. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: frontend/src/features/reading/ArticlePanel.jsx] [VERIFIED: frontend/src/features/reading/ReadingPage.jsx] |
</phase_requirements>

## Summary

Phase 36 should stay on the existing React + local IndexedDB architecture and add an explicit pipeline layer on top of the current diagnostic and rewrite flow, rather than introducing a new backend "orchestrator" endpoint or a second local database. The repo already has the right seams: `ReadingPage.jsx` owns flow entry, `useReadingRewrite.js` owns persisted reading state, `readingRewriteDB.js` already stores one article-scoped record, and the upload flow already demonstrates how this codebase models named stages, per-stage copy, and recovery-first progress UX. [VERIFIED: frontend/src/features/reading/ReadingPage.jsx] [VERIFIED: frontend/src/hooks/useReadingRewrite.js] [VERIFIED: frontend/src/features/reading/readingRewriteDB.js] [VERIFIED: frontend/src/features/upload/uploadTaskViewModel.js]

The strongest planning move is to turn the current scattered booleans and coarse `flowStatus` into a reducer-backed pipeline ledger with five user-visible stages, persist that ledger after each stage, and assemble a first-class `readingPack` object at the end of the run. `original` and `i+1` views should continue to reuse `ArticlePanel` so current hover/highlight behavior does not regress, while comparison mode should read from preassembled sentence cards stored in the pack instead of trying to infer alignment ad hoc during render. [VERIFIED: frontend/src/features/reading/ArticlePanel.jsx] [VERIFIED: frontend/src/hooks/useReadingRewrite.js] [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md] [CITED: https://react.dev/learn/extracting-state-logic-into-a-reducer]

**Primary recommendation:** Keep orchestration client-side, add a reducer-driven pipeline machine plus pack-assembly helpers, evolve `reading_rewrites_v3` into the single persisted pack record, and reuse existing shared `Progress`/`Tabs` primitives for the stage and pack views. [VERIFIED: frontend/src/features/reading/readingRewriteDB.js] [VERIFIED: frontend/src/shared/ui/index.js] [VERIFIED: frontend/src/components/ui/progress.jsx] [VERIFIED: frontend/src/components/ui/tabs.jsx]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | Repo pinned `^18.3.1`; npm latest `19.2.5` published `2026-04-08T18:39:24.455Z` | Route-level orchestration, reducer state, lazy-loaded reading surfaces | The reading feature already runs on React, and React's reducer guidance fits the new multi-stage local state better than adding a second state library in this phase. [VERIFIED: frontend/package.json] [VERIFIED: npm registry] [CITED: https://react.dev/learn/extracting-state-logic-into-a-reducer] |
| IndexedDB (Web API) | Browser built-in | Durable local pack storage, resume state, history reopen | The current reading feature already persists records locally; IndexedDB versioning and upgrade hooks are the correct browser-native place for future indexed schema changes, while adding non-indexed fields needs no second database. [VERIFIED: frontend/src/features/reading/readingRewriteDB.js] [CITED: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB] [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm] |
| `@radix-ui/react-progress` via shared `Progress` | Repo pinned `^1.1.8`; npm latest `1.1.8` published `2025-11-04T17:57:32.445Z` | Accessible progress bars for the stage view | The dependency and wrapper already exist, so the stage UI can stay consistent with the rest of the app and avoid bespoke accessibility work. [VERIFIED: frontend/package.json] [VERIFIED: npm registry] [VERIFIED: frontend/src/components/ui/progress.jsx] |
| `@radix-ui/react-tabs` via shared `Tabs` | Repo pinned `^1.1.13`; npm latest `1.1.13` published `2025-08-13T20:48:19.375Z` | Pack-mode switching among `original`, `i+1`, and `comparison` | The dependency and wrapper already exist, so pack-mode switching does not need a custom tab system. [VERIFIED: frontend/package.json] [VERIFIED: npm registry] [VERIFIED: frontend/src/components/ui/tabs.jsx] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | Repo resolved `3.2.4` during test run; npm latest `4.1.4` published `2026-04-09T07:36:52.741Z` | Frontend unit/component validation in `jsdom` | Use for all new pure helpers and reading UI tests; do not upgrade to Vitest 4 in this phase. [VERIFIED: frontend/package.json] [VERIFIED: npm registry] [VERIFIED: frontend/vitest.config.ts] [VERIFIED: command `npm run test -- --run src/features/reading/readingDiagnostics.test.js`] |
| `@testing-library/react` | Repo pinned `^16.3.0`; npm latest `16.3.2` | Reading page interaction tests and resume-flow assertions | Use for `ReadingPage` pipeline/pack component tests when DOM interaction matters. [VERIFIED: frontend/package.json] [VERIFIED: npm registry] [VERIFIED: frontend/vitest.config.ts] |
| pytest | Repo resolved `8.3.5` during test run | Backend regression checks if this phase changes LLM endpoint contracts | Use only if planning chooses to change backend API shapes; the current recommended approach does not require backend contract changes. [VERIFIED: command `pytest tests/api/test_llm_rewrite.py -q`] [VERIFIED: tests/api/test_llm_rewrite.py] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing hook + reducer + pure helpers | XState or another state-machine library | A dedicated state-machine library would formalize transitions, but the repo has no such dependency today and the current flow is small enough that a reducer is the lower-risk brownfield fit. [VERIFIED: frontend/package.json] [CITED: https://react.dev/learn/extracting-state-logic-into-a-reducer] [ASSUMED] |
| Evolve `reading_rewrites_v3` | New `reading_packs_v1` database/store | A new store would duplicate lifecycle logic, break the existing history coupling, and increase recovery bugs for little gain in this phase. [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md] [VERIFIED: frontend/src/features/reading/HistoryPanel.jsx] [VERIFIED: frontend/src/features/reading/readingRewriteDB.js] |
| Shared `Progress`/`Tabs` wrappers | Bespoke progress bars and tab toggles | Rebuilding controls here would duplicate existing UI primitives and add avoidable a11y/styling drift. [VERIFIED: frontend/src/shared/ui/index.js] [VERIFIED: frontend/src/components/ui/progress.jsx] [VERIFIED: frontend/src/components/ui/tabs.jsx] |

**Installation:**  
No new packages are recommended for Phase 36. [VERIFIED: frontend/package.json] [VERIFIED: frontend/src/shared/ui/index.js]

**Version verification:**  
- React latest on npm: `19.2.5` published `2026-04-08T18:39:24.455Z`. The repo is still pinned to React 18, so this phase should stay on the existing major version. [VERIFIED: npm registry] [VERIFIED: frontend/package.json]  
- `@radix-ui/react-progress` latest on npm: `1.1.8` published `2025-11-04T17:57:32.445Z`. [VERIFIED: npm registry]  
- `@radix-ui/react-tabs` latest on npm: `1.1.13` published `2025-08-13T20:48:19.375Z`. [VERIFIED: npm registry]  
- Vitest latest on npm: `4.1.4` published `2026-04-09T07:36:52.741Z`, but the repo currently resolves `3.2.4` and Phase 36 should not bundle a test-runner upgrade with feature work. [VERIFIED: npm registry] [VERIFIED: command `npm run test -- --run src/features/reading/readingDiagnostics.test.js`] [VERIFIED: frontend/package.json]

## Architecture Patterns

### Recommended Project Structure

```text
frontend/src/features/reading/
├── ReadingPage.jsx                 # keeps route ownership, chooses input/diagnostic/pipeline/pack mode
├── ReadingPipelinePanel.jsx        # stage rail, stage copy, failure/recovery CTA surface
├── ReadingPackPanel.jsx            # pack header + mode switch + comparison cards
├── readingPipelineMachine.js       # reducer, stage constants, transition helpers
├── readingPack.js                  # pure pack assembly + compare-card builders
├── readingRewriteDB.js             # evolved pack record persistence
├── readingDiagnostics.js           # existing diagnostic helpers reused by pipeline
└── *.test.js / *.test.jsx          # pure helper + component tests
```

This structure matches the repo's existing feature-local module pattern and keeps state logic out of `ReadingPage.jsx`, which is already carrying too many responsibilities. [VERIFIED: frontend/src/features/reading/ReadingPage.jsx] [VERIFIED: frontend/src/features/reading/DiagnosticPanel.jsx] [VERIFIED: frontend/src/features/reading/readingDiagnostics.js] [ASSUMED]

### Pattern 1: Reducer-Driven Pipeline Ledger

**What:** Model the five visible stages plus failure/recovery metadata in one reducer-owned object instead of splitting the same truth across `mode`, `flowStatus`, `isRewriting`, `rewriteError`, and temporary component-local booleans. [VERIFIED: frontend/src/features/reading/ReadingPage.jsx] [VERIFIED: frontend/src/hooks/useReadingRewrite.js] [CITED: https://react.dev/learn/extracting-state-logic-into-a-reducer]

**When to use:** Use for every transition from `diagnostic -> pipeline -> pack`, and persist the reducer snapshot after each stage completion or failure. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md]

**Example:**

```javascript
// Source: React reducer guidance + uploadTaskViewModel stage snapshot pattern
export const READING_PIPELINE_STAGES = [
  "parsing",
  "difficulty_judgment",
  "simplification_planning",
  "text_rewriting",
  "reading_pack_assembly",
];

export const initialPipelineState = {
  mode: "diagnostic",
  currentStage: null,
  stages: READING_PIPELINE_STAGES.map((key) => ({
    key,
    status: "pending",
    headline: "",
    detail: "",
    progressPercent: 0,
    updatedAt: null,
  })),
  lastCompletedStage: null,
  error: null,
  resumeAvailable: false,
};

export function readingPipelineReducer(state, action) {
  switch (action.type) {
    case "stage_started":
      return {
        ...state,
        mode: "pipeline",
        currentStage: action.stage,
        error: null,
        stages: state.stages.map((item) =>
          item.key === action.stage
            ? { ...item, status: "running", headline: action.headline, detail: action.detail, progressPercent: action.progressPercent ?? 0, updatedAt: Date.now() }
            : item
        ),
      };
    case "stage_completed":
      return {
        ...state,
        lastCompletedStage: action.stage,
        stages: state.stages.map((item) =>
          item.key === action.stage
            ? { ...item, status: "completed", progressPercent: 100, detail: action.detail, updatedAt: Date.now() }
            : item
        ),
      };
    case "stage_failed":
      return {
        ...state,
        mode: "pipeline",
        error: { stage: action.stage, message: action.message, originalFallbackAvailable: true },
        resumeAvailable: true,
        stages: state.stages.map((item) =>
          item.key === action.stage
            ? { ...item, status: "failed", detail: action.message, updatedAt: Date.now() }
            : item
        ),
      };
    default:
      return state;
  }
}
```

### Pattern 2: Single Record, Assetized Pack

**What:** Keep one article-scoped local record and evolve it from "rewrite draft" into "reading pack asset" by adding `pipeline`, `pack`, and `comparison` fields instead of creating parallel stores. [VERIFIED: frontend/src/features/reading/readingRewriteDB.js] [VERIFIED: frontend/src/features/reading/HistoryPanel.jsx] [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md]

**When to use:** Use for all persistence and recovery logic in this phase, including history reopen, refresh recovery, and completed-pack reentry. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: frontend/src/features/reading/HistoryPanel.jsx]

**Example:**

```javascript
// Source: existing reading_rewrites_v3 record shape, extended for Phase 36
const nextRecord = {
  articleId,
  originalText,
  rewrittenText,
  mappings,
  validI1Words,
  validAboveI1Words,
  removedWords,
  wordLevels,
  diagnosticSnapshot,
  flowStatus: "pipeline", // or "diagnosed" | "generated" | "failed"
  pipeline: {
    currentStage: "text_rewriting",
    lastCompletedStage: "simplification_planning",
    stages,
    error: null,
    updatedAt: Date.now(),
  },
  pack: {
    status: "completed",
    targetLevel: diagnosticSnapshot.selectedTargetLevel,
    assembledAt: Date.now(),
    diagnosticSummary: {
      materialDifficulty: diagnosticSnapshot.materialDifficulty,
      preservedI1Count: diagnosticSnapshot.preservedI1Count,
      aboveI1Count: diagnosticSnapshot.aboveI1Count,
    },
    comparisonCards,
  },
  viewMode: "original",
  rewrittenAt: Date.now(),
};
```

### Pattern 3: Compare Cards Built During Assembly

**What:** Assemble sentence-by-sentence comparison cards once during the `reading-pack assembly` stage and persist them in the pack so later renders do not need to re-infer alignment. [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md] [VERIFIED: frontend/src/features/reading/ArticlePanel.jsx] [ASSUMED]

**When to use:** Use when the pipeline completes successfully and whenever a finished pack is reopened. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: frontend/src/features/reading/HistoryPanel.jsx]

**Example:**

```javascript
// Source: existing original/rewritten text + mapping contract
export function buildComparisonCards({ originalSentences, rewrittenSentences, mappingsBySentence }) {
  return originalSentences.map((originalSentence, index) => ({
    id: `${index + 1}`,
    sentenceIndex: index,
    originalText: originalSentence,
    rewrittenText: rewrittenSentences[index] || originalSentence,
    mappings: mappingsBySentence[index] || [],
  }));
}
```

### Anti-Patterns to Avoid

- **Do not keep pipeline truth in both page-level booleans and hook-level booleans:** the current feature already splits flow truth across `mode`, `isRewriting`, `rewriteError`, and `flowStatus`; adding more booleans will create impossible UI states. [VERIFIED: frontend/src/features/reading/ReadingPage.jsx] [VERIFIED: frontend/src/hooks/useReadingRewrite.js]
- **Do not create a second pack database just for comparison mode:** `HistoryPanel` already couples history selection and rewrite metadata by `articleId`, so a second store would increase recovery complexity immediately. [VERIFIED: frontend/src/features/reading/HistoryPanel.jsx] [VERIFIED: frontend/src/features/reading/readingRewriteDB.js]
- **Do not compute compare mode from live DOM text or ad hoc string diffing:** the phase requirement is to preserve current highlight/mapping accuracy, so comparison mode must reuse persisted pack data and current mapping semantics. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: frontend/src/features/reading/ArticlePanel.jsx]
- **Do not bundle a React/Vitest major-version upgrade into this phase:** the repo is pinned to React 18 and currently resolves Vitest 3.x. [VERIFIED: frontend/package.json] [VERIFIED: npm registry]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-stage transition logic | Another pile of `useState` booleans in `ReadingPage.jsx` | A local reducer plus pure transition helpers | React explicitly recommends reducers when state logic starts spreading across handlers, and the current page is already beyond simple-boolean scale. [VERIFIED: frontend/src/features/reading/ReadingPage.jsx] [CITED: https://react.dev/learn/extracting-state-logic-into-a-reducer] |
| Stage progress chrome | Custom, one-off progress bars and tab toggles | Existing shared `Progress` and `Tabs` wrappers | The wrappers are already in the repo and keep styles/accessibility consistent. [VERIFIED: frontend/src/shared/ui/index.js] [VERIFIED: frontend/src/components/ui/progress.jsx] [VERIFIED: frontend/src/components/ui/tabs.jsx] |
| Recovery storage | A new `reading_packs` database or server session | The existing `reading_rewrites_v3` record keyed by `articleId` | The current feature already uses that record for history reopen and view preference; reusing it avoids split-brain state. [VERIFIED: frontend/src/features/reading/readingRewriteDB.js] [VERIFIED: frontend/src/features/reading/HistoryPanel.jsx] |
| Comparison-mode alignment | Runtime text diffing or DOM inspection | Pack assembly helpers that persist comparison cards once | Render-time inference is harder to test and more likely to drift from the exact text that was saved. [VERIFIED: frontend/src/features/reading/ArticlePanel.jsx] [ASSUMED] |

**Key insight:** Phase 36 is mostly orchestration and persistence work, not a library hunt. The repo already contains the required UI primitives, persistence seam, and staged-progress precedent. [VERIFIED: frontend/src/features/upload/uploadTaskViewModel.js] [VERIFIED: frontend/src/features/reading/readingRewriteDB.js] [VERIFIED: frontend/src/shared/ui/index.js]

## Common Pitfalls

### Pitfall 1: Impossible Hybrid States

**What goes wrong:** The page shows a reading surface, a pipeline error, and a diagnostic CTA at the same time because `mode`, `flowStatus`, `isRewriting`, and `rewriteError` drift out of sync. [VERIFIED: frontend/src/features/reading/ReadingPage.jsx] [VERIFIED: frontend/src/hooks/useReadingRewrite.js]  
**Why it happens:** The current flow already stores overlapping state in multiple places, and Phase 36 adds even more transitions unless it centralizes them. [VERIFIED: frontend/src/features/reading/ReadingPage.jsx] [VERIFIED: frontend/src/hooks/useReadingRewrite.js]  
**How to avoid:** Put stage truth in one reducer-owned ledger and derive UI mode from that ledger instead of from independent booleans. [CITED: https://react.dev/learn/extracting-state-logic-into-a-reducer]  
**Warning signs:** Repeated `setMode(...)` calls around async boundaries and effects that infer mode from several unrelated values. [VERIFIED: frontend/src/features/reading/ReadingPage.jsx]

### Pitfall 2: Recovery That Only Saves the End State

**What goes wrong:** Refresh recovery fails because only `diagnosed` and `generated` are persisted today. [VERIFIED: frontend/src/hooks/useReadingRewrite.js] [VERIFIED: frontend/src/features/reading/readingRewriteDB.js]  
**Why it happens:** The current hook only writes to IndexedDB when diagnosis finishes or rewrite finishes. [VERIFIED: frontend/src/hooks/useReadingRewrite.js]  
**How to avoid:** Persist after every stage start/completion/failure, not only after final success. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md]  
**Warning signs:** A refreshed page can recover the diagnostic card but not the latest pipeline progress copy. [VERIFIED: .planning/REQUIREMENTS.md]

### Pitfall 3: Comparison View That Breaks Existing Mapping Semantics

**What goes wrong:** Comparison mode highlights words differently from `original`/`i+1` views or loses hover/original-word fidelity. [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md] [VERIFIED: frontend/src/features/reading/ArticlePanel.jsx]  
**Why it happens:** A second, compare-only mapping path gets introduced instead of reusing the existing `rewriteMappings` contract. [VERIFIED: frontend/src/features/reading/ArticlePanel.jsx] [VERIFIED: frontend/src/hooks/useReadingRewrite.js]  
**How to avoid:** Build comparison cards from the same saved original text, rewritten text, and mappings that feed `ArticlePanel`. [VERIFIED: frontend/src/features/reading/ArticlePanel.jsx] [VERIFIED: frontend/src/hooks/useReadingRewrite.js]  
**Warning signs:** A word hover shows a different original value in compare mode than in the normal rewritten view. [ASSUMED]

### Pitfall 4: Over-Migrating IndexedDB

**What goes wrong:** Planning spends time on a new database and migration path even though Phase 36 mostly adds non-indexed fields. [VERIFIED: frontend/src/features/reading/readingRewriteDB.js] [CITED: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB]  
**Why it happens:** Teams conflate "new object shape" with "new IndexedDB store". [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm] [ASSUMED]  
**How to avoid:** Keep the existing store unless the plan truly needs new indexes; if new indexes are required later, use `onupgradeneeded` and a version bump deliberately. [VERIFIED: frontend/src/features/reading/readingRewriteDB.js] [CITED: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB]  
**Warning signs:** The plan introduces both `reading_rewrites_v3` and `reading_packs_v1` without a compelling query need. [VERIFIED: frontend/src/features/reading/readingRewriteDB.js] [ASSUMED]

### Pitfall 5: Treating Full Pytest Green as an Immediate Phase Gate

**What goes wrong:** The phase looks blocked even when frontend work is correct because the repo already has an unrelated backend test failure. [VERIFIED: command `pytest tests/api/test_llm_rewrite.py -q`]  
**Why it happens:** `tests/api/test_llm_rewrite.py::TestSimplifyWords::test_parse_error_returns_502` currently fails because the asserted error string no longer matches the router response text. [VERIFIED: command `pytest tests/api/test_llm_rewrite.py -q`] [VERIFIED: tests/api/test_llm_rewrite.py] [VERIFIED: app/api/routers/llm_vocabulary.py]  
**How to avoid:** Scope Phase 36 validation to the frontend reading tests unless the plan intentionally changes backend LLM endpoints; call out the existing red backend check as pre-existing. [VERIFIED: frontend/vitest.config.ts] [VERIFIED: tests/api/test_llm_rewrite.py]  
**Warning signs:** A plan that says "full pytest green" without acknowledging the current failing baseline. [VERIFIED: command `pytest tests/api/test_llm_rewrite.py -q`]

## Code Examples

Verified patterns from official sources and the current codebase:

### Persist Stage Snapshots After Every Transition

```javascript
// Source: uploadTaskViewModel local stage snapshot pattern +
// existing readingRewriteDB persistence hook
async function persistPipelineStage({ articleId, originalText, pipeline, pack = null }) {
  const existing = (await getRewriteRecord(articleId)) || {};
  await saveRewriteRecord({
    ...existing,
    articleId,
    originalText,
    flowStatus: pack?.status === "completed" ? "generated" : "pipeline",
    pipeline,
    pack,
    rewrittenAt: Date.now(),
  });
}
```

Pattern basis: the upload flow already persists stage-oriented snapshots, and the reading hook already merges/puts article-scoped records. [VERIFIED: frontend/src/features/upload/uploadTaskViewModel.js] [VERIFIED: frontend/src/features/reading/readingRewriteDB.js] [VERIFIED: frontend/src/hooks/useReadingRewrite.js]

### Build a Pack View With Shared Tabs

```javascript
// Source: shared Tabs wrapper + Phase 36 pack requirement
<Tabs value={viewMode} onValueChange={setViewMode}>
  <TabsList>
    <TabsTrigger value="original">Original</TabsTrigger>
    <TabsTrigger value="rewritten">i+1</TabsTrigger>
    <TabsTrigger value="comparison">Comparison</TabsTrigger>
  </TabsList>

  <TabsContent value="original">
    <ArticlePanel text={pack.originalText} viewMode="original" {...sharedProps} />
  </TabsContent>

  <TabsContent value="rewritten">
    <ArticlePanel text={pack.rewrittenText} viewMode="rewritten" {...sharedProps} />
  </TabsContent>

  <TabsContent value="comparison">
    <ReadingComparisonCards cards={pack.comparisonCards} />
  </TabsContent>
</Tabs>
```

Pattern basis: the shared tabs primitives already exist, and `ArticlePanel` already differentiates original vs rewritten display using `viewMode`. [VERIFIED: frontend/src/components/ui/tabs.jsx] [VERIFIED: frontend/src/shared/ui/index.js] [VERIFIED: frontend/src/features/reading/ArticlePanel.jsx]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Diagnose, then jump to a generic reading/rewrite state | Diagnose, then show a five-stage visible pipeline before landing on a pack asset | Locked for Phase 36 on 2026-04-10 | Better demo legibility and better interruption recovery. [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md] [VERIFIED: .planning/ROADMAP.md] |
| Treat `rewrittenText` as the end product | Treat a persistent reading pack as the end product | Locked for v2.8 / Phase 36 on 2026-04-10 | History, comparison mode, and later learning handoff all anchor on one asset. [VERIFIED: .planning/STATE.md] [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md] |
| Two reading modes: original and rewritten | Three pack modes: original, i+1, sentence-by-sentence comparison | Required by Phase 36 | The final surface becomes an explorable asset instead of a binary toggle. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md] |
| Persist only draft diagnosis or final rewrite success | Persist the pipeline ledger plus the final pack | Required by PIPE-03 | Refresh/navigation recovery becomes a first-class feature instead of a best effort. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: frontend/src/hooks/useReadingRewrite.js] |

**Deprecated/outdated:**
- Using `flowStatus` as only `idle | diagnosed | generated` is insufficient for Phase 36 because it cannot encode per-stage resume or failure state. [VERIFIED: frontend/src/hooks/useReadingRewrite.js] [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md]
- Treating the normal reading layout plus loading overlay as the generation experience is explicitly outside the locked Phase 36 direction. [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Comparison cards can be assembled entirely on the client from saved original text, rewritten text, and mappings without needing a new backend response shape. [ASSUMED] | Architecture Patterns | Medium — planner may need a backend task if alignment proves unstable. |
| A2 | A shared sentence-splitting helper will be good enough for pasted reading material if pack assembly stores the final card data instead of recomputing on reopen. [ASSUMED] | Architecture Patterns | Medium — poor sentence segmentation would degrade comparison mode quality. |
| A3 | A reducer in feature-local code is sufficient and a dedicated state-machine library is unnecessary for this five-stage flow. [ASSUMED] | Standard Stack | Low — worst case is a later refactor, not a product dead end. |

## Open Questions

1. **Should resume auto-continue or stop on the last completed stage?** [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md]
   - What we know: the context explicitly leaves this to planner discretion under D-17, but forbids silent state loss. [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md]
   - What's unclear: whether auto-resume is reliable enough across refresh/reopen in this brownfield UI. [ASSUMED]
   - Recommendation: default to restoring the stage view with an explicit `继续生成` CTA unless the planner can prove auto-resume is cancel-safe and user-legible. [ASSUMED]

2. **Should the comparison view live inside the main reading column or as a dedicated pack section?** [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md]
   - What we know: D-08 locks comparison to sentence cards, and D-10 says word-level hover still matters. [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md]
   - What's unclear: whether sentence cards should replace the current article column or coexist as a tabbed pack mode. [ASSUMED]
   - Recommendation: keep comparison as a third pack tab so `ArticlePanel` remains the source of truth for the original and i+1 modes. [ASSUMED]

3. **Do we need backend changes at all?** [VERIFIED: app/api/routers/llm_vocabulary.py] [VERIFIED: frontend/src/features/reading/api/readingRewriteApi.js]
   - What we know: the current frontend already orchestrates diagnosis, lemma extraction, and simplification using existing endpoints. [VERIFIED: frontend/src/features/reading/ReadingPage.jsx] [VERIFIED: frontend/src/features/reading/api/readingRewriteApi.js]
   - What's unclear: whether planners want finer-grained failure attribution than the current endpoint boundary naturally provides. [ASSUMED]
   - Recommendation: plan Phase 36 as frontend-first; only add backend work if the planner finds a concrete failure-state requirement that cannot be expressed client-side. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Frontend build and test scripts | ✓ | `v24.14.1` | — [VERIFIED: command `node --version`] |
| npm | Frontend package scripts | ✓ | `11.11.0` | — [VERIFIED: command `npm --version`] |
| Python | Backend regression tests | ✓ | `3.13.13` | — [VERIFIED: command `python --version`] |
| Vitest | Frontend validation | ✓ | `3.2.4` during test run | — [VERIFIED: command `npm run test -- --run src/features/reading/readingDiagnostics.test.js`] |
| pytest | Backend regression validation | ✓ | `8.3.5` during test run | Scope to targeted backend tests only. [VERIFIED: command `pytest tests/api/test_llm_rewrite.py -q`] |

**Missing dependencies with no fallback:**  
None. [VERIFIED: command `node --version`] [VERIFIED: command `npm --version`] [VERIFIED: command `python --version`]

**Missing dependencies with fallback:**  
None, but the current backend regression target is not green before Phase 36 starts. [VERIFIED: command `pytest tests/api/test_llm_rewrite.py -q`]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `Vitest 3.2.4 + Testing Library` for frontend, `pytest 8.3.5` for backend regressions if API contracts change. [VERIFIED: frontend/vitest.config.ts] [VERIFIED: command `npm run test -- --run src/features/reading/readingDiagnostics.test.js`] [VERIFIED: command `pytest tests/api/test_llm_rewrite.py -q`] |
| Config file | `frontend/vitest.config.ts`; `pytest.ini`. [VERIFIED: frontend/vitest.config.ts] [VERIFIED: pytest.ini] |
| Quick run command | `npm run test -- --run src/features/reading/readingDiagnostics.test.js` [VERIFIED: command `npm run test -- --run src/features/reading/readingDiagnostics.test.js`] |
| Full suite command | `npm run test -- --run` for frontend; backend full-suite use should be deferred until the pre-existing `tests/api/test_llm_rewrite.py` failure is acknowledged or repaired. [VERIFIED: frontend/package.json] [VERIFIED: command `pytest tests/api/test_llm_rewrite.py -q`] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-01 | Pipeline view shows the five named stages in order and updates current/completed stage copy correctly. [VERIFIED: .planning/REQUIREMENTS.md] | component + reducer | `npm run test -- --run src/features/reading/readingPipelineMachine.test.js src/features/reading/ReadingPage.pipeline.test.jsx` | ❌ Wave 0 |
| PIPE-02 | Stage-specific error state names the failing stage and preserves original-mode readability/fallback CTA. [VERIFIED: .planning/REQUIREMENTS.md] | component | `npm run test -- --run src/features/reading/ReadingPage.pipeline.test.jsx` | ❌ Wave 0 |
| PIPE-03 | Refresh/reopen restores the last persisted pipeline snapshot or opens the finished pack directly. [VERIFIED: .planning/REQUIREMENTS.md] | hook + persistence | `npm run test -- --run src/features/reading/readingRewriteDB.pack.test.js src/features/reading/useReadingRewrite.resume.test.js` | ❌ Wave 0 |
| PACK-01 | Successful generation persists a pack object with original text, rewritten text, target metadata, mappings, and diagnostic summary. [VERIFIED: .planning/REQUIREMENTS.md] | pure helper + persistence | `npm run test -- --run src/features/reading/readingPack.test.js src/features/reading/readingRewriteDB.pack.test.js` | ❌ Wave 0 |
| PACK-02 | Pack switches among original, i+1, and comparison mode without breaking existing highlight/mapping behavior. [VERIFIED: .planning/REQUIREMENTS.md] | component | `npm run test -- --run src/features/reading/ReadingPackPanel.test.jsx` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test -- --run src/features/reading/readingDiagnostics.test.js` plus the new Phase 36 focused test file for the touched area. [VERIFIED: command `npm run test -- --run src/features/reading/readingDiagnostics.test.js`]
- **Per wave merge:** `npm run test -- --run` inside `frontend/`. [VERIFIED: frontend/package.json]
- **Phase gate:** Frontend reading tests green, and only run backend `pytest tests/api/test_llm_rewrite.py -q` if the plan changes API contracts. [VERIFIED: tests/api/test_llm_rewrite.py] [VERIFIED: command `pytest tests/api/test_llm_rewrite.py -q`]

### Wave 0 Gaps

- [ ] `frontend/src/features/reading/readingPipelineMachine.test.js` — reducer transition coverage for all five stages and failure/resume cases. [ASSUMED]
- [ ] `frontend/src/features/reading/readingPack.test.js` — pure pack assembly and comparison-card construction. [ASSUMED]
- [ ] `frontend/src/features/reading/readingRewriteDB.pack.test.js` — persisted pack/pipeline record shape and reopen semantics. [ASSUMED]
- [ ] `frontend/src/features/reading/ReadingPage.pipeline.test.jsx` — staged UX, failure copy, continue CTA. [ASSUMED]
- [ ] `frontend/src/features/reading/ReadingPackPanel.test.jsx` — `original` / `i+1` / `comparison` mode switching without regression. [ASSUMED]
- [ ] Existing backend regression is already red: `tests/api/test_llm_rewrite.py::TestSimplifyWords::test_parse_error_returns_502`. Treat this as pre-existing unless backend contracts change in the plan. [VERIFIED: command `pytest tests/api/test_llm_rewrite.py -q`]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Keep generation calls behind the existing authenticated `/api/llm/*` endpoints and preserve the current `accessToken` gate in the reading UI. [VERIFIED: frontend/src/features/reading/ReadingPage.jsx] [VERIFIED: app/api/routers/llm_vocabulary.py] |
| V3 Session Management | no | Phase 36 does not introduce a new session mechanism; it only adds local resume state on top of existing auth. [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md] [VERIFIED: frontend/src/features/reading/ReadingPage.jsx] |
| V4 Access Control | no | The recommended approach keeps packs local in IndexedDB and does not add a new multi-user server resource. [VERIFIED: .planning/PROJECT.md] [VERIFIED: frontend/src/features/reading/readingRewriteDB.js] |
| V5 Input Validation | yes | Continue Pydantic validation on existing LLM endpoints and keep pack rendering in plain React text, not raw HTML injection. [VERIFIED: app/api/routers/llm_vocabulary.py] [VERIFIED: frontend/src/features/reading/ArticlePanel.jsx] |
| V6 Cryptography | no | No new crypto or secret-storage mechanism is required in this phase. [VERIFIED: .planning/PROJECT.md] [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md] |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Rendering pasted or model-generated text as HTML instead of text | Tampering / Information Disclosure | Keep pack/article rendering as plain React text nodes and avoid `dangerouslySetInnerHTML`. [VERIFIED: frontend/src/features/reading/ArticlePanel.jsx] |
| Exposing raw backend/LLM internals in user-facing failure copy | Information Disclosure | Sanitize failure/status copy before showing it, borrowing the upload flow's `sanitizeUserFacingText` pattern. [VERIFIED: frontend/src/features/upload/uploadTaskViewModel.js] |
| Shared-browser leakage of local reading packs across accounts | Information Disclosure | Do not expand local persistence blindly; at minimum, preserve current delete/clear paths and call out the privacy tradeoff in planning. [VERIFIED: frontend/src/features/reading/HistoryPanel.jsx] [VERIFIED: frontend/src/features/reading/readingRewriteDB.js] [ASSUMED] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md` - locked decisions, scope, and phase boundary. [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md]
- `.planning/REQUIREMENTS.md` - formal requirement text for `PIPE-01` to `PACK-02`. [VERIFIED: .planning/REQUIREMENTS.md]
- `.planning/STATE.md` - milestone-level direction that the pack is the unit of value. [VERIFIED: .planning/STATE.md]
- `frontend/src/features/reading/ReadingPage.jsx` - current entry flow, mode switching, and generation handoff. [VERIFIED: frontend/src/features/reading/ReadingPage.jsx]
- `frontend/src/hooks/useReadingRewrite.js` - current persisted state contract and rewrite orchestration. [VERIFIED: frontend/src/hooks/useReadingRewrite.js]
- `frontend/src/features/reading/readingRewriteDB.js` - IndexedDB record shape and persistence seam. [VERIFIED: frontend/src/features/reading/readingRewriteDB.js]
- `frontend/src/features/reading/HistoryPanel.jsx` - reopen, status badge, and delete/clear coupling. [VERIFIED: frontend/src/features/reading/HistoryPanel.jsx]
- `frontend/src/features/reading/ArticlePanel.jsx` - original/rewritten rendering contract and mapping usage. [VERIFIED: frontend/src/features/reading/ArticlePanel.jsx]
- `frontend/src/features/upload/uploadTaskViewModel.js` - in-repo staged progress and recovery pattern worth reusing. [VERIFIED: frontend/src/features/upload/uploadTaskViewModel.js]
- `https://react.dev/learn/extracting-state-logic-into-a-reducer` - reducer guidance for complex local state. [CITED: https://react.dev/learn/extracting-state-logic-into-a-reducer]
- `https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB` - IndexedDB upgrade/versioning lifecycle. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB]
- `https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm` - object/value persistence model used by IndexedDB. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm]

### Secondary (MEDIUM confidence)

- npm registry version checks for React, Radix, Vitest, and Testing Library. [VERIFIED: npm registry]
- `frontend/package.json`, `frontend/vitest.config.ts`, `frontend/src/test/setup.ts` - actual repo test/runtime baseline. [VERIFIED: frontend/package.json] [VERIFIED: frontend/vitest.config.ts] [VERIFIED: frontend/src/test/setup.ts]
- Command verification: `npm run test -- --run src/features/reading/readingDiagnostics.test.js`, `pytest tests/api/test_llm_rewrite.py -q`, `node --version`, `npm --version`, `python --version`. [VERIFIED: command `npm run test -- --run src/features/reading/readingDiagnostics.test.js`] [VERIFIED: command `pytest tests/api/test_llm_rewrite.py -q`] [VERIFIED: command `node --version`] [VERIFIED: command `npm --version`] [VERIFIED: command `python --version`]

### Tertiary (LOW confidence)

- No tertiary-only ecosystem claims were used. [VERIFIED: this research session]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - the recommended stack is mostly the repo's existing stack, plus official React/IndexedDB guidance and npm registry verification. [VERIFIED: frontend/package.json] [VERIFIED: npm registry] [CITED: https://react.dev/learn/extracting-state-logic-into-a-reducer] [CITED: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB]
- Architecture: HIGH - recommendations are anchored in the current reading code, the upload stage pattern, and the locked Phase 36 context. [VERIFIED: frontend/src/features/reading/ReadingPage.jsx] [VERIFIED: frontend/src/features/upload/uploadTaskViewModel.js] [VERIFIED: .planning/phases/36-pipeline-orchestrator-reading-pack/36-CONTEXT.md]
- Pitfalls: HIGH - all major pitfalls come directly from the current brownfield state and explicit test/runtime verification. [VERIFIED: frontend/src/hooks/useReadingRewrite.js] [VERIFIED: command `pytest tests/api/test_llm_rewrite.py -q`]

**Research date:** 2026-04-10  
**Valid until:** 2026-05-10 for repo-internal architecture; npm latest-version checks should be refreshed sooner if the planner decides to add packages. [VERIFIED: npm registry]
