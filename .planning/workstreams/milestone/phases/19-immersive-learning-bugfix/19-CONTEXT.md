# Phase 19: 沉浸式学习 Bug 修复 - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

修复 `frontend/src/features/immersive/ImmersiveLessonPage.jsx` 中 4 个已知交互 Bug，基于 Phase 8 reducer 状态机架构。所有修改不得破坏 Phase 8 建立的状态合同（reducer 结构、loop/rate 偏好持久化、句子推进规则）。

</domain>

<decisions>
## Implementation Decisions

### Bug 1+4: 倍速/循环切换时输入被清空

**问题现象:** 用户在输入句子过程中（`sentenceTypingDone=false`），点击倍速 stepper 按钮、循环开关、重置、固定、精听等控制按钮时，输入内容被清空或被自动重播流程干扰。

**根因分析:** Phase 8 D-10 规定"切换倍速/循环不得重置输入"，reducer `SET_PLAYBACK_RATE`/`SET_LOOP_ENABLED` 本身不改变 `sentenceTypingDone`。问题可能出在 auto-answer-replay 的 autoAdvanceGuard 逻辑（line 2358-2361）：
  - 当 `phase === 'auto_play_pending'` + `sentenceTypingDone=true` + `sentencePlaybackDone=true` 时，autoAdvance 触发
  - 但若用户在 typing 过程中（`sentenceTypingDone=false`）点击按钮，某种路径导致 replay 被提前触发，覆盖用户输入
  - `requestReplayCurrentSentence` 中若 assist 导致 `sentenceTypingDone=true`，会触发 ANSWER_COMPLETED → auto replay → 干扰 typing

**修复方案 (IMM-01/IMM-04):**
  1. 在 `requestReplayCurrentSentence` 的 auto-answer-replay trigger（useEffect around autoAdvanceGuard）中增加条件：只有当 `sentenceTypingDone === false` 时才允许 autoAdvance；或增加 replay 触发路径的 guard
  2. `SET_PLAYBACK_RATE`/`SET_LOOP_ENABLED` 的 reducer 保持不变（已不重置状态）
  3. 全面审查：`requestReplayCurrentSentence`、`SET_PLAYBACK_RATE`、`SET_LOOP_ENABLED`、`handleSentencePassed`、`NAVIGATE_TO_SENTENCE` 路径，确保只在合理场景（进入下一句、上一句、手动 replay）才触发状态重置

**验收标准:**
  - 用户在答题框输入 3 个词后切换播放倍速，已输入内容保持可见，不触发自动重播
  - 用户在答题框输入过程中点击精听按钮，输入内容保持可见
  - 用户在答题框输入过程中切换循环开关，输入内容保持可见，不触发自动重播

### Bug 2: 上一句播放静默失败

**问题现象:** 点击"上一句"右侧喇叭按钮时，若音频不可用（`previousSentence.audio_url` 不存在），静默失败，用户不知道发生了什么。

**修复方案 (IMM-02):**
  1. 优先使用 Web Speech API（TTS）做 fallback：不需要安装任何包，浏览器原生支持，web + desktop (Electron/Chromium) 均可使用
     ```js
     // Fallback TTS when previousSentence.audio_url is unavailable
     const speakTTS = (text) => {
       if (!window.speechSynthesis) return false;
       const utter = new SpeechSynthesisUtterance(text);
       utter.lang = 'en-US';
       utter.rate = selectedPlaybackRate; // 复用当前倍速
       speechSynthesis.speak(utter);
       return true;
     };
     ```
  2. `requestPlayPreviousSentence` 逻辑：
     - 先尝试 clip audio（`{ skipSeek: false }`，让它可以 fallback 到主视频）
     - clip + 主视频都 fail → 尝试 Web Speech API
     - TTS 也 fail → 显示 `setMediaError("上一句音频不可用")`
  3. TTS fallback 的 `result.ok` 判断：TTS `speak()` 同步返回（不等待播放完成），视为"请求发出"即成功；若 `speechSynthesis` 不可用则返回 fail

**验收标准:**
  - 点击上一句喇叭时，只有在音频实际播放成功（或 TTS 请求发出）后才显示 playing 状态
  - 音频不可用时显示明确错误提示（`setMediaError`）
  - Web 和桌面端均可使用（Web Speech API 在 Chromium/Electron 中可用）

### Bug 3: 答题框颜色区分

**问题现象:** AI/提示生成的内容与用户手打的内容在答题框中没有视觉区分。

**修复方案 (IMM-03):**
  1. 新增本地状态 `answerBoxMode`（`'ai_content'` | `'user_typed'`）
  2. 由 reducer action 驱动切换：
     - 用户在 typing input 中输入任意字符 → 切换到 `user_typed`
     - 系统填充/揭示（如 `revealWord`、`replayAssistance` 填充单词） → 保持 `ai_content`
  3. 颜色值（已确定）：
     - AI/提示生成内容：`bg-amber-100`（对应 `#FEF3C7`，Tailwind `amber-100`）
     - 用户手打内容：`bg-emerald-100`（对应 `#D1FAE5`，Tailwind `emerald-100`）
  4. 颜色应用范围：答题输入区的主容器背景
  5. 初始状态：`ai_content`（等待用户输入）

**验收标准:**
  - AI/提示生成内容以黄色背景（#FEF3C7）显示
  - 用户手打内容以绿色背景（#D1FAE5）显示

### Claude's Discretion
- Bug 1+4: autoAdvanceGuard 的具体 guard 条件由 planner 决定（需找到精确触发路径后确定）
- Bug 3: `answerBoxMode` 的具体切换逻辑由 planner 决定（哪个 action 触发 `user_typed` 切换）
- Bug 3: 颜色是否应用到具体 letter cells 还是整个答题区容器

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Immersive Learning State Machine
- `frontend/src/features/immersive/immersiveSessionMachine.js` — reducer 事件定义（SET_PLAYBACK_RATE, SET_LOOP_ENABLED, NAVIGATE_TO_SENTENCE, ANSWER_COMPLETED, autoAdvanceGuard 逻辑）
- `frontend/src/features/immersive/ImmersiveLessonPage.jsx` — 主组件（所有 4 个 Bug 的修改面）
- `frontend/src/features/immersive/useSentencePlayback.js` — playSentence API（clip fallback 逻辑、skipSeek 参数）

### Prior Phase Decisions
- `.planning/workstreams/milestone/phases/08-immersive-learning-refactor/08-CONTEXT.md` — Phase 8 决策：D-09 倍速会话态、D-10 不得重置输入内容、D-04 上一句硬中断
- `.planning/workstreams/milestone/phases/12-immersive-ui-optimizations/12-CONTEXT.md` — 上一句喇叭按钮只播放 audio clip 不跳转画面

### Project Requirements
- `.planning/REQUIREMENTS.md` §IMMERSE-01/02/03/04 — 具体 Bug 描述和验收条件
- `.planning/ROADMAP.md` Phase 19 — 成功标准 4 条
- `.planning/PROJECT.md` — 约束：Immersive 架构必须保留 reducer 结构

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useSentencePlayback.js` 的 `playSentence` 支持 `{ skipSeek: true/false }`，已有 clip-unavailable fallback 路径
- `setMediaError` 机制已存在（line 2749），可直接复用
- `window.speechSynthesis`（Web Speech API）是浏览器原生 API，无需安装任何包

### Established Patterns
- reducer 状态机：Phase 8 建立的结构，`sentenceTypingDone`/`sentencePlaybackDone` 是核心状态
- word snapshot 系统：`wordInputs`/`wordStatuses`/`currentWordInput` 驱动渲染，状态通过 `applyWordSnapshot` 同步
- `autoAdvanceGuard` useEffect（line 2258-2264）监听 `sentenceTypingDone` 触发 auto replay

### Integration Points
- Bug 1+4 主要修改点：`requestReplayCurrentSentence`、`autoAdvanceGuard`、可能的 `SET_PLAYBACK_RATE`/`SET_LOOP_ENABLED` wrapper
- Bug 2 主要修改点：`requestPlayPreviousSentence`（增加 TTS fallback 路径）
- Bug 3 主要修改点：新增 `answerBoxMode` 状态 + 答题区容器 className 驱动

</code_context>

<specifics>
## Specific Ideas

- Web Speech API TTS fallback：复用当前倍速 `selectedPlaybackRate`，`lang='en-US'`
- Bug 2 错误提示：`上一句音频不可用，请稍后重试` 或类似清晰文案
- Bug 3 颜色：amber-100 (#FEF3C7) 和 emerald-100 (#D1FAE5)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 19-immersive-learning-bugfix*
*Context gathered: 2026-04-02*
