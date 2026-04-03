# Roadmap: Bottle English Learning v2.4

**Milestone:** v2.4 词汇等级预处理与 CEFR 沉浸式展示
**Started:** 2026-04-03
**Granularity:** Standard (2 phases)

---

## Phases

- [x] **Phase 24: CEFR 基础设施与 i 水平设置** — 批量预处理字幕文本、localStorage 缓存、chunked 执行、个人中心 CEFR 等级选择器、Zustand persist + PATCH API 同步 ✅ COMPLETE (2026-04-03)
- [ ] **Phase 25: CEFR 沉浸式展示与历史徽章** — 本句+上一句 CEFR 色块、i+1 计算逻辑、UI-SPEC 视觉契约、历史记录徽章、词选流畅放大动画

---

## Phase Details

### Phase 24: CEFR 基础设施与 i 水平设置

**Goal**: 用户打开视频时一次性预处理所有字幕词汇，缓存结果；个人中心支持 CEFR 水平选择并同步到服务端和本地。

**Depends on**: Nothing (first phase of v2.4)

**Requirements**: CEFR-01, CEFR-02, CEFR-03, CEFR-04, CEFR-12, CEFR-13, CEFR-14, CEFR-15

**Success Criteria** (what must be TRUE):

1. User opens a lesson and all subtitle words are tagged with CEFR levels (A1/B1/B2/C1/C2/SUPER) via vocabAnalyzer lookup — batch processing completes within the first load
2. Preprocessing results are cached in localStorage (`cefr_analysis_v1:{lessonId}`) — reopening the same lesson shows CEFR badges instantly without re-analysis
3. Batch analysis uses chunked execution (`setTimeout(0)` or `requestIdleCallback`) — UI thread remains responsive on 500+ sentence videos with no visible stutter
4. Unknown words not in cefr_vocab.json default to SUPER level — they always appear as hard/difficult regardless of user level
5. Personal Center exposes a CEFR level selector (A1/A2/B1/B2/C1/C2, default B1) with Duolingo-style Chinese descriptions per level
6. User's i level is persisted to their profile via PATCH API — level survives logout/login and works across devices
7. User's i level is cached locally via Zustand persist — works offline; syncs with server on next online session

**Plans**: 4 plans — COMPLETE ✅
**Migration**: `migrations/versions/20260403_0033_add_cefr_level.py` — committed, pending production run

---

### Phase 25: CEFR 沉浸式展示与历史徽章

**Goal**: 沉浸式学习页面实时展示词汇 CEFR 等级色块（当前句+上一句），历史记录列表标注课程难度，词选入生词本提供流畅动画反馈。

**Depends on**: Phase 24

**Requirements**: CEFR-05, CEFR-06, CEFR-07, CEFR-08, CEFR-09, CEFR-10, CEFR-11, CEFR-16, CEFR-17, CEFR-18

**Success Criteria** (what must be TRUE):

1. Immersive answer board displays both current sentence and previous sentence — each word has a visible CEFR level badge overlay
2. CEFR badge colors are teal/blue for i+1 (within reach) and amber/orange for above i+1 (too hard) — zero overlap with existing letter-state colors (green/red/yellow)
3. CEFR badge overlays cover the word entirely but do NOT override letter colors — green/red/yellow letter states remain visible through or alongside CEFR overlays
4. i+1 color calculation works correctly: word level == user_i_level + 1 → green badge; word level >= user_i_level + 2 → yellow badge; word level <= user_i_level → no badge
5. UI-SPEC.md defines the exact CEFR visual contract (colors, badge shape, z-index layering) before any rendering code is written for Phase 25
6. Lesson history list shows CEFR badges on each lesson card — color block + level text (e.g., teal block + "B2") — read from cached analysis results
7. Lesson-level CEFR distribution is calculated as an aggregate percentage breakdown (e.g., "B1: 45%, B2: 30%, C1: 15%, Other: 10%")
8. Tapping/selecting a word from the previous sentence to add to wordbook triggers a smooth scale-up animation (1.0 → 1.08, 200ms ease-out) as the primary feedback signal
9. "Selected for wordbook" feedback uses scale + border/badging — visually distinct from CEFR difficulty color, no background color change conflict
10. Hover state on selectable words in the previous sentence shows subtle scale + cursor hint

**Plans**: 4 plans — IN PROGRESS (1/4)
- [x] 25-01-PLAN.md — CSS foundation (CEFR color classes, wordbook animations) ✅ COMPLETE 2026-04-04
- [ ] 25-02-PLAN.md — Current sentence CEFR underlines (answer box word slots)
- [ ] 25-03-PLAN.md — Previous sentence CEFR color bands + wordbook success animation
- [ ] 25-04-PLAN.md — History list CEFR distribution badges
**UI hint**: yes

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 24. CEFR 基础设施与 i 水平设置 | 4/4 | Complete | 2026-04-03 |
| 25. CEFR 沉浸式展示与历史徽章 | 1/4 | In progress | - |

---

## Coverage

**v2.4 Requirements: 18 total**
**Mapped to phases: 18 / 18 ✓**
**Unmapped: 0**

---

## Milestone Context

**Previous milestone:** v2.3 (Phase 19–23) — 学习体验与导入流程优化, shipped 2026-04-03

**Next milestone:** TBD (after v2.4)

---
*Roadmap created: 2026-04-03*
