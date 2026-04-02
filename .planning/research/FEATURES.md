# Feature Research

**Domain:** Import flow UX + video content extraction for English learning
**Researched:** 2026-04-02
**Confidence:** MEDIUM

> Research based on analysis of LingQ, Migaku, FluentU, YouTube transcript tools (YouTube Text Tools, YouTranscript, YouTubeTranscript.dev), Anki, WordByWord, WordWise, and related language learning apps. Web-search-derived findings noted as MEDIUM confidence where not verifiable via official docs.

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Translation toggle in generation config | Users want control over whether translation is included — some want pure immersion, others need scaffold | LOW | LingQ exposes level selection; similar control expected here |
| Generation mode selector (lesson vs transcript) | Users already mentally separate "learning content" from "raw transcript" — differentiating in UI matches mental model | LOW | YouTube transcript tools (YouTube Text Tools, YouTubeTranscript.dev) show paragraph/sentence modes — similar expectation |
| Clear history differentiation by record type | Users accumulate both generated lessons and raw transcripts over time — confusion without distinction | MEDIUM | LingQ distinguishes library content from imports; same expectation applies |
| Word-level translation display | Users need to verify word meaning independently of sentence context | LOW | WordByWord, WordPlus show translations directly adjacent to words; standard expectation |
| Pronunciation playback for vocabulary | Audio reinforcement is fundamental to vocabulary acquisition | LOW | Anki TTS, dictionary apps (Dictionary.com) all have speaker button — baseline feature |
| Answer input color differentiation | Visual feedback helps learners understand what they typed vs. what was suggested | LOW | Established pattern; PROJECT.md already specifies yellow=AI/hint, green=user |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Video content extraction as separate record type | Transforms raw video content into studyable transcript while preserving the lesson for active learning — competitors like YouTube transcript tools are read-only | MEDIUM | Requires backend model to distinguish "video extraction" from "lesson generation" |
| Auto-fill title from video metadata | Reduces friction — users shouldn't manually name what the platform can detect | LOW | yt-dlp provides title extraction; already exists in desktop link import |
| Paragraph segmentation mode for transcripts | Paragraphs are easier to read and navigate than raw sentence dumps — Whisper alone produces poor paragraph structure | MEDIUM | LLM-based re-segmentation recommended (pyvideotrans approach); paragraph chunking from caption segments |
| Sentence segmentation mode for transcripts | Some users prefer granular sentence-by-sentence study | LOW | Toggle between modes serves both preferences |
| Word pronunciation speed control | Helps learners with difficult sounds — "slow down pronunciation audio" noted as advanced feature in dictionary apps | LOW | Reuse existing speed control from immersive learning |
| Configuration modal with grouped toggles | Clean organization of generation options reduces cognitive load — toggle switches are best for binary settings | LOW | Group by function (content, display, behavior) |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Server-side heavy media processing | Users want "instant" results without local setup | Conflicts with server capacity limits; ASR workloads are expensive | Desktop-local processing remains primary; server fallback with clear messaging |
| Automatic vocabulary extraction without review | Saves time — users don't want to curate manually | Low-quality extraction floods wordbook with noise | Semi-automatic: extract with one-tap "add to wordbook" confirmation |
| Full transcript as single monolithic record | Simple to implement — one export, one record | Hard to navigate, hard to learn from, no sentence-level interaction | Chunked transcript with paragraph/sentence navigation |
| Multiple simultaneous generation modes | "More is better" — users want all features available | Interface complexity; modal becomes overwhelming | Sequential: pick mode first, then configure that mode's options |

---

## Feature Dependencies

```
Import Source Selection (Link Tab default)
    │
    ├──► Video Metadata Extraction (title auto-fill)
    │        │
    │        └──► Generation Configuration Modal
    │                 │
    │                 ├──► Function Toggles (translate, etc.)
    │                 │        │
    │                 │        └──► Wordbook with translations (Phase 17 foundation)
    │                 │
    │                 └──► Generation Mode Selection
    │                          │
    │                          ├──► English Materials Mode
    │                          │        │
    │                          │        └──► History Record: "Lesson"
    │                          │
    │                          └──► Video Content Extraction Mode
    │                                   │
    │                                   └──► History Record: "Transcript"
    │                                            │
    │                                            └──► Paragraph/Sentence Segmentation
    │
    └──► History List (differentiated records)
             │
             ├──► Lesson Records → Immersive Learning
             │                           │
             │                           └──► Answer Box (yellow=AI, green=user)
             │
             └──► Transcript Records → Basic Reading Mode
```

### Dependency Notes

- **Generation modal** requires **link import** (Phase 4 foundation): modal triggers after source selection
- **Word-level translation display** builds on Phase 17 wordbook structure: word entries already exist with translation field
- **Pronunciation playback** builds on existing TTS infrastructure from immersive learning speed control
- **Video content extraction** is a new record type that requires backend differentiation from "lesson" records
- **Answer box coloring** was validated in v2.3 PROJECT.md: yellow for AI/hint, green for user-typed — already specified

---

## MVP Definition

### Launch With (v1)

- [ ] **Generation config modal with toggle switches** — grouped by function (content options, display options), immediate feedback, smart defaults. Toggle switches for binary settings per settings UI best practices.
- [ ] **Translation toggle** — yes/no for including translation in generated content. Default: ON for beginners, OFF for intermediate+.
- [ ] **Generation mode selector** — "English Materials" vs "Video Content Extraction" as two distinct paths in the modal.
- [ ] **Video content extraction mode** — paragraph segmentation by default, sentence mode as toggle. Store as separate record type.
- [ ] **Auto-fill title** — pull from yt-dlp metadata when extracting from link. Fallback to manual entry.
- [ ] **History differentiation** — visual distinction between Lesson records and Transcript records (icon, badge, or label).
- [ ] **Word-level translation display** — show translation above each word entry in wordbook panel. Speaker icon for pronunciation playback.
- [ ] **Answer box coloring** — yellow (#FEF3C7 or similar) for AI/hint content, green (#D1FAE5 or similar) for user-typed. Per validated decision in PROJECT.md.

### Add After Validation (v1.x)

- [ ] **Sentence segmentation mode** — toggle within video content extraction mode for users who prefer granular sentence study.
- [ ] **Word pronunciation speed control** — reuse immersive learning speed slider in wordbook playback.
- [ ] **Language level selector** — Beginner/Intermediate/Advanced assignment (LingQ pattern) for content filtering.
- [ ] **Tags for records** — manual tagging for organization across record types.
- [ ] **LLM-based paragraph re-segmentation** — if Whisper output quality is insufficient, apply re-segmentation step for better paragraph boundaries.

---

## Generation Modal Options

### Recommended Organization

**Group by function, not by source:**

```
┌─────────────────────────────────────────────────────────┐
│  Import Configuration                                   │
├─────────────────────────────────────────────────────────┤
│  GENERATION MODE                                        │
│  ○ English Materials (structured lesson)               │
│  ○ Video Content Extraction (raw transcript)           │
├─────────────────────────────────────────────────────────┤
│  CONTENT OPTIONS                                        │
│  [Toggle] Include translations                          │
│  [Toggle] Extract vocabulary automatically              │
├─────────────────────────────────────────────────────────┤
│  DISPLAY OPTIONS (Video Extraction only)                │
│  Segmentation: [Paragraph ▼]                            │
│  [Toggle] Show timestamps                               │
├─────────────────────────────────────────────────────────┤
│  Title: [Auto-filled from video...        ]             │
│                                                         │
│  [Cancel]                    [Import & Generate]         │
└─────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Mode first, options second** — Users pick what they're doing before configuring how
2. **Conditional options** — Display Options section only shows when "Video Extraction" is selected
3. **Toggle switches for binary** — Per Microsoft/Apple settings guidelines, toggles for on/off settings
4. **Smart defaults** — Translation ON by default; Paragraph segmentation ON by default
5. **Immediate feedback** — Toggle changes apply instantly, no "Apply" button needed within modal

### Sources

- LingQ import options (title, level, tags, audio) — [LingQ Blog](https://www.lingq.com/blog/complete-guide-importing-lingq/)
- Settings UI best practices: grouped sections, toggle switches, immediate feedback — [LogRocket](https://blog.logrocket.com/ux-design/designing-settings-screen-ui/), [Toptal](https://www.toptal.com/designers/ux/settings-ux), [Microsoft](https://learn.microsoft.com/en-us/windows/apps/design/app-settings/guidelines-for-app-settings)
- Toggle switch anatomy and behavior — [SetProduct](https://www.setproduct.com/blog/toggle-switch-ui-design)

---

## History Record Differentiation

### Recommended Approach

**Two primary record types with distinct visual treatment:**

| Record Type | Icon | Badge Color | Entry Point | Actions |
|-------------|------|-------------|-------------|---------|
| Lesson (English Materials) | Book/Document | Blue/Primary | Immersive Learning, Practice | Review, Learn, Practice |
| Transcript (Video Extraction) | Play/Transcript | Amber/Secondary | Basic Reading | Read, Extract Words |

### Visual Treatment

**List item card design:**

```
┌────────────────────────────────────────────────────┐
│ [📖]  Lesson Title Here                    [▶ 12m] │
│       Lesson • B1 • 48 sentences                   │
│       [Immersive Learning] [Practice]    [3d ago]  │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ [▶]  Video Title Extraction                [▶ 24m] │
│       Transcript • 156 paragraphs                 │
│       [Read] [Extract Words]            [1h ago]   │
└────────────────────────────────────────────────────┘
```

### Sources

- LingQ library vs import distinction — [LingQ Blog](https://www.lingq.com/blog/importing-on-lingq/)
- Language level organization (Beginner 1-2, Intermediate 1-2, Advanced 1-2) — [LingQ Help](https://www.lingq.com/en/help/)
- Record type visual badges — standard app pattern for differentiating content types

---

## Word-Level Translation Display

### Recommended Placement and Styling

**Above each word entry in wordbook panel:**

```
┌────────────────────────────────────────────────────────┐
│  translation here (translation appears first)          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  WORD                                    [🔊] [⋮]     │
│  /wɜːrd/                                                  │
│  ─────────────────────────────────────────────────────  │
│  Example sentence with the word in context              │
└────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Translation first** — Primary meaning visible without interaction
2. **Pronunciation icon** — Speaker icon in accessible position (lower right per Dictionary.com pattern)
3. **Tap to play** — Single tap triggers audio; icon visible only when audio available
4. **IPA phonetic** — Optional secondary display for advanced learners

### Sources

- WordByWord: translations above words, double-tap lookup — [WordByWord](https://www.word-by-word.app/)
- WordPlus: translations with synonyms, antonyms, examples — [WordPlus](https://site.wordplus.app/)
- Speaker button placement: lower right of word entry — [Dictionary.com](https://help.dictionary.com/article/315-how-do-i-hear-audio-pronunciations-in-android/)
- Audio TTS playback: configurable shortcuts (Anki F3/F4 pattern) — [Anki Manual](https://docs.ankiweb.net/templates/styling.html?highlight=Audio)

---

## Answer Box Coloring

### Recommended Implementation

Per validated decision in PROJECT.md (Key Decisions, line 162):

| Content Type | Color | Hex | Usage |
|--------------|-------|-----|-------|
| AI/Hint Content | Yellow/Amber | `#FEF3C7` (light) / `#F59E0B` (text) | Suggested answer, hint text, AI-generated |
| User Typed Content | Green | `#D1FAE5` (light) / `#059669` (text) | User's input, user corrections |

### Visual Example

```
┌────────────────────────────────────────────────────┐
│  Suggested:  ┌──────────────────────────────┐     │
│              │ The quick brown fox jumps     │     │
│              └──────────────────────────────┘     │
│                      (yellow background)            │
│                                                     │
│  Your answer:  ┌──────────────────────────────┐    │
│                │ The quick brown fox jumps    │    │
│                └──────────────────────────────┘    │
│                        (green background)           │
└────────────────────────────────────────────────────┘
```

### Key Principles

1. **Consistent with PROJECT.md** — Yellow=AI/hint, green=user already validated
2. **Subtle distinction** — Colors should differentiate, not clash
3. **Both boxes visible** — Helps learners compare their input to suggestion
4. **Accessible contrast** — Ensure WCAG AA compliance for text on colored backgrounds

---

## Sources

- **LingQ**: Import options, library vs import, language levels, content types — [LingQ Blog](https://www.lingq.com/blog/complete-guide-importing-lingq/), [LingQ Help](https://www.lingq.com/en/help/)
- **Migaku**: Word learning statuses, color-coded vocabulary tracking — [Migaku](https://migaku.com/), [Migaku Blog](https://migaku.com/blog/youtube/the-learning-statuses-migaku-browser-extension)
- **FluentU**: Video import, language settings — [FluentU Help](http://fluentu.com/help/how-do-i-use-the-import-video-feature/)
- **YouTube Transcript Tools**: Paragraph formatting, sentence segmentation, language support — [YouTube Text Tools](https://youtubetexttools.com/), [YouTranscript](https://youtranscript.ai/), [YouTubeTranscript.dev](https://youtubetranscript.dev/)
- **Anki**: Audio flashcards, TTS playback, pronunciation triggers — [Anki Manual](https://docs.ankiweb.net/templates/styling.html?highlight=Audio), [AwesomeTTS](https://ankiatts.appspot.com/usage/on-the-fly)
- **WordByWord**: Word lookup, translations — [WordByWord](https://www.word-by-word.app/)
- **WordPlus/WordWise**: Vocabulary with translations, flashcards — [WordPlus](https://site.wordplus.app/), [WordWise](https://getwordwise.app/)
- **Dictionary.com**: Speaker button placement, pronunciation playback — [Dictionary.com Help](https://help.dictionary.com/article/315-how-do-i-hear-audio-pronunciations-in-android/)
- **Settings UI Best Practices**: Toggle switches, grouped sections, immediate feedback — [LogRocket](https://blog.logrocket.com/ux-design/designing-settings-screen-ui/), [Toptal](https://www.toptal.com/designers/ux/settings-ux), [Microsoft](https://learn.microsoft.com/en-us/windows/apps/design/app-settings/guidelines-for-app-settings)
- **Video Segmentation**: Paragraph vs sentence, LLM re-segmentation — [pyvideotrans](https://en.pyvideotrans.com/blog/ai-resegment-whisper-srt/), [arXiv](https://arxiv.org/html/2512.24517v1)

---

*Feature research for: Import flow UX + video content extraction*
*Researched: 2026-04-02*
