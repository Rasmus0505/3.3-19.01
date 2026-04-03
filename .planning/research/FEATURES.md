# Feature Research: CEFR Vocabulary Level Analysis and Display

**Domain:** English language learning app - vocabulary difficulty visualization
**Researched:** 2026-04-03
**Confidence:** MEDIUM-HIGH (existing codebase provides strong implementation context)

## Executive Summary

CEFR vocabulary level analysis is a well-established approach in language learning apps, grounded in Krashen's comprehensible input theory (i+1). The feature transforms passive subtitle consumption into active vocabulary learning by color-coding each word according to its difficulty relative to the user's declared CEFR level. The existing codebase already contains a 50,000-word CEFR vocabulary dataset derived from COCA frequency data, providing the foundation for batch preprocessing. Implementation focuses on four areas: vocabulary analysis pipeline, immersive color-coded display, interaction feedback for word selection, and user profile CEFR level configuration.

## Feature Landscape

### Table Stakes (Users Expect These)

Core infrastructure without which the feature feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| CEFR level lookup per word | Essential for any vocabulary difficulty feature | LOW | Existing cefr_vocab.json (50k words, COCA-based) provides foundation |
| User's i-level (input level) setting | Users need to declare their proficiency to receive calibrated input | LOW | Store in user profile, default B1 per PROJECT.md |
| Color-coded word display | Visual differentiation is the primary UX signal for vocabulary difficulty | MEDIUM | Green (i+1) and Yellow (above i+1) per v2.4 spec |
| Batch preprocessing at video open | All subtitle words analyzed once, cached for reuse | MEDIUM | localStorage caching, keyed by lesson ID |
| Previous sentence CEFR display | Learners need context from prior sentence while typing current | MEDIUM | Reuse existing previous-sentence UI component |

### Differentiators (Competitive Advantage)

Features that set this app apart from generic vocabulary tools.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Real-time i+1 calibration | Green/yellow feedback tells learners exactly which words are "learnable" vs. "too hard" right now | MEDIUM | Requires user-level setting and CEFR lookup per word |
| Scale animation on word selection | Smooth tactile feedback distinguishes passive viewing from active word-collecting | LOW | CSS scale transform (1.0 → 1.08), 200ms ease-out |
| Lesson-level CEFR badges in history | At-a-glance lesson difficulty helps learners choose appropriate content | LOW | Color block + CEFR label per lesson card |
| Sentence-level CEFR distribution | Shows proportion of A1/B1/B2/C1+ words in a lesson — helps set expectations | MEDIUM | Aggregate from preprocessed word levels |
| Word-level tapping for wordbook entry | Tap-to-collect from previous sentence with immediate visual feedback | LOW | Extend existing wordbook token UI with scale + color animation |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem valuable but create significant complexity or UX problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Server-side CEFR analysis on every request | Ensures always-up-to-date vocabulary data | Heavy server load for large subtitle files; adds latency per lesson | Preprocess client-side once, cache in localStorage, periodic background refresh |
| Dynamic CEFR reassessment based on user performance | Adapts to learning progress automatically | Statistical noise from small sample sizes; confusing when same video shows different colors each viewing | Keep user-declared CEFR level static; let user manually update when they feel progress |
| Per-word CEFR color in the CURRENT sentence while typing | Maximizes vocabulary feedback | Visual clutter competes with typing task; learner attention is split between letter-entry and color-scanning | Only color-code previous sentence; current sentence stays clean for typing focus |
| Automatic CEFR level detection via test | Removes friction from manual level setting | Self-assessment is notoriously inaccurate; short tests have high error margins | Provide Duolingo-style level descriptions to guide manual selection |
| Separate CEFR vocabulary database | Ensures coverage and accuracy | 50k COCA-derived wordlist already in codebase; adding another source creates inconsistency | Extend existing cefr_vocab.json rather than replacing it |

## Feature Dependencies

```
[CEFR Vocabulary Dataset (cefr_vocab.json)]
    └──provides──> [Vocabulary Analysis Pipeline]
                          └──requires──> [User CEFR Level Setting]
                                              └──drives──> [i+1 Color Calculation]
                                                                ├──produces──> [Immersive CEFR Display]
                                                                │                     └──uses──> [Previous Sentence Token UI]
                                                                │                     └──enhances──> [Scale Animation Feedback]
                                                                └──produces──> [Lesson CEFR Badge]
                                                                                      └──used in──> [History List]
```

### Dependency Notes

- **Vocabulary Analysis Pipeline requires User CEFR Level:** The i+1 color (green/yellow) depends on comparing word level against user level — no user level means no meaningful colors.
- **Previous Sentence Token UI is prerequisite for Scale Animation:** The wordbook token selection UI already exists at lines 3889-3914 in ImmersiveLessonPage.jsx — animation layers on top.
- **Immersive CEFR Display enhances Previous Sentence Token UI:** Color blocks and scale animation coexist on the same token component.
- **History List is independent:** Lesson CEFR badge computation can happen during lesson generation and does not depend on immersive learning phase.

## MVP Definition

### Launch With (v2.4)

Core loop validated before expanding scope.

- [ ] **Batch vocabulary preprocessing** — On video open, iterate all subtitle sentences, lookup each word in cefr_vocab.json, tag with CEFR level, cache result in localStorage keyed by lessonId. Unknown words default to "SUPER" level.
- [ ] **User CEFR level setting in Personal Center** — 6-level selector (A1-C2), default B1, Duolingo-style Chinese descriptions per level, persist to user profile/backend.
- [ ] **i+1 color calculation** — Given user level, compute each word's display color: green = word level is exactly one level above user level; yellow = word level is 2+ levels above user level; neutral = word level at or below user level.
- [ ] **Previous sentence CEFR display** — Show color blocks over words in the previous sentence based on computed i+1 color. Only affects previous sentence (not current typing sentence).
- [ ] **Scale animation on word selection** — When user taps a word in previous sentence to add to wordbook, apply CSS scale transform (1.0 → 1.08 → 1.0) over 200ms ease-out.

### Add After Validation (v2.4.x)

Features that enhance the core loop once it works.

- [ ] **Lesson-level CEFR distribution badge** — Show aggregate A1/B1/B2/C1+ percentages on lesson cards in history list.
- [ ] **Toggle switch for CEFR display** — Let users turn color blocks on/off in immersive learning settings.
- [ ] **localStorage cache invalidation** — Detect subtitle changes and recompute CEFR analysis; use content hash or version field.

### Future Consideration (v2.5+)

Features that require deeper integration or UX research.

- [ ] **Sentence-level CEFR breakdown tooltip** — Tap lesson card to see CEFR distribution chart.
- [ ] **Adaptive level suggestion** — After completing a lesson, suggest level adjustment based on word coverage percentage.
- [ ] **CEFR display in current sentence (post-answer reveal)** — After learner completes a sentence, show CEFR colors on that sentence as a "review" mode.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Batch vocabulary preprocessing | HIGH | MEDIUM | P1 |
| User CEFR level setting (Personal Center) | HIGH | LOW | P1 |
| i+1 color calculation | HIGH | LOW | P1 |
| Previous sentence CEFR color display | HIGH | MEDIUM | P1 |
| Scale animation on word selection | MEDIUM | LOW | P1 |
| Lesson CEFR badges in history list | MEDIUM | LOW | P2 |
| CEFR display toggle | LOW | LOW | P2 |
| Cache invalidation strategy | MEDIUM | MEDIUM | P2 |
| Sentence-level CEFR breakdown | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for v2.4 launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## CEFR Level Definitions (for UX Copy)

Based on the existing cefr_vocab.json meta descriptions and Duolingo-style Chinese descriptions:

| Level | Chinese Description (参考 Duolingo 风格) | User Expectation | Typical Learner |
|-------|------------------------------------------|-----------------|-----------------|
| **A1** | 零基础 — 最常用词汇，能进行简单日常对话 | Can understand "hello", "water", "the" | Complete beginner |
| **A2** | 入门 — 基础词汇，能表达基本需求和想法 | Can understand common words for shopping, directions | ~6 months study |
| **B1** | 中级 — 日常话题词汇，能处理工作、旅行等场景 | Can understand main points on familiar topics | ~1-2 years study |
| **B2** | 中高级 — 进阶词汇，能讨论抽象话题和专业技术 | Can interact with native speakers fluently | ~2-3 years study |
| **C1** | 高级 — 学术/专业词汇，能流畅表达复杂观点 | Can use language flexibly for social/academic purposes | Advanced learner |
| **C2** | 精通级 — 接近母语者水平，掌握几乎所有词汇 | Can understand virtually everything heard or read | Near-native |

## i+1 Color Coding System

Based on comprehensible input theory (Krashen) and InfinLume's color-coded mastery approach:

| Color | Meaning | When Applied | Example (User at B1) |
|-------|---------|-------------|---------------------|
| **Green** (#22c55e / oklch green) | i+1 — "learnable" word one level above current | Word CEFR = user CEFR + 1 level | B2 word for B1 user |
| **Yellow** (#eab308 / oklch yellow) | Above i+1 — "too hard" word 2+ levels above current | Word CEFR >= user CEFR + 2 levels | C1/C2 word for B1 user |
| **Neutral** (no highlight) | At or below current level — already known | Word CEFR <= user CEFR | A1/A2/B1 word for B1 user |

**Color application rules:**
- Only applied to **previous sentence** (not current typing sentence)
- Applied to **every word token** in the previous sentence
- Color rendered as a subtle background tint on the word token (not foreground text color)
- Super (unknown words, rank 20001+) treated as Yellow

## Competitor Feature Analysis

| Feature | LingQ | Migaku | FluentU | Our Approach |
|---------|-------|--------|---------|--------------|
| CEFR vocabulary lookup | Yes — large vocabulary database | Yes — frequency-based | Yes — level-tagged content | Use existing cefr_vocab.json (50k COCA-based) |
| i+1 color display | Word-level highlighting on reader | Color-coded cards by frequency | Color-coded phrases | Green/yellow on previous sentence tokens |
| User level setting | Manual placement in reader | Deck leveling system | Path placement | Personal Center selector, default B1 |
| Word selection animation | Tap to save, minimal animation | Highlight animation on save | Swipe gestures | Scale transform (1.08x) on tap |
| Lesson difficulty badges | Difficulty rating on lessons | SRS intervals | Mastery indicators | CEFR color block + level name on history cards |

## Implementation Complexity by Category

### CEFR Analysis

- **Vocabulary preprocessing pipeline:** MEDIUM — iterate subtitles, tokenize, lookup in 50k word map, cache to localStorage
- **i+1 color calculation:** LOW — simple level comparison: `wordLevel - userLevel` produces -2..+5 range
- **Unknown word handling:** LOW — words not in cefr_vocab.json default to "SUPER" (rank 20001+)
- **Cache management:** MEDIUM — key by lessonId, handle subtitle updates, localStorage quota

### Immersive Display

- **Color overlay on word tokens:** MEDIUM — CSS class toggling based on CEFR level, cinema mode compatibility
- **Previous sentence rendering:** LOW — existing component structure (lines 3875-3985 in ImmersiveLessonPage.jsx)
- **Cinema mode compatibility:** LOW — reuse existing `.immersive-previous-sentence--cinema` CSS class

### Interaction Feedback

- **Scale animation on selection:** LOW — CSS `transform: scale()`, 200ms ease-out, toggle via class
- **Wordbook token selection state:** LOW — existing `wordbookSelectedTokenIndexes` state already tracks selected tokens
- **Accessibility:** LOW — `aria-pressed` attribute already in use; add scale animation without removing

### Personal Center

- **CEFR level selector:** LOW — radio button group or segmented control with 6 levels
- **Chinese descriptions:** LOW — static content from cefr_vocab.json meta or Duolingo-style copy
- **Persistence:** MEDIUM — save to user profile (backend API or localStorage for MVP)

## Sources

- [Promova AI-driven vocabulary adaptation](https://goodereader.com/blog/digital-publishing/personalized-english-learning-how-promova-uses-ai-to-adapt-reading-and-vocabulary-training)
- [CEFR Word Level Methodology](https://cefrlookup.com/methodology)
- [CVLA: CEFR-based Vocabulary Level Analyzer](https://cvla.langedu.jp/ver2/)
- [InfinLume n+1 color-coded learning](https://www.infinlume.com/)
- [Duolingo CEFR Level Alignment](https://duolingoguides.com/duolingo-language-levels-test-scores-cefr-proficiency-scale/)
- [Lenguia Word Frequency Checker (color-coded CEFR)](https://www.lenguia.com/tools/word-frequency-checker)
- [Maximax67/Words-CEFR-Dataset](https://github.com/Maximax67/Words-CEFR-Dataset)
- Existing codebase: cefr_vocab.json (COCA-derived, 50k words), ImmersiveLessonPage.jsx, immersive.css

---

*Feature research for: CEFR vocabulary level analysis and display*
*Researched: 2026-04-03*
