# Pitfalls Research

**Domain:** Import flow UX + video content extraction + UI refinements
**Researched:** 2026-04-02
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Rate/Loop Buttons Reset Sentence State Through Event Loop Ordering

**What goes wrong:** Clicking the "倍速" stepper or the "精听" toggle causes the active sentence's typing progress and playback gate to silently reset, losing what the learner already typed.

**Why it happens:** The `NAVIGATE_TO_SENTENCE` event in `immersiveSessionMachine.js` calls `applySentenceGateReset(state, event.playbackRequired ?? true)` — it unconditionally resets `sentenceTypingDone`, `sentencePlaybackDone`, `postAnswerReplayState`, and `translationDisplayMode`. Rate and loop controls in `ImmersiveLessonPage.jsx` (lines 3543–3597) dispatch `SET_PLAYBACK_RATE` or `SET_LOOP_ENABLED` events directly. However, the bug description says "固定按钮/倍速清空句子" — the root cause is that some code path connects button interactions to `NAVIGATE_TO_SENTENCE` instead of directly to the rate/loop setters, OR the `selectedPlaybackRate` change triggers a re-render that unmounts the word-input component.

Tracing the actual code: `SET_PLAYBACK_RATE` at line 201 correctly only sets `selectedPlaybackRate` without touching the sentence gate. `SET_LOOP_ENABLED` at line 196 only sets `singleSentenceLoopEnabled`. Neither event touches the sentence gate. The real risk is that the `buildReplayPlaybackPlan` function at line 770 uses `selectedPlaybackRate` to set the playback plan's `initialRate`, and if this value changes mid-sentence while a playback is in progress, the playback hook (`useSentencePlayback`) needs to re-apply the new rate. If `playbackKindRef.current` gets stale or the `playSentence` call at line 1973 uses an outdated rate, the sentence gate logic can desync with what the learner sees.

**How to avoid:**
- Ensure rate/loop button handlers dispatch only `SET_PLAYBACK_RATE`/`SET_LOOP_ENABLED`, never `NAVIGATE_TO_SENTENCE`.
- In `useSentencePlayback`, re-apply the current rate to the media element whenever `selectedPlaybackRate` changes from outside (i.e., add a `useEffect` watching `selectedPlaybackRate` that calls `syncPlaybackRate` without resetting the segment boundary).
- Add a debug log entry for every rate change: `debugImmersiveLog("playback_rate_changed", { from, to, sentenceIndex })`.
- Regression test: type 3 words into a sentence, change the playback rate to 1.5x, verify the typed words are still visible and the phase is still "typing" (not "auto_play_pending").

**Warning signs:** Learners report "I typed half the sentence and the input cleared when I changed speed." The `sentenceTypingDone` state flips to `true` unexpectedly after a rate change.

**Phase to address:** Immersive Bug Fix phase (addresses "固定按钮/倍速清空句子")

---

### Pitfall 2: Previous Sentence Playback Fails Silently When Clip Audio Is Absent

**What goes wrong:** Clicking the speaker button for "上一句" does nothing — no audio plays, no error message appears, and the learner is unaware playback was attempted.

**Why it happens:** `requestPlayPreviousSentence` at `ImmersiveLessonPage.jsx:2731` calls `playSentence(previousSentence, { initialRate: selectedPlaybackRate, rateSteps: [] }, { skipSeek: true })`. The `skipSeek: true` option routes playback to clip audio mode (`effectiveMode = "clip"`), which requires `sentence.audio_url` to be present. If `previousSentence.audio_url` is null/undefined, `playSentence` returns `{ ok: false, reason: "clip_unavailable" }` (line 182 in `useSentencePlayback.js`) — but `requestPlayPreviousSentence` ignores this return value. It dispatches `PLAYBACK_STARTED` immediately (line 2757) regardless of whether the async `playSentence` actually succeeded. The error is caught at line 2747 and sets `setMediaError("播放上一句失败，请稍后重试。")` — but only if `!result.ok`. Since `requestPlayPreviousSentence` dispatches `PLAYBACK_STARTED` *before* the `await` resolves (lines 2742–2762), there's a window where the phase is "playing" but no actual audio is playing. The fix dispatches `SET_PHASE` back to "typing" on failure — but this is after the learner already saw a brief "playing" state with no audio.

The `skipSeek: true` is intentional: it avoids seeking the main video to the previous sentence's timestamp. But if the ASR pipeline did not generate per-sentence clip audio for the previous sentence, playback silently fails.

**How to avoid:**
- Before dispatching `PLAYBACK_STARTED` in `requestPlayPreviousSentence`, await `playSentence` and only proceed if `result.ok === true`.
- Check if `previousSentence.audio_url` exists before attempting clip-mode playback; if absent, fall back to main-video seek mode (remove `skipSeek` or set it to `false`).
- If both clip and seek are unavailable, show a user-facing error: "上一句音频不可用，尝试重新生成课程" — not just "播放上一句失败，请稍后重试."
- Add `previousSentenceHasAudio` guard: `if (!previousSentence?.audio_url && !mediaElementRef.current) { setMediaError("无可用音频"); return; }`.

**Warning signs:** The previous-sentence speaker button is visible and clickable (at `ImmersiveLessonPage.jsx:3733`), but nothing plays. The `previousSentence` computed at line 1168 is never null when `currentSentenceIndex > 0` — so the guard at line 2733 `if (!previousSentence) return` never triggers. The actual guard needed is `if (!previousSentence.audio_url && !mediaElementRef.current)`.

**Phase to address:** Immersive Bug Fix phase (addresses "上一句播放失败")

---

### Pitfall 3: Generation Config Modal Breaks the Auto-Title-Fill Contract

**What goes wrong:** After the user pastes a link and the system auto-fills the title, clicking "导入并生成课程" opens a new configuration modal. The modal dismisses the title-editing state, and the title the user may have edited in the input gets lost or reverts to the auto-filled value.

**Why it happens:** The established Phase 4 pattern requires: "Parsed title becomes default title. Title editable during generation, and edits become the final title immediately." The current `submitDesktopLinkImport` at `UploadPanel.jsx` dispatches `setPhase(DESKTOP_LINK_IMPORTING_PHASE)` immediately (line 3633). Adding an intermediate modal between the button click and the phase dispatch creates a state discontinuity. The modal's own local state shadows the panel's `titleInput` value. If the modal's confirm handler reads from the wrong state source (panel-level `titleInput` vs modal-level `configTitle`), the edited title is lost.

**How to avoid:**
- Keep all title editing state at the UploadPanel level — the modal should only hold configuration toggles (ASR model, extraction mode, content type).
- The modal's confirm handler must call the same title-commit path that non-modal flow uses.
- Pass `titleInput` as a controlled prop into the modal, and have the modal's `onConfirm(config)` return both the config and the confirmed title — not mutate it internally.
- Verify: paste a link → auto-fill title → change title → open config modal → confirm → the task payload has the edited title, not the auto-filled one.

**Warning signs:** Manual title edits disappear after modal confirmation. The task creation API receives the wrong title. Regression against Phase 04-01 behavior.

**Phase to address:** Import UX phase (addresses "导入弹窗配置" and "自动填标题")

---

### Pitfall 4: Sentence vs. Paragraph Segmentation Is One Toggle, Not Two Independent Switches

**What goes wrong:** The "视频内容提取单独配置" requirement implies a separate extraction mode for video content. The current ASR pipeline has one segmentation setting (sentence-level timestamps from Whisper output). Adding "paragraph mode" as a toggle creates two outputs from the same input: sentences AND paragraphs. If the pipeline only supports one output structure, a toggle would be cosmetic — it changes the UI label but not the actual segmentation, confusing users who explicitly configured paragraph mode.

**Why it happens:** yt-dlp extracts the video. ffmpeg converts it to audio. The ASR model (Whisper) outputs timestamped segments that are inherently sentence-length (driven by the model's chunking). "Paragraph" segmentation requires post-processing (merging consecutive sentences by pause-duration heuristics). If the backend only produces sentence-level timestamps, a "paragraph mode" toggle in the config modal would be a UI lie — it accepts the input but produces the same output.

**How to avoid:**
- Before adding a paragraph toggle to the config modal, verify what the backend ASR pipeline actually supports: does it have a post-processing step to merge sentences into paragraphs based on silence detection?
- If the pipeline only supports sentence-level, either (a) add paragraph extraction as a real backend feature before the modal, or (b) rename the toggle to "句子粒度 / 段落粒度" and make the backend do the segmentation.
- In the modal, show the effective extraction mode that matches what the backend will produce — not what the user selected if the backend can't fulfill it.

**Warning signs:** Backend ASR output always has per-sentence `begin_ms`/`end_ms` regardless of the toggle. The lesson's `sentences` array always has one entry per ASR segment. The extraction toggle only changes display labels.

**Phase to address:** Video Extraction Config phase (addresses "视频内容提取单独配置")

---

### Pitfall 5: History View Cannot Distinguish Imported Lessons from Uploaded Lessons

**What goes wrong:** Users cannot tell from the history/lesson list whether a lesson came from a direct file upload, a desktop link import, or a public-link Memo import. When something goes wrong (e.g., a link-import lesson has no sentences), users file confusion reports because the lesson "looks normal" in the list but behaves differently.

**Why it happens:** The Phase 4 research explicitly flagged this as a known pitfall: "leaking import identity into history" — but the fix in Phase 07.1 addressed the public-link workflow, not the history list differentiation. The lesson schema at the backend likely has a `source` or `import_type` field that is used internally but not surfaced in the frontend lesson list. The v2.3 active requirement "历史记录区分" is about making this visible.

**How to avoid:**
- The lesson list item component should show a small badge or icon: "链接导入" / "文件上传" / "Memo" — read from `lesson.import_type` or `lesson.source`.
- The backend must persist `import_type` at lesson creation time (it should already exist from the Phase 4 desktop ASR path).
- The `LessonList` or history surface should conditionally render the badge — don't add it to all items, only to non-default-import-type items.
- The "恢复" (restore) flow for link imports needs the same badge, plus the URL displayed so users can verify the right lesson.

**Warning signs:** All lesson cards look identical regardless of import source. Users asking "where did this lesson come from?" in support. The "链接恢复" requirement in v2.3 will amplify this — if users can restore by link URL, they need to know which lesson matches which URL.

**Phase to address:** Import UX phase (addresses "历史记录区分" and "链接恢复增强")

---

### Pitfall 6: Wordbook Word Translation Layout Breaks Card Grid Alignment

**What goes wrong:** Adding `word_translation` prominently above each wordbook entry card (as "每个词条上方显示独立翻译" requires) causes the card height to vary based on translation length. In a list view with uniform cards, this creates a jagged visual layout. In batch-selection mode, the checkbox row alignment breaks when card heights differ.

**Why it happens:** The current `WordbookPanel.jsx` at lines 554–556 already renders `item.word_translation` as an inline line inside the card body:

```554:556:frontend/src/features/wordbook/WordbookPanel.jsx
{item.word_translation ? (
  <p className="text-sm font-medium text-foreground">单词翻译：{item.word_translation}</p>
) : null}
```

Moving this above the entry text and making it prominent (larger font, distinct background) changes the card height. The card's `flex-col gap-4` layout at line 534 means any height change propagates to the whole card. The sticky "Select All" row at line 505 uses `sticky top-0 z-10` — if cards have variable heights, scroll position changes can cause the sticky row to misalign with card boundaries.

**How to avoid:**
- Use a consistent minimum height for the translation block: `min-h-[2.5rem]` or wrap in a fixed-height container with `text-overflow: ellipsis`.
- Place the translation in a visually distinct but height-consistent container: a `div` with `rounded-md bg-muted/20 px-2 py-1` that grows but has a max-height with `overflow: hidden`.
- Test with entries that have 5-character vs. 25-character translations.
- Verify the sticky select-all row still aligns correctly after card height changes.

**Warning signs:** The wordbook list looks uneven. The select-all checkbox row jumps or misaligns on scroll. Cards overflow their container at certain viewport widths.

**Phase to address:** Wordbook Enhancement phase (addresses "生词本词条增强")

---

### Pitfall 7: Word Pronunciation Playback Hits API Rate Limits Without Fallback

**What goes wrong:** Adding a pronunciation playback button to each wordbook entry (as "支持播放单词发音" requires) sends a TTS API call on every button click. After a few clicks, the API returns 429 (Too Many Requests) or 503 (Service Unavailable). The button shows no feedback for the failure, and the learner has no way to retry.

**Why it happens:** The codebase has no existing word-level pronunciation API. The existing `TranslationDialog` uses `/api/wordbook/translate` which is a translation endpoint, not TTS. The `/api/lessons/{id}/sentences` endpoint serves sentence-level `audio_url` (clip audio from the ASR pipeline), but this is per-sentence, not per-word. Adding per-word TTS requires either a new backend endpoint (calling Qwen-TTS or OpenAI-TTS) or using a browser-side Web Speech API.

If using a backend TTS endpoint:
- Rate limiting: TTS APIs (Qwen, OpenAI) have strict RPM/TPM limits. A user clicking through 20 words in the wordbook list can exhaust the quota for other users sharing the API key.
- Cost: Each TTS request costs tokens. Wordbook entries can number in the hundreds per user, multiplying the cost per learner.
- Audio caching: Without client-side caching, the same word pronounced twice makes two API calls.

If using browser Web Speech API:
- Quality varies across browsers/voices.
- The `speechSynthesis` API may not have English voices on all OS configurations.
- No offline fallback.

**How to avoid:**
- Option A (backend TTS): Add a `/api/wordbook/{entry_id}/pronunciation` endpoint with rate limiting per user (not global). Cache the audio URL server-side keyed by `entry_id + text_hash`. Return a short-lived signed URL or base64-encoded audio. Limit to 10 requests/minute per user.
- Option B (browser Web Speech API): Use `window.speechSynthesis.speak()` with a curated English voice (`lang: 'en-US'`, prefer `Google en-US Neural` if available). Show a loading spinner while speaking starts. Fall back to sentence-level audio if word audio fails.
- Option C (sentence audio reuse): Since each word was collected from a sentence with `audio_url`, use the sentence audio as a proxy pronunciation. This is already available and costs nothing extra.
- Always show user-facing feedback: "发音加载中…" spinner → "播放中" → "发音不可用，请重试" on failure. Never leave the button in a silent-failure state.

**Warning signs:** TTS API logs show 429 errors correlating with wordbook browsing sessions. Users report "pronunciation button does nothing." The `/api/wordbook/translate` endpoint is being called repeatedly (wrong endpoint).

**Phase to address:** Wordbook Enhancement phase (addresses "支持播放单词发音")

---

### Pitfall 8: Translation Mask Position Reset on New Video Breaks Centering Contract

**What goes wrong:** The v2.3 requirement "字幕遮挡板位置记忆策略调整：新视频居中恢复，启用状态记忆" says new videos should reset the mask to center, while enabled state should persist. The current `buildTranslationMaskUiPreference` at `ImmersiveLessonPage.jsx:152` always writes the normalized rect (which might be the last-used position) into `learningSettings.playbackPreferences`. When a user starts a new video, the mask appears at the previous video's position instead of centered.

**Why it happens:** The translation mask rect is stored in `learningSettings.playbackPreferences` per user, not per lesson. The `buildDefaultTranslationMaskRect` at line 164 computes a centered rect from the video's `metrics` (container dimensions), but this is only called when there is no stored rect. If the user previously used the app with a different video, `learningSettings.playbackPreferences` already has a stored mask rect. The `normalizeTranslationMaskRect` at line 120 converts pixel values to normalized ratios (0–1), which survive across video sizes — but a centered rect on a 1920×1080 video becomes off-center on a 1280×720 video.

**How to avoid:**
- Store the mask rect normalized as ratios (already done at `convertTranslationMaskRectToStored` at line 138).
- On lesson load, detect whether this is a "new video" vs. a resumed session: compare `lesson.id` from the current session with the last-loaded `lesson.id` stored in a session ref.
- If new video: force the mask rect to `buildDefaultTranslationMaskRect(metrics)` regardless of stored preferences.
- If resuming the same video: use the stored normalized rect, converting it back to pixel coordinates using the current container metrics.
- The enabled/disabled toggle state should persist regardless of whether it's a new video.

**Warning signs:** Mask appears in the bottom-right corner of a new video even though the user never moved it. Mask position from a previous video carries over to a new video. On video resume, the mask position is wrong for the new window size.

**Phase to address:** Translation Mask phase (addresses "字幕遮挡板位置记忆策略调整")

---

### Pitfall 9: Sentence Gate Desync on Navigation Before Playback Completes

**What goes wrong:** The user clicks "下一句" while the current sentence's audio is still playing. The navigation dispatches `NAVIGATE_TO_SENTENCE`, which calls `applySentenceGateReset` — resetting `sentenceTypingDone` and `sentencePlaybackDone` to false. The progress sync (`syncProgress`) is async (line 1821 in `handleSentencePassed`), but `NAVIGATE_TO_SENTENCE` fires before `syncProgress` resolves. The backend receives a progress update for sentence N while the learner has already moved to sentence N+1, creating a race condition in the lesson progress.

**Why it happens:** `requestNavigateSentence` at `useImmersiveSessionController.js:38` calls `onNavigateSentence` immediately (no await). `handleNavigateSentence` in `ImmersiveLessonPage` dispatches `NAVIGATE_TO_SENTENCE` synchronously, then calls `resetWordTyping`. The `handleSentencePassed` at line 1810 does an `await syncProgress(...)` — but that is only triggered after the reducer processes `SENTENCE_PASSED`. Clicking "下一句" during playback bypasses `SENTENCE_PASSED` and goes straight to `NAVIGATE_TO_SENTENCE`, skipping the async progress sync for the current sentence.

**How to avoid:**
- In `requestNavigateSentence`, check if playback is active (`isPlaying` from `useSentencePlayback`) and show a confirmation: "播放未结束，确定跳转？"
- OR: Before dispatching `NAVIGATE_TO_SENTENCE`, call `syncProgress` for the current sentence first (make it a non-blocking fire-and-forget).
- Verify in the backend: `update_lesson_progress` should be idempotent — if sentence N progress arrives after sentence N+1 was already set, the backend should not regress progress.

**Warning signs:** Lesson progress shows sentence 5 completed, but the learner jumped to sentence 7 before sentence 5's audio finished. The backend `completed_sentence_indexes` has gaps. Learners report their progress "reset" after jumping ahead during playback.

**Phase to address:** Immersive Bug Fix phase (addresses general navigation state integrity)

---

## "Looks Done But Isn't" Checklist

- [ ] **Generation config modal:** Often only updates local modal state — verify the confirmed config flows into the `taskPayload` or API call body, not just into modal-local state.
- [ ] **Previous sentence playback:** Often missing the `result.ok` guard before dispatching `PLAYBACK_STARTED` — verify the speaker button actually plays audio, not just shows a spinner.
- [ ] **Sentence gate reset:** Often fires on rate changes due to stale event wiring — verify `SET_PLAYBACK_RATE` and `SET_LOOP_ENABLED` never touch `sentenceTypingDone` or `sentencePlaybackDone`.
- [ ] **Word translation layout:** Often uses variable-height inline elements — verify all wordbook cards have consistent height regardless of translation string length.
- [ ] **History differentiation:** Often adds a badge but doesn't persist `import_type` at lesson creation — verify the badge renders from backend data, not hardcoded assumptions.
- [ ] **Pronunciation button:** Often hits API errors silently — verify the button shows loading state and an error state with retry, never just "does nothing."
- [ ] **Translation mask centering:** Often persists the last pixel position instead of normalizing to ratios — verify a new video renders the mask centered, not at the previous video's position.
- [ ] **Sentence navigation during playback:** Often skips progress sync — verify the backend receives progress for the skipped sentence even when navigating mid-playback.

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Rate/Loop buttons reset sentence | Immersive Bug Fix | Type words → change rate → words still visible |
| Previous sentence playback silent fail | Immersive Bug Fix | Click previous speaker → audio plays; if no audio, shows error |
| Config modal breaks title contract | Import UX | Edit auto-filled title → open modal → confirm → title preserved |
| Sentence vs paragraph toggle mismatch | Video Extraction Config | Backend confirms paragraph segmentation is implemented before modal toggle is shown |
| History import type invisible | Import UX | Lesson list shows source badge for imported lessons |
| Word translation layout breaks alignment | Wordbook Enhancement | List renders with consistent card heights at 5-char and 25-char translations |
| Pronunciation hits rate limits | Wordbook Enhancement | Click 20 pronunciation buttons → no 429 errors; error states shown gracefully |
| Translation mask position carry-over | Translation Mask | Open 3 different videos → mask is centered on each new video |
| Navigation skips progress sync | Immersive Bug Fix | Jump to next sentence mid-playback → backend receives progress for current sentence |

## Sources

- Phase 08 immersive session reducer contract: `frontend/src/features/immersive/immersiveSessionMachine.js`
- Phase 08 previous-sentence playback: `frontend/src/features/immersive/ImmersiveLessonPage.jsx:2731` (`requestPlayPreviousSentence`)
- Phase 08 playback hook: `frontend/src/features/immersive/useSentencePlayback.js`
- Phase 17 wordbook panel: `frontend/src/features/wordbook/WordbookPanel.jsx`
- Phase 17 wordbook translation dialog: `frontend/src/features/wordbook/TranslationDialog.jsx`
- Phase 04 link import: `frontend/src/features/upload/UploadPanel.jsx`
- Phase 08 translation mask: `ImmersiveLessonPage.jsx:152` (`buildTranslationMaskUiPreference`) and line 164 (`buildDefaultTranslationMaskRect`)
- Phase 04 research (import identity pitfall): `.planning/workstreams/milestone/phases/04-desktop-link-import/04-RESEARCH.md`
- v2.3 PROJECT.md active requirements: `.planning/PROJECT.md`

---
*Pitfalls research for: Import flow UX + video content extraction + UI refinements*
*Researched: 2026-04-02*
