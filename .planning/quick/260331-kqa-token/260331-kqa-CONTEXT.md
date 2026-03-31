# Quick Task 260331-kqa: 修复精听模式 token 选择和倍速固定按钮逻辑 - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Task Boundary

修复精听模式下的两个 bug：
1. token 选择功能：无论当前字幕区显示"上一句"还是"本句"，token 选择都必须始终可用
2. 倍速固定按钮：未固定时切到下一句倍速自动恢复 1×，固定时倍速保持到本视频结束

</domain>

<decisions>
## Implementation Decisions

### 精听模式 token 选择始终可用
- 无论 `translationDisplayMode` 是 "previous" 还是 "current_answered"，token 选择区始终渲染
- token 选择与 `postAnswerReplayState`、`sentenceTypingDone`、`singleSentenceLoopEnabled` 无关
- 显示哪句的 tokens 由 `translationDisplayMode` 决定：previous → 上文句 tokens，current_answered → 本句 tokens
- `resolveInteractiveWordbookContext` 需要重构，移除所有与 playback/replay 相关的状态检查
- 当 `translationDisplayMode === "current_answered"` 且 `currentSentence` 存在时，直接返回当前句 tokens
- 当 `translationDisplayMode === "previous"` 且 `previousSentence` 存在时，返回上一句 tokens

### 倍速固定按钮语义
- **未固定时**：每切到下一句（非精听自动切换 or 手动下一句），倍速自动重置为 1×
- **固定时**：倍速保持当前值，不自动重置
- 两种状态都只影响当前视频，不会影响其他视频
- 固定状态本身（`playbackRatePinned`）跨句子保留，只在退出沉浸学习时重置

### 倍速重置时机
- 在 `NAVIGATE_TO_SENTENCE` 和 `SENTENCE_PASSED` reducer 中：
  - 如果 `playbackRatePinned === false`，`selectedPlaybackRate` 重置为 `DEFAULT_IMMERSIVE_PLAYBACK_RATE`
  - 如果 `playbackRatePinned === true`，`selectedPlaybackRate` 保持不变
- `handleResetPlaybackRate`（重置按钮）和 `handleTogglePlaybackRatePinned`（固定按钮）逻辑不变

</decisions>

<specifics>
## Specific Ideas

### Bug 1 具体场景
- 开启精听 → 本句播放完（不自动切下一句）→ 下方字幕变为"本句" + 本句翻译
- 问题：此时本句的 token 无法选入生词本
- 修复：`resolveInteractiveWordbookContext` 中移除 `sentenceTypingDone` 和 `postAnswerReplayState` 检查

### Bug 2 具体场景
- 不开启精听：说完本句 → 自动切下一句 → 倍速自动重置为 1×（正确）
- 开启精听：设置倍速 1.5× → 本句播放完 → 切到下一句 → 倍速还是 1.5×（错误，期望 1×）
- 修复：在 `NAVIGATE_TO_SENTENCE` reducer 中判断 `playbackRatePinned`，未固定时重置倍速

</specifics>

<canonical_refs>
## Canonical References

- `frontend/src/features/immersive/ImmersiveLessonPage.jsx` — 精听 token 选择逻辑（line 473-518 `resolveInteractiveWordbookContext`，line 3590-3613 token 渲染）
- `frontend/src/features/immersive/immersiveSessionMachine.js` — 倍速状态机（line 147-154 `NAVIGATE_TO_SENTENCE`，line 215-229 `SENTENCE_PASSED`）

[If none: "No external specs — requirements fully captured in decisions above"]

</canonical_refs>
