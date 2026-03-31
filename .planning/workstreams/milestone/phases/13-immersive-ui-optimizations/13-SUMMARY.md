---
phase: 13
plan: 01
status: complete
completed: 2026-03-31
---

## Phase 13: 沉浸学习前端交互优化 — 执行完成

**Commit:** `f27d9e46`  
**变更文件：**

- `frontend/src/features/immersive/ImmersiveLessonPage.jsx`
- `frontend/src/features/immersive/useSentencePlayback.js`
- `frontend/src/features/immersive/immersive.css`

---

## 执行摘要

| 任务 | 变更 | 验证 |
|------|------|------|
| Task 1: 加入生词本不触发重播 + toast 1.5s | `collectWordbookEntry` 成功回调移除 `onWordbookChanged?.()`，toast 加 `duration: 1500` | `toast.success(..., { duration: 1500 })` 存在，`onWordbookChanged` 调用已移除 |
| Task 2: 加入生词本按钮文案加黑 | Button className 加 `text-foreground` | `text-foreground` 存在于按钮 class |
| Task 3: number input spinner 隐藏 | `immersive.css` 添加全局 `input[type="number"]` spinner 隐藏规则 | CSS 规则存在于文件末尾 |
| Task 4: 倍速按钮组间距 | 倍速 label className 加 `ml-4` | `ml-4` 存在于 `immersive-session-rate-field` class |
| Task 5: 喇叭只播放音频不跳主视频 | `playSentence` 增加 `{ skipSeek }` 参数，`requestPlayPreviousSentence` 传入 `{ skipSeek: true }` | 函数签名含 skipSeek，调用处含 `{ skipSeek: true }` |

---

## 技术细节

### Task 5 skipSeek 实现原理

在 `useSentencePlayback.js` 的 `playSentence` 函数中：

- 新增第三个参数 `{ skipSeek = false }`
- 当 `skipSeek === true` 且 sentence 有 `audio_url` 时，`effectiveMode` 强制为 `"clip"`
- clip 模式使用 `clipAudioRef`（独立 audio 元素）播放句子音频，不修改主视频 `mediaElementRef.currentTime`
- 不影响其他调用 `playSentence` 的地方（自动播放、复读等继续走原逻辑）

### Task 1 skipSeek 对喇叭按钮的完整影响

`requestInteractiveWordbookSentencePlayback` 的 wordbook 喇叭按钮会调用 `requestPlayPreviousSentence`（mode === "previous"），现在传入 `{ skipSeek: true }`：
- 只播放 `previousSentence.audio_url` 的音频 clip
- 主视频时间轴不动
- 播放器 badge 状态会更新，但主画面不跳转

---

## 问题与说明

- Task 3 的 CSS 全局规则同时覆盖句子跳转 input（已有 `style={{ MozAppearance: "textfield" }}` 的元素也被覆盖，行为一致）
- Task 5 只修改了 `requestPlayPreviousSentence`，`requestPlayCurrentAnsweredSentence`（当前句喇叭按钮）未修改——该按钮的点击行为保持不变（因为 `requestInteractiveWordbookSentencePlayback` 中 "current" 模式调用的是 `requestPlayCurrentAnsweredSentence`，不经过 `skipSeek` 路径）

---

## Lint 检查

无 lint 错误。
