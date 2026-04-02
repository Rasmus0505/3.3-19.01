# Architecture Research

**Domain:** Import flow UX + video content extraction integration
**Researched:** 2026-04-02
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React/Vite)                        │
├─────────────────────────────────────────────────────────────────────────┤
│  UploadPanel.jsx                                                        │
│  ┌─────────────────┐    ┌──────────────────────┐                       │
│  │ Link/File Tabs │───▶│ Generation Config   │                       │
│  │ (default: link)│    │ Modal (NEW)          │                       │
│  └─────────────────┘    │  • Function toggles │                       │
│                         │  • Mode: lesson vs   │                       │
│                         │    video extraction  │                       │
│                         └──────────┬───────────┘                       │
│                                    │                                    │
├────────────────────────────────────┼────────────────────────────────────┤
│                                    ▼                                    │
│                         ┌──────────────────┐                           │
│                         │ Backend API      │                           │
│                         │ /api/lessons/*   │                           │
│                         └────────┬─────────┘                           │
└──────────────────────────────────┼──────────────────────────────────────┘
                                   │
┌──────────────────────────────────┼──────────────────────────────────────┐
│                           BACKEND (FastAPI)                            │
├──────────────────────────────────┼──────────────────────────────────────┤
│  ┌──────────────────┐  ┌────────┴─────────┐  ┌───────────────────┐   │
│  │ LessonService     │  │ LessonCommandService│  │ TranscribeRouter  │   │
│  │ • lesson CRUD     │  │ • create_lesson_*   │  │ • ASR pipeline    │   │
│  │ • lesson_type     │◀─│   tasks            │  │ • fast/balanced   │   │
│  └──────────────────┘  └───────────────────┘  └───────────────────┘   │
│           │                         ▲                                   │
│           ▼                         │                                   │
│  ┌──────────────────┐  ┌────────────┴───────────┐                      │
│  │ Lesson Model      │  │ LessonGenerationTask   │                      │
│  │ • lesson_type     │  │ Model (NEW FIELD)      │                      │
│  │   (standard/      │  │ • extraction_mode     │                      │
│  │    video_extract) │  │   "lesson"|"video"    │                      │
│  └──────────────────┘  └────────────────────────┘                      │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Integration |
|-----------|----------------|-------------|
| `UploadPanel.jsx` | Upload flow orchestration, tab switching, modal trigger | Parent: learning shell; Children: GenerationConfigModal |
| `GenerationConfigModal` (NEW) | Function toggles, generation mode selection, submits to backend | Props: `isOpen`, `onSubmit`, `onCancel`; State: mode, toggles |
| `LessonService` | Lesson CRUD, query with lesson_type filter | Called by lessons router |
| `LessonCommandService` | Task creation, extraction_mode parameter | Adds `extraction_mode` to task |
| `Lesson Model` | Database entity with `lesson_type` column (NEW) | Existing model, add field |
| `ImmersiveLessonPage.jsx` | Immersive learning UI, reducer state machine | Answer box color from session state |
| `WordbookPanel.jsx` | Wordbook list/review, translation display, pronunciation | Existing - add pronunciation button |

## Generation Modal Architecture

### Modal Flow

```
User clicks "Import and Generate"
         │
         ▼
┌─────────────────────────┐
│ GenerationConfigModal    │
│ ┌─────────────────────┐ │
│ │ Function Toggles     │ │
│ │ □ Full lesson        │ │
│ │ □ Video extraction   │ │
│ │ □ Word collection    │ │
│ ├─────────────────────┤ │
│ │ Generation Mode      │ │
│ │ ○ Fast (video only)  │ │
│ │ ● Balanced (full)    │ │
│ └─────────────────────┘ │
│ [Cancel] [Confirm]       │
└─────────────────────────┘
         │
         │ onSubmit({ mode, toggles })
         ▼
┌─────────────────────────────────┐
│ Backend: /api/lessons/*         │
│ Body: { extraction_mode, ... }  │
└─────────────────────────────────┘
```

### API Integration

**Option: Extend existing endpoint**

The current `/api/lessons/tasks` (in `app/api/routers/lessons.py`) accepts:
- `source_file`: UploadFile
- `title`: str
- `asr_model`: str
- `semantic_split_enabled`: bool

**Recommended addition:**
```python
# In LessonTaskCreateRequest (app/schemas/lesson.py)
extraction_mode: Literal["lesson", "video_extract"] = "lesson"
function_toggles: dict[str, bool] = {}
```

**Backend flow:**
```
POST /api/lessons/tasks
  → LessonCommandService.create_lesson_task_from_*(...)
    → extraction_mode passed to task metadata
    → Different pipeline branches based on mode:
        "lesson" → Full ASR → sentences → translations
        "video_extract" → Light extraction → metadata only
```

## Video Content Extraction Architecture

### Extraction Pipeline

**Current pipeline (lesson generation):**
```
Upload → ASR (faster-whisper/dashscope) → Transcript → Sentences → Translations → Lesson
```

**Video extraction mode (lighter):**
```
Upload → yt-dlp metadata → Thumbnail + metadata → History record (no ASR)
```

| Mode | Pipeline | Cost | Output |
|------|----------|------|--------|
| `lesson` (balanced) | Full ASR → sentences → translations | High | Lesson with sentences |
| `video_extract` (fast) | yt-dlp → metadata only | Low | History record |

**Implementation approach:**
- Use existing desktop yt-dlp integration from Phase 07.1
- New backend endpoint: `POST /api/lessons/video-extract`
- Returns: `{ record_id, thumbnail_url, metadata }`
- No ASR/translation cost for video extraction mode

### History Record Schema

**Option: Add `lesson_type` column to Lesson model**

```python
# app/models/lesson.py - add to Lesson class
lesson_type: Mapped[str] = mapped_column(
    String(32), 
    default="standard", 
    nullable=False,
    index=True
)
```

| lesson_type | Meaning | Used for |
|-------------|---------|----------|
| `standard` | Full lesson with sentences | Regular learning |
| `video_extract` | Video metadata only | Link import, no ASR |

**Migration needed:**
- Add column with default `standard` for existing lessons
- Frontend filters history by `lesson_type` in API calls

## Wordbook Enhancement Architecture

### Translation Display

**Current implementation (WordbookPanel.jsx lines 554-556):**
```jsx
{item.word_translation ? (
  <p className="text-sm font-medium text-foreground">单词翻译：{item.word_translation}</p>
) : null}
```

**Enhancement: Add pronunciation playback**

The wordbook entry already has `word_translation` field (lesson.py line 132). Need to add pronunciation audio URL or use TTS.

**Architecture for pronunciation:**
```jsx
// In wordbook card:
<Button 
  onClick={() => playPronunciation(item.entry_text)}
  disabled={!item.pronunciation_url}
>
  <Volume2 className="size-4" />
</Button>
```

**Pronunciation sources (priority order):**
1. Existing audio URL from wordbook entry (if available)
2. Backend TTS generation: `GET /api/wordbook/{id}/pronunciation`
3. Browser Web Speech API fallback

**Backend endpoint (new):**
```python
@router.get("/api/wordbook/{entry_id}/pronunciation")
async def get_word_pronunciation(entry_id: int, user = Depends(...)):
    # Generate TTS or return cached URL
    # Return: { audio_url: str }
```

### Pronunciation Playback

**Frontend flow:**
```javascript
async function playPronunciation(text) {
  // Option 1: Fetch TTS URL from backend
  const { audio_url } = await apiCall(`/api/wordbook/${id}/pronunciation`);
  const audio = new Audio(audio_url);
  await audio.play();
  
  // Option 2: Browser TTS fallback
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  speechSynthesis.speak(utterance);
}
```

## Immersive Answer Box Architecture

### Color Coding

**Phase 8 validated decision (PROJECT.md):**
- Yellow: AI/hint content
- Green: User-typed content

**Implementation: React state approach**

```javascript
// In ImmersiveLessonPage.jsx - extend session state
const [answerBoxMode, setAnswerBoxMode] = useState('hint'); // 'hint' | 'user'

// Session reducer handles transitions:
// USER_TYPING → setAnswerBoxMode('user')
// HINT_DISPLAY → setAnswerBoxMode('hint')
```

**CSS classes based on state:**
```jsx
<div className={cn(
  "rounded-lg p-3 border",
  answerBoxMode === 'hint' 
    ? "bg-yellow-50 border-yellow-200" 
    : "bg-emerald-50 border-emerald-200"
)}>
```

**State transitions:**
```
[Initial state] ──▶ [Hint displayed] ──▶ [User starts typing] ──▶ [Answer submitted]
                      (yellow)              (green)                 (reset)
```

## Integration Points

| Boundary | Integration | Notes |
|----------|-------------|-------|
| UploadPanel → GenerationConfigModal | Props: `onSubmit(config)`, `isOpen` | Modal appears after file/link selected, before submit |
| GenerationConfigModal → Backend | `POST /api/lessons/tasks` with `extraction_mode` | Existing endpoint extended |
| Backend → Lesson model | `lesson_type` column added | Migration for existing data |
| LessonService → Frontend | Filter by `lesson_type` in history API | `GET /api/lessons?lesson_type=video_extract` |
| WordbookPanel → Backend | `GET /api/wordbook/{id}/pronunciation` | New endpoint for TTS |
| ImmersiveLessonPage → ImmersiveSessionMachine | `answerBoxMode` in local state | Driven by reducer actions |

## Build Order

1. **Wordbook pronunciation (Phase 17.x)** — Independent, lowest risk, validates backend TTS integration
   - Add backend `/api/wordbook/{id}/pronunciation` endpoint
   - Add frontend pronunciation button in WordbookPanel
   - Test with existing word_translation field

2. **Lesson type field + video extraction endpoint** — Database migration first
   - Add `lesson_type` column to Lesson model
   - Create `POST /api/lessons/video-extract` endpoint
   - Test history filtering by lesson_type

3. **GenerationConfigModal** — New component, minimal risk
   - Create modal component with function toggles + mode selection
   - Integrate into UploadPanel flow
   - Wire to existing submit logic with new params

4. **Immersive answer box color coding** — Small change, high visibility
   - Add `answerBoxMode` state in ImmersiveLessonPage
   - Map reducer actions to color transitions
   - Test state transitions don't break existing flow

5. **History record type differentiation** — Depends on step 2
   - Update lesson list to show type badges
   - Filter by type in API calls

## Sources

- `frontend/src/features/upload/UploadPanel.jsx` — Current upload flow with generation_mode
- `frontend/src/features/wordbook/WordbookPanel.jsx` — Existing wordbook implementation
- `frontend/src/features/immersive/ImmersiveLessonPage.jsx` — Immersive reducer machine
- `app/models/lesson.py` — Lesson and WordbookEntry models
- `app/api/routers/lessons.py` — Lesson task endpoints
- `app/services/lesson_command_service.py` — Task creation service
- `.planning/PROJECT.md` — v2.3 milestone requirements
- `.planning/milestones/v2.1-ROADMAP.md` — Phase 07.1 (Memo mode/link import)
- `.planning/milestones/v2.1-ROADMAP.md` — Phase 8 (Immersive state machine)

---
*Architecture research for: Import flow UX + video content extraction*
*Researched: 2026-04-02*
