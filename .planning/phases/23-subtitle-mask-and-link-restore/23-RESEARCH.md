# Phase 23 Research: 字幕遮挡板与链接恢复

**Phase:** 23-subtitle-mask-and-link-restore
**Status:** RESEARCH COMPLETE
**Confidence:** HIGH (verified against source code)

---

## User Constraints (LOCKED)

### MASK-01: 新视频遮挡板居中 + 宽度自适应

| Decision | Detail |
|---|---|
| D-01 | 每次进入新 `lessonId` 时，遮挡板恢复**水平居中** |
| | 计算基准：`videoElement.width * 0.58`，水平居中，距视频底部 `TRANSLATION_MASK_DEFAULT_BOTTOM_OFFSET_PX`（12px） |
| | 不记忆上次 lesson 的 x/y 绝对值 |
| D-02 | 每次句子切换时，遮挡板宽度扩展到当前句子字幕最宽值 |
| | 宽度只向上扩展（只变宽不变窄），直到 session 结束 |

### MASK-02: 遮挡板启用状态跨视频记忆

| Decision | Detail |
|---|---|
| D-03 | `translationMask.enabled` 写入 `learningSettings.uiPreferences.translationMask.enabled` |
| | 用户关闭后换 lesson 保持关闭；开启后换 lesson 保持开启 |

### MASK-04: 链接恢复增强

| Decision | Detail |
|---|---|
| D-04 | 历史记录菜单中"恢复视频"为单一入口按钮 |
| | 有 `source_url` → 弹窗二选一："恢复本地视频" \| "按链接恢复" |
| | 无 `source_url` → 直接打开文件选择器（当前行为不变） |
| D-05 | 用户选择"按链接恢复"后，先检查本地 IndexedDB 缓存 |
| | 有本地缓存 → 弹窗确认"本地已有视频，是否覆盖？" |
| | 无本地缓存 → 直接触发 yt-dlp 下载流程 |

---

## Standard Stack

### Frontend

| Layer | Technology | Notes |
|---|---|---|
| Framework | React 18 + Vite | JSX components |
| State | `useState` + `useRef` + `useCallback` | No external state library |
| Persistence | localStorage via `learningSettings.js` | `readLearningSettings()` / `writeLearningSettings()` |
| Media Cache | IndexedDB via `localMediaStore.js` | `getLessonMedia()`, `getLessonMediaPreview()`, `hasLessonMedia()` |
| UI Dialogs | `@radix-ui/react-alert-dialog` | `AlertDialog` for confirmations |
| Desktop Bridge | `window.localDb` | Desktop-only IndexedDB for courses/sentences/progress |

### Backend (Desktop)

| Layer | Technology | Notes |
|---|---|---|
| Link Import | yt-dlp | Packaged at `runtime-tools/yt-dlp/yt-dlp.exe` |
| API | FastAPI | `/api/desktop-asr/url-import/tasks` endpoint |
| Runtime Bridge | `requestDesktopLocalHelper()` | Frontend → Electron IPC |

---

## Architecture Patterns

### 1. Translation Mask State (MASK-01/02)

**Existing state initialization pattern** (`ImmersiveLessonPage.jsx` line 925-932):

```javascript
const [translationMaskEnabled, setTranslationMaskEnabled] = useState(
  () => readLearningSettings().uiPreferences?.translationMask?.enabled !== false
);
const [translationMaskRect, setTranslationMaskRect] = useState(() =>
  normalizeTranslationMaskRect(readLearningSettings().uiPreferences?.translationMask)
);
```

**Position persistence** (`ImmersiveLessonPage.jsx` line 138-179):
- Position stored as **percentages** (0-1) via `convertTranslationMaskRectToStored()`
- Allows resolution-independent persistence
- Version-gated via `TRANSLATION_MASK_LAYOUT_VERSION` (currently v3)

**Centering computation** (`ImmersiveLessonPage.jsx` line 164-179):
```javascript
function buildDefaultTranslationMaskRect(metrics, options = {}) {
  const width = clampNumber(safeWidth * TRANSLATION_MASK_DEFAULT_WIDTH_RATIO, minWidth, safeWidth);
  // TRANSLATION_MASK_DEFAULT_WIDTH_RATIO = 0.58
  const left = clampNumber((safeWidth - width) / 2, 0, Math.max(0, safeWidth - width));
  const top = clampNumber(
    preferredBottom - height - TRANSLATION_MASK_DEFAULT_BOTTOM_OFFSET_PX,
    // TRANSLATION_MASK_DEFAULT_BOTTOM_OFFSET_PX = 12
    0,
    Math.max(0, safeHeight - height),
  );
  return convertTranslationMaskRectToStored({ left, top, width, height }, { width: safeWidth, height: safeHeight });
}
```

**Lesson ID change detection pattern** (needs new implementation):
```javascript
const prevLessonIdRef = useRef(null);

useEffect(() => {
  if (prevLessonIdRef.current !== null && prevLessonIdRef.current !== lesson?.id) {
    // New lesson detected — reset mask to centered position
    setTranslationMaskRect(buildDefaultTranslationMaskRect(translationMaskMetrics, { preferredBottom: ... }));
  }
  prevLessonIdRef.current = lesson?.id;
}, [lesson?.id]);
```

**Sentence change detection pattern** (needs new implementation):
```javascript
useEffect(() => {
  const currentSentence = lesson?.sentences?.[currentSentenceIndex];
  if (!currentSentence) return;
  // Compute text width and expand mask if needed
  const subtitleWidth = measureTextWidth(currentSentence.text_en, fontSize);
  const videoWidth = translationMaskMetrics?.width || 1;
  const newWidthRatio = Math.max(
    currentMaskWidthRatio,
    subtitleWidth / videoWidth
  );
  if (newWidthRatio > currentMaskWidthRatio) {
    setTranslationMaskRect(prev => ({ ...prev, width: newWidthRatio }));
  }
}, [currentSentenceIndex, lesson?.sentences]);
```

### 2. Link Restore Pattern (MASK-04)

**Existing restore flow** (`LessonList.jsx` line 784-807):
```javascript
function openRestorePicker(lesson) {
  restoreTargetRef.current = lesson;
  setMenuLessonId(null);
  restoreInputRef.current?.click();  // Triggers hidden <input type="file">
}

async function submitRestore(file) {
  const lesson = restoreTargetRef.current;
  const result = await onRestoreMedia(lesson, file);
  // result?.ok ? "恢复视频成功" : "恢复视频失败"
}
```

**New restore flow with URL detection** (needs implementation):
```javascript
function openRestorePicker(lesson) {
  restoreTargetRef.current = lesson;
  setMenuLessonId(null);
  
  if (lesson?.source_url) {
    // Show choice dialog
    setRestoreChoiceOpen(true);
  } else {
    // No source_url — directly open file picker (existing behavior)
    restoreInputRef.current?.click();
  }
}
```

**IndexedDB media cache check** (`localMediaStore.js` line 529):
```javascript
export async function hasLessonMedia(lessonId) {
  const media = await getLessonMedia(lessonId);
  return Boolean(media);
}
```

**yt-dlp re-download trigger** (existing pattern from `UploadPanel.jsx` line 3638):
```javascript
// Existing URL import pattern — reused for re-download
const response = await requestDesktopLocalHelper("/api/desktop-asr/url-import/tasks", "json", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: { source_url: sanitizedLinkInput },
});
```

---

## Don't Hand-Roll

| Problem | Use Instead | Location |
|---|---|---|
| Lesson media existence check | `hasLessonMedia(lessonId)` | `localMediaStore.js:529` |
| Media blob retrieval | `getLessonMedia(lessonId)` | `localMediaStore.js:477` |
| Translation mask centering math | `buildDefaultTranslationMaskRect()` | `ImmersiveLessonPage.jsx:164` |
| Position normalization (percentages) | `normalizeTranslationMaskRect()` | `ImmersiveLessonPage.jsx:120` |
| Settings persistence | `persistUiPreferences()` | `ImmersiveLessonPage.jsx:1319` |
| Desktop runtime communication | `requestDesktopLocalHelper()` | `UploadPanel.jsx` |
| Alert confirmations | `AlertDialog` components | `shared/ui/alert-dialog.jsx` |
| Lesson ID changes | `useRef` + `useEffect` pattern | See Architecture section |

---

## Common Pitfalls

### 1. Lesson ID Change Timing

**Pitfall:** Triggering mask reset before video element is mounted/measured.

**Mitigation:** Reset should happen in a `useEffect` that also depends on `translationMaskMetrics`. The centering math requires valid `videoWidth` from the metrics calculation (which runs after video mount).

### 2. Sentence Text Width Measurement

**Pitfall:** Measuring text width requires a DOM measurement context (hidden element or canvas).

**Mitigation:** Use a hidden `<span>` element with identical font styling, measure via `getBoundingClientRect().width`, then convert to video-relative ratio.

### 3. Width Only Expands (Not Shrinks)

**Pitfall:** Naive implementation might cause infinite re-renders if width update triggers metrics recalculation.

**Mitigation:** Store `maxWidthRatio` in a `useRef` (not state) to track the session's maximum width, and only call `setTranslationMaskRect` when new width exceeds the stored maximum.

### 4. source_url Field Availability

**Pitfall:** The `source_url` field may not exist in the lesson object from API responses.

**Mitigation:** Check with `lesson?.source_url` (optional chaining). If absent, fall back to existing behavior (file picker only). The field was added during Phase 4 link import — needs verification against backend model.

### 5. Desktop-Only Features

**Pitfall:** `window.localDb` and `requestDesktopLocalHelper` are desktop-only.

**Mitigation:** Guard with `hasLocalDbBridge()` check (existing pattern at `LessonList.jsx:58`). Web clients should only show the "按链接恢复" option when desktop runtime is available.

### 6. yt-dlp Re-download Failure

**Pitfall:** If yt-dlp download fails, lesson state should remain unchanged.

**Mitigation:** API error handling in `submitLinkRestore` should catch errors and display user-facing error message without modifying lesson media. Restore the original file or clear the failed download.

---

## Validation Architecture

### Unit Test Targets

| Function | Test Case |
|---|---|
| `buildCenteredMaskRect()` | Returns horizontally centered rect with correct width ratio |
| Mask reset on lesson change | `prevLessonId` ref comparison triggers reset |
| Sentence width expansion | Width only increases, never decreases within session |
| `hasLessonMedia()` cache check | Returns true/false correctly |
| Choice dialog conditional rendering | Shows dialog only for lessons with `source_url` |

### Integration Test Targets

| Flow | Validation |
|---|---|
| New lesson → mask centered | Mask appears at horizontal center after lesson switch |
| Sentence navigation → mask expands | Mask width grows to accommodate longest subtitle seen |
| "按链接恢复" with cached media | Shows overwrite confirmation dialog |
| "按链接恢复" without cache | Triggers yt-dlp download directly |
| Restore success/failure | UI updates or error message displayed |

### Visual Checkpoints

1. **New lesson entry**: Mask appears centered at 58% video width, 12px from bottom
2. **Sentence navigation**: Mask width visibly expands when encountering long subtitles
3. **Restore choice dialog**: Clean two-button layout with clear labels
4. **Overwrite confirmation**: Single focus on "是否覆盖" decision

---

## Sources

| Source | Confidence | Notes |
|---|---|---|
| `frontend/src/features/immersive/ImmersiveLessonPage.jsx` | **HIGH** | Verified: mask state lines 925-932, centering logic 164-179, persistence 1363 |
| `frontend/src/features/immersive/learningSettings.js` | **HIGH** | Verified: `DEFAULT_UI_PREFERENCES`, `sanitizeUiPreferences`, constants |
| `frontend/src/features/lessons/LessonList.jsx` | **HIGH** | Verified: `openRestorePicker`, `submitRestore`, `hasLocalDbBridge` |
| `frontend/src/shared/media/localMediaStore.js` | **HIGH** | Verified: `getLessonMedia`, `getLessonMediaPreview`, `hasLessonMedia` |
| `frontend/src/features/upload/UploadPanel.jsx` | **HIGH** | Verified: yt-dlp import pattern, `requestDesktopLocalHelper`, `finalizeDesktopLocalCourseSuccess` |
| `frontend/src/features/immersive/immersiveSessionMachine.js` | **HIGH** | Verified: `NAVIGATE_TO_SENTENCE` reducer action |
| `.planning/workstreams/milestone/phases/08-immersive-learning-refactor/08-CONTEXT.md` | **HIGH** | D-12 mask persistence contract |
| `.planning/workstreams/milestone/phases/19-immersive-learning-bugfix/19-CONTEXT.md` | **HIGH** | Reducer architecture constraints |
| `.planning/workstreams/milestone/phases/04-desktop-link-import/04-CONTEXT.md` | **HIGH** | yt-dlp integration, `source_url` field definition |

---

## Key Unknowns (Clarified During Planning)

1. **`source_url` field name**: Confirmed snake_case (`source_url`) from Phase 4 backend model. Need to verify frontend API response includes this field.

2. **"按链接恢复" desktop-only**: D-04 implies this feature is for desktop clients. Confirm whether web clients should see this option or be redirected to desktop-only flow.

3. **Session definition for width reset**: Width "只变宽不变窄，直到 session 结束" — clarify whether session = browser tab lifetime, or = single ImmersiveLessonPage mount.

4. **Trigger timing for centering**: Confirm whether centering happens in `ImmersiveLessonPage` mount effect or upstream in `LearningShellContainer`.

---

## Next Steps

Proceed to `/gsd-plan-phase 23` to generate `23-PLAN.md` with task breakdown.
