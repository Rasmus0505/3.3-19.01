# Project Research Summary

**Project:** Bottle English Learning
**Domain:** Import flow UX + video content extraction + immersive learning bug fixes + wordbook enhancements
**Researched:** 2026-04-02
**Confidence:** HIGH

## Executive Summary

The v2.3 milestone requires four categories of work: immersive learning bug fixes, wordbook word-level enhancements, import flow UX redesign, and translation mask behavior tuning. Research confirms all features are achievable using existing codebase patterns — no new major dependencies are needed.

The **generation configuration modal** is the highest-complexity new feature. It should use existing Radix UI primitives (Dialog, Switch, Tabs, Select) already present in the codebase, organized with "generation mode" as the primary decision followed by mode-specific options. The modal must preserve the auto-filled title from the link paste step — a common pitfall is letting modal local state shadow the panel-level title state.

**Video content extraction** as a separate record type is a meaningful differentiator. The key architectural decision is whether to use `lesson_type` on the existing Lesson model (simpler, one table) vs. a separate Transcript model (cleaner domain separation, more migration work). Recommended: add `lesson_type` column to Lesson with `standard` (default) and `video_extract` values, with `generation_mode`/`segmentation_mode` on the task.

**Immersive answer box coloring** (yellow = AI/hint, green = user) was already validated in PROJECT.md Key Decisions. Implementation uses local React state driven by reducer action transitions.

**Pronunciation playback** should use the browser Web Speech API as primary (zero cost, no API dependency) with sentence audio as fallback. Backend TTS endpoint is deferred unless browser TTS quality proves insufficient.

## Key Findings

### Recommended Stack

All UI components use existing Radix UI primitives — no new dependencies. Backend changes are additive:
- **Lesson model**: add `lesson_type` column (`standard`/`video_extract`)
- **Task schema**: add `generation_mode` + `segmentation_mode` fields
- **New endpoint**: `GET /api/wordbook/{id}/pronunciation` (TTS, optional)
- **Existing yt-dlp integration** from Phase 07.1 handles video metadata extraction

### Expected Features

**Must have (table stakes):**
- Immersive answer box: yellow for AI/hint, green for user input — per validated decision
- Translation toggle in generation modal: yes/no for including translation in content
- Word-level translation display above each wordbook entry
- Pronunciation playback for wordbook entries (browser TTS primary)
- History differentiation: visual distinction between Lesson and Transcript records

**Should have (competitive):**
- Video content extraction as separate record type — transforms raw video into studyable transcript
- Auto-fill title from video metadata (yt-dlp already provides this)
- Generation modal: grouped toggle switches per settings UI best practices
- Config modal organized: mode first, then mode-specific options (progressive disclosure)

**Defer (v2+):**
- LLM-based paragraph re-segmentation for better Whisper output boundaries
- Word pronunciation speed control in wordbook
- Language level selector (Beginner/Intermediate/Advanced)
- Manual tags for records

### Architecture Approach

Integration is additive — no refactoring of existing Phase 8/17 architecture:
1. `UploadPanel.jsx` gets `GenerationConfigModal` child component
2. Backend extends `LessonTaskCreateRequest` with `generation_mode`/`segmentation_mode`
3. Lesson model gets `lesson_type` column (default `standard`)
4. `LessonList` filters by `lesson_type` for history differentiation
5. `WordbookPanel` gets pronunciation button + translation display above entries
6. `ImmersiveLessonPage` extends session state with `answerBoxMode` for color transitions

### Critical Pitfalls

1. **Config modal breaks title contract** — modal must not shadow panel-level `titleInput` state; edited titles get lost if modal confirm handler reads from wrong source. Fix: modal props pass title down, confirm returns title+config separately.
2. **Rate/loop buttons reset sentence state** — `SET_PLAYBACK_RATE` and `SET_LOOP_ENABLED` must never touch `sentenceTypingDone`/`sentencePlaybackDone`. Regression test: type words → change rate → words still visible.
3. **Previous sentence playback silent fail** — `requestPlayPreviousSentence` must await `playSentence` result before dispatching `PLAYBACK_STARTED`. Must check `previousSentence.audio_url` exists.
4. **Sentence vs paragraph toggle mismatch** — if backend ASR pipeline only produces sentence-level output, a paragraph-mode toggle in the modal would be a UI lie. Verify backend capability before exposing toggle.
5. **Translation mask position carry-over** — store mask rect as normalized ratios (0-1), detect new video vs. resumed session, force centered rect on new video.
6. **Pronunciation rate limits** — browser Web Speech API avoids backend TTS rate limits entirely. Show loading/error states on button.

## Implications for Roadmap

### Recommended Phase Structure

**Phase 19: 沉浸式学习 Bug 修复**
- B1: 固定按钮/倍速清空句子 → ensure rate/loop handlers dispatch correct events only
- B2: 上一句播放失败 → add `result.ok` guard and `previousSentence.audio_url` check
- B8: 答题框颜色区分 → add `answerBoxMode` state + color transitions
- B9: 排查不应清空句子的情况 → comprehensive event audit + regression tests

**Phase 20: 生词本词条增强**
- F1: 独立翻译显示 → translation above word entry with consistent card height
- F2: 发音播放 → browser TTS primary, sentence audio fallback, graceful error states

**Phase 21: 素材导入 UX 优化**
- F3: 默认链接 Tab → change `defaultTab` from 'file' to 'link'
- F4: 精简文案 → remove explanatory text, auto-fill title, SnapAny link
- B11: toast 对齐 → CSS fix for toast positioning
- B12: 快捷键配置紧凑化 → one-line layout per config item

**Phase 22: 导入弹窗配置与视频内容提取**
- F5: 弹窗选择功能开关 → `GenerationConfigModal` with toggle switches
- F5: 生成方式选择 (English Materials vs Video Extraction)
- F5: 视频内容提取单独配置 → `segmentation_mode` toggle (paragraph/sentence)
- F5: 历史记录区分 → `lesson_type` badge in lesson list

**Phase 23: 字幕遮挡板与链接恢复**
- F6: 新视频字幕遮挡板居中恢复 → normalize rect to ratios, detect new video, force center
- F7: 链接恢复增强 → persist source URL, offer URL-based restore option

### Phase Ordering Rationale

1. **Bug fixes first** — bugs are highest-urgency; fixes are isolated and low-risk regressions
2. **Wordbook enhancements second** — independent of import flow; validates pronunciation infrastructure
3. **Import UX third** — default tab + copy changes are trivial but high-visibility wins
4. **Config modal last** — highest complexity; depends on understanding the full import pipeline
5. **Translation mask + link restore last** — separate concern from import flow

### Research Flags

- **Phase 22 (Video Extraction)**: The paragraph segmentation toggle requires backend verification — does the ASR pipeline produce paragraph-level output? If not, the modal toggle should be hidden or a backend post-processing step added first. Needs phase-specific research during planning.
- **Phase 20 (Pronunciation)**: Browser Web Speech API quality should be verified on Windows (Electron) before committing to it as primary. If quality is poor on Windows, backend TTS becomes necessary earlier.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All UI primitives confirmed in existing codebase; API changes are additive |
| Features | HIGH | Wordbook translation/pronunciation already exist in codebase (Phase 17/18); modal patterns established |
| Architecture | HIGH | Immersive reducer from Phase 8, wordbook from Phase 17, yt-dlp from Phase 07.1 — all well-documented |
| Pitfalls | HIGH | All pitfalls traced to specific file+line references from Phase 8/17/04 research |

**Overall confidence:** HIGH

### Gaps to Address

- **Paragraph segmentation backend capability**: Needs verification during Phase 22 planning — check if the ASR pipeline (Whisper) produces paragraph-level timestamps or only sentence-level segments. If sentence-only, add a post-processing step before exposing the toggle.
- **Browser TTS quality on Windows**: Phase 20 should start with browser Web Speech API, but if quality is unsatisfactory on Electron/Windows, pivot to backend TTS with rate limiting.

## Sources

### Primary (HIGH confidence)
- `.planning/PROJECT.md` — Active requirements, Key Decisions, validated patterns
- `.planning/milestones/v2.1-ROADMAP.md` — Phase 07.1 (Memo mode/link import), Phase 8 (Immersive state machine)
- `.planning/milestones/v2.2-ROADMAP.md` — Phase 17 (Wordbook review UX), Phase 18 (Hint system)
- `frontend/src/features/immersive/ImmersiveLessonPage.jsx` — Immersive state machine, rate/loop handlers
- `frontend/src/features/immersive/immersiveSessionMachine.js` — Reducer actions and state contracts
- `frontend/src/features/immersive/useSentencePlayback.js` — Playback hook, `playSentence` return types
- `frontend/src/features/wordbook/WordbookPanel.jsx` — Wordbook panel with `word_translation` rendering
- `frontend/src/features/upload/UploadPanel.jsx` — Upload flow, `generation_mode`, link import pattern

### Secondary (MEDIUM confidence)
- Radix UI Dialog/Switch/Tabs documentation — existing patterns in codebase match docs
- LingQ import options and library vs. import distinction — blog/documentation review
- Microsoft/Apple settings UI guidelines for toggle switch organization — established best practices
- YouTube transcript tools (YouTube Text Tools, YouTranscript) — paragraph vs. sentence modes

### Tertiary (LOW confidence)
- Browser Web Speech API quality on Windows/Electron — needs runtime verification
- Backend paragraph re-segmentation post-processing — needs phase-specific research

---
*Research completed: 2026-04-02*
*Ready for roadmap: yes*
