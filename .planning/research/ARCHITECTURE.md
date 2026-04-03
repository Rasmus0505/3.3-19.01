# Architecture Research: CEFR Vocabulary Level Analysis Integration

**Domain:** Vocabulary level analysis with immersive learning display
**Project:** Bottle English Learning v2.4 — 词汇等级预处理与 CEFR 沉浸式展示
**Researched:** 2026-04-03
**Confidence:** HIGH

## Executive Summary

The v2.4 milestone adds CEFR vocabulary level analysis as a new data pipeline that layers on top of the existing immersive learning architecture. The analysis pipeline (video open → batch analyze → cache) is entirely new. The display pipeline (read cache → render color blocks) requires modifications to ImmersiveLessonPage token rendering. The settings pipeline (profile → user level → read during session) extends AccountPanel and learningSettings. The history pipeline (lesson list → CEFR badge) extends LessonList.

All pipelines use existing data flow patterns — localStorage for caching, React state for display, profile API for settings. No new architectural patterns are needed.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              CEFR VOCABULARY PIPELINE                              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐   │
│  │   ANALYSIS        │         │   DISPLAY        │         │   SETTINGS       │   │
│  │   PIPELINE        │         │   PIPELINE       │         │   PIPELINE       │   │
│  ├──────────────────┤         ├──────────────────┤         ├──────────────────┤   │
│  │ 1. Video opens    │         │ 1. Session start │         │ 1. User sets     │   │
│  │ 2. Check cache    │         │ 2. Read cached   │         │    CEFR level    │   │
│  │ 3. Batch analyze  │         │    analysis      │         │    in profile    │   │
│  │ 4. Store results  │         │ 3. Render token  │         │ 2. API call      │   │
│  │    in localStorage│         │    color blocks  │         │    PATCH profile │   │
│  └────────┬─────────┘         └────────┬─────────┘         └────────┬─────────┘   │
│           │                            │                            │              │
│           ▼                            ▼                            ▼              │
│  ┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐   │
│  │   localStorage   │◀───────▶│ ImmersiveLesson  │◀────────│   AccountPanel   │   │
│  │   cefr_analysis  │         │ Page.jsx         │         │   (Personal      │   │
│  │   _by_lessonId   │         │                  │         │    Center)       │   │
│  └──────────────────┘         └────────┬─────────┘         └──────────────────┘   │
│                                       │                                        │
│                                       ▼                                        │
│                              ┌──────────────────┐                              │
│                              │  HISTORY         │                              │
│                              │  PIPELINE        │                              │
│                              ├──────────────────┤                              │
│                              │ 1. Lesson loads  │                              │
│                              │ 2. Read cached   │                              │
│                              │    CEFR stats    │                              │
│                              │ 3. Display badge │                              │
│                              │    in list       │                              │
│                              └────────┬─────────┘                              │
│                                       │                                        │
│                              ┌────────▼─────────┐                              │
│                              │   LessonList    │                              │
│                              │   .jsx          │                              │
│                              └─────────────────┘                              │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### New Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `VocabAnalyzer` | `frontend/src/utils/vocabAnalyzer.js` | Core analysis engine (already exists) |
| `useVocabAnalysis` (NEW) | `frontend/src/features/immersive/hooks/` | Analysis lifecycle hook |
| `CEFRBadge` (NEW) | `frontend/src/shared/ui/` | Reusable CEFR level badge |
| `UserLevelSelector` (NEW) | `frontend/src/features/account/` | CEFR level picker in personal center |

### Modified Components

| Component | Current State | Modifications Required |
|-----------|--------------|------------------------|
| `ImmersiveLessonPage.jsx` | 3500+ line monolithic component | Add CEFR color overlay on token rendering; hook into lesson load lifecycle |
| `AccountPanel.jsx` | User profile management | Add CEFR level selector section |
| `LessonList.jsx` | History display | Add CEFR badge on lesson cards |
| `learningSettings.js` | localStorage-backed settings | Optionally extend for CEFR level persistence |

### Data Files

| File | Purpose | Size Consideration |
|------|---------|-------------------|
| `app/data/vocab/cefr_vocab.json` | 50K word CEFR lookup table | ~8MB JSON, loads into `sessionStorage` on first use |

## Integration Points

### 1. Analysis Pipeline Integration

**Trigger:** Video/media opens in ImmersiveLessonPage

**Flow:**
```
ImmersiveLessonPage loads lesson
         │
         ▼
┌─────────────────────────────────┐
│ useVocabAnalysis hook           │
│ (NEW component)                 │
├─────────────────────────────────┤
│ 1. Check localStorage key:      │
│    `cefr_analysis_${lessonId}`  │
│                                 │
│ 2. If cached:                   │
│    → Return cached analysis     │
│                                 │
│ 3. If not cached:               │
│    → Load cefr_vocab.json       │
│    → Call vocabAnalyzer.analyzeVideo() │
│    → Store in localStorage      │
│    → Return fresh analysis      │
└─────────────────────────────────┘
```

**Integration with existing ImmersiveLessonPage:**
- Add `useEffect` on `lesson.id` change
- Use `useCallback` for memoized analysis access
- Store analysis in component `useState` or `useRef`

**localStorage key pattern:**
```javascript
const CACHE_KEY_PREFIX = "cefr_analysis_";
const getAnalysisCacheKey = (lessonId) => `${CACHE_KEY_PREFIX}${lessonId}`;
```

**Cache structure:**
```javascript
{
  lessonId: string,
  analyzedAt: ISO timestamp,
  overallGrade: "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
  avgRank: number,
  totalWords: number,
  levelCounts: { A1: number, A2: number, ... },
  sentences: [
    {
      sentenceIndex: number,
      original: string,
      tokens: [{ word: string, level: string, rank: number }],
      grade: string,
    }
  ]
}
```

### 2. Display Pipeline Integration

**Location:** `ImmersiveLessonPage.jsx` token rendering (around line 3849-3871)

**Current token rendering:**
```jsx
{expectedTokens.map((token, index) => {
  const status = wordStatuses[index] || "pending";
  const slots = buildLetterSlots(token, wordInputs[index] || "", wordRevealComparableIndices[index] || []);
  return (
    <div key={`${token}-${index}`} className={`immersive-word-slot immersive-word-slot--${status}`}>
      {/* slots rendering */}
    </div>
  );
})}
```

**Modified approach:**
```jsx
{expectedTokens.map((token, index) => {
  const status = wordStatuses[index] || "pending";
  const slots = buildLetterSlots(token, wordInputs[index] || "", wordRevealComparableIndices[index] || []);
  const cefrLevel = currentSentenceAnalysis?.tokens[index]?.level;
  const isAboveUserLevel = isWordAboveUserLevel(cefrLevel, userLevel);

  return (
    <div
      key={`${token}-${index}`}
      className={`immersive-word-slot immersive-word-slot--${status} ${getCEFRClassName(cefrLevel, isAboveUserLevel)}`}
    >
      {/* existing slots rendering */}
    </div>
  );
})}
```

**CSS classes for CEFR coloring:**
```css
/* Word-level CEFR coloring */
.cefr-level-a1 { border-bottom: 3px solid #10b981; }   /* emerald */
.cefr-level-a2 { border-bottom: 3px solid #22c55e; }   /* green */
.cefr-level-b1 { border-bottom: 3px solid #f59e0b; }   /* amber */
.cefr-level-b2 { border-bottom: 3px solid #f97316; }   /* orange */
.cefr-level-c1 { border-bottom: 3px solid #ef4444; }   /* red */
.cefr-level-c2 { border-bottom: 3px solid #dc2626; }   /* dark red */

/* Above user level (i+1) highlight */
.cefr-above-user-level {
  background-color: rgba(250, 204, 21, 0.15);  /* yellow highlight */
  font-weight: 600;
}

/* Within user level */
.cefr-within-level {
  background-color: rgba(34, 197, 94, 0.1);   /* green tint */
}
```

### 3. Settings Pipeline Integration

**Profile API endpoint:** `/api/auth/profile` (PATCH)

**Current AccountPanel structure:**
```jsx
<Card>
  <CardHeader>
    <CardTitle>个人中心</CardTitle>
  </CardHeader>
  <CardContent>
    {/* username form */}
    {/* redeem code */}
  </CardContent>
</Card>
```

**New CEFR level section:**
```jsx
<Card>
  <CardHeader>
    <CardTitle>个人中心</CardTitle>
  </CardHeader>
  <CardContent>
    {/* existing username form */}
    {/* existing redeem code */}

    {/* NEW CEFR Level Section */}
    <div className="space-y-2">
      <label className="text-sm font-medium">英语水平</label>
      <div className="flex flex-wrap gap-2">
        {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
          <Button
            key={level}
            variant={userLevel === level ? "default" : "outline"}
            onClick={() => updateUserLevel(level)}
          >
            {level}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {getLevelDescription(userLevel)}
      </p>
    </div>
  </CardContent>
</Card>
```

**Backend model change (if needed):**
- Add `cefr_level` column to user/profile model
- Extend PATCH `/api/auth/profile` to accept `cefr_level`

**Reading user level during session:**
```javascript
// In ImmersiveLessonPage
const userLevel = currentUser?.cefr_level || "B1"; // Default B1
```

### 4. History Pipeline Integration

**Location:** `LessonList.jsx` lesson card rendering

**Current lesson card structure (simplified):**
```jsx
<Card className="lesson-card">
  <MediaCover src={lesson.cover_data_url} />
  <CardContent>
    <h3>{lesson.title}</h3>
    <p>{lesson.sentence_count} sentences</p>
  </CardContent>
</Card>
```

**Modified with CEFR badge:**
```jsx
<Card className="lesson-card">
  <MediaCover src={lesson.cover_data_url} />
  <CardContent>
    <div className="flex items-center gap-2">
      <h3>{lesson.title}</h3>
      {lesson.cefr_grade && (
        <CEFRBadge level={lesson.cefr_grade} />
      )}
    </div>
    <p>{lesson.sentence_count} sentences</p>
    {lesson.cefr_stats && (
      <div className="cefr-stats-bar">
        <LevelBar counts={lesson.cefr_stats.levelCounts} />
      </div>
    )}
  </CardContent>
</Card>
```

**Lesson CEFR data source:**
- Option A: Store CEFR analysis in lesson record on backend
- Option B: Read from localStorage on frontend when displaying history

**Recommendation:** Option B (frontend localStorage) for v2.4 — avoids backend migration. Lesson list reads from same localStorage cache used by analysis pipeline.

## Data Flow Diagrams

### Analysis Pipeline Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│ Video Opens │────▶│ Check        │────▶│ Cache exists?   │────▶│ Return       │
│             │     │ localStorage │     │                 │     │ cached       │
└─────────────┘     └──────────────┘     └────────┬────────┘     └──────────────┘
                                                 │
                                                 │ No
                                                 ▼
                                        ┌─────────────────┐
                                        │ Load cefr_vocab │
                                        │ .json           │
                                        └────────┬────────┘
                                                 │
                                                 ▼
                                        ┌─────────────────┐
                                        │ vocabAnalyzer   │
                                        │ .analyzeVideo() │
                                        └────────┬────────┘
                                                 │
                                                 ▼
                                        ┌─────────────────┐     ┌──────────────┐
                                        │ Store results   │────▶│ Return fresh │
                                        │ in localStorage │     │ analysis     │
                                        └─────────────────┘     └──────────────┘
```

### Display Pipeline Flow

```
┌──────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│ Session starts   │────▶│ Read user level │────▶│ Read cached      │
│                  │     │ from profile    │     │ analysis         │
└──────────────────┘     └─────────────────┘     └────────┬─────────┘
                                                           │
                                                           ▼
                                                  ┌──────────────────┐
                                                  │ For each token:  │
                                                  │ - Get CEFR level │
                                                  │ - Compare to     │
                                                  │   user level     │
                                                  └────────┬─────────┘
                                                           │
                                                           ▼
                                                  ┌──────────────────┐
                                                  │ Render with      │
                                                  │ CEFR color class │
                                                  └──────────────────┘
```

### Settings Pipeline Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│ User opens  │────▶│ Show CEFR    │────▶│ User selects    │────▶│ API call     │
│ Personal    │     │ level picker │     │ level          │     │ PATCH profile│
│ Center      │     │              │     │                │     │              │
└─────────────┘     └──────────────┘     └─────────────────┘     └──────┬───────┘
                                                                       │
                                                                       ▼
                                                              ┌─────────────────┐
                                                              │ Update local    │
                                                              │ user state      │
                                                              └─────────────────┘
```

## State Management

### ImmersiveLessonPage State Extensions

**New local state:**
```javascript
const [cefrAnalysis, setCefrAnalysis] = useState(null);      // Full video analysis
const [cefrAnalysisLoading, setCefrAnalysisLoading] = useState(false);
const [cefrError, setCefrError] = useState(null);
```

**Derived values:**
```javascript
const currentSentenceAnalysis = useMemo(() => {
  if (!cefrAnalysis?.sentences) return null;
  return cefrAnalysis.sentences[currentSentenceIndex];
}, [cefrAnalysis, currentSentenceIndex]);

const userLevel = currentUser?.cefr_level || "B1";  // Read from auth state
```

### Session Machine Considerations

The `immersiveSessionMachine.js` reducer should NOT be modified for CEFR features. CEFR is display-only data that doesn't affect session state transitions. It reads from existing session state (`currentSentenceIndex`) and lesson data.

**Design decision:** CEFR state lives in React component state, not in the session reducer. This keeps the session machine focused on playback/typing state while CEFR is an overlay concern.

## Suggested Build Order

Given dependencies between features, implement in this order:

### Phase 1: Core Analysis Infrastructure
1. **Create `useVocabAnalysis` hook** — encapsulates analysis lifecycle
2. **Integrate with ImmersiveLessonPage** — load analysis on lesson change
3. **Add CEFR token lookup** — derive level from analysis for current sentence
4. **Add basic CSS classes** — color blocks without disrupting existing styling

**Rationale:** This is the foundation. All other features depend on having CEFR data available.

### Phase 2: Display Enhancement
5. **Add CEFR color overlay** — apply color classes based on level vs user level
6. **Polish CSS** — ensure colors don't conflict with existing word slot states
7. **Test token interaction** — ensure CEFR colors don't break typing feedback

**Rationale:** Display builds on analysis data. Needs to work with existing typing interaction.

### Phase 3: Settings Integration
8. **Extend AccountPanel** — add CEFR level selector
9. **Backend API change** — add `cefr_level` to profile (if not already present)
10. **Wire up user level reading** — pass user level into immersive session

**Rationale:** Settings provides the user level input. Display reads from it.

### Phase 4: History Display
11. **Add CEFRBadge component** — reusable badge UI
12. **Extend LessonList** — show CEFR badge on lesson cards
13. **Read from localStorage** — leverage existing analysis cache

**Rationale:** History is downstream from analysis. Can read from same cache.

### Phase 5: Polish
14. **Animation polish** — smooth scale animation on wordbook selection (separate requirement)
15. **Performance optimization** — batch analysis if needed, lazy loading
16. **Error handling** — graceful degradation if vocab file fails to load

## Anti-Patterns to Avoid

### Anti-Pattern 1: Blocking Analysis on Load

**What people do:** Load CEFR analysis synchronously during lesson load, blocking UI.
**Why it's wrong:** Large vocab file + analysis = visible lag on lesson entry.
**Do this instead:** Load asynchronously, show "Analyzing..." briefly, cache for next visit.

### Anti-Pattern 2: Duplicating CEFR State

**What people do:** Store CEFR analysis in both Redux/ Zustand AND localStorage.
**Why it's wrong:** Sync complexity, stale data, memory waste.
**Do this instead:** localStorage is the source of truth for cached analysis. React state is derived copy.

### Anti-Pattern 3: Modifying Session Reducer

**What people do:** Add CEFR-related state to the immersive session reducer.
**Why it's wrong:** Violates single responsibility. Session reducer handles playback/typing flow.
**Do this instead:** Keep CEFR in component state as display-only overlay data.

### Anti-Pattern 4: Inverting Analysis/Lesson Load Order

**What people do:** Wait for analysis before showing lesson.
**Why it's wrong:** Analysis takes time. User should see lesson immediately.
**Do this instead:** Show lesson UI immediately, analyze in background, update colors when ready.

## Scaling Considerations

| Scale | Concern | Mitigation |
|-------|---------|------------|
| 0-100 lessons | localStorage adequate | No changes needed |
| 100-1000 lessons | localStorage quota | Prune old analysis on analysis count threshold |
| 1000+ lessons | Large vocab file | Consider IndexedDB, or server-side analysis |

**Current approach is appropriate for v2.4 scope.** Recommend revisiting at v2.5 if project scales significantly.

## Sources

- Existing codebase: `ImmersiveLessonPage.jsx`, `learningSettings.js`, `immersiveSessionMachine.js`
- Vocabulary data: `app/data/vocab/cefr_vocab.json` (COCA via vocabulary-list-statistics)
- Analysis engine: `app/frontend/src/utils/vocabAnalyzer.js`
- Project context: `.planning/PROJECT.md` v2.4 milestone definition

---

*Architecture research for: CEFR vocabulary level analysis integration*
*Researched: 2026-04-03*
