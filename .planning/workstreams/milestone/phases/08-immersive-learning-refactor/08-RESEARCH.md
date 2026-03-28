# Phase 8: 沉浸学习重构 - Research

**Researched:** 2026-03-28
**Domain:** React 18 沉浸学习前端状态机重构 + 共享学习壳行为收口
**Confidence:** HIGH

## Summary

Phase 8 不是从零做一个新学习页，而是把现有 `frontend/src/features/immersive/ImmersiveLessonPage.jsx` 的 128KB 单组件拆回到可控的状态合同。当前实现已经有可复用的句子播放 hook、学习偏好持久化、影院全屏、字幕遮挡板、上一句展示和学习壳入口；真正的问题是播放、输入、句子推进、快捷键和显示层副作用全都揉在一起，导致“一个动作改坏另一条状态线”的风险很高。

代码证据很明确：`ImmersiveLessonPage.jsx` 同时维护 `phase`、句子索引、播放完成、输入完成、答后回放、字幕遮挡板、上一句显示偏好、全屏模式、移动端视口、快捷键分发和上一句词选状态；同时全局 `window` 键盘处理和局部 `handleKeyDown` 各自分发一遍同类动作。对这类页面，继续补 `useState` 和 `useEffect` 只会增加耦合，最稳的做法是把“状态迁移”与“媒体/DOM 副作用”明确分层：前者用本地 reducer / state-machine 模块建模，后者保留在现有 hook 和页面壳里执行。

**Primary recommendation:** 按四个切面规划 Phase 8：
1. 先抽离本地状态机和统一动作入口，停止在页面里散落 `setState` 链。
2. 再接入用户锁定的单句循环与固定倍速，并去掉当前隐藏的 `0.95 / 0.85 / 0.75` 尾段减速逻辑作为主速度系统。
3. 然后收口全屏 / 上一句 / 字幕遮挡板的显示层副作用，保证不重置学习状态，并补“上一句右侧喇叭按钮”。
4. 最后补契约测试和 `app/static` 同步验证，锁住这批行为。

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** 关闭单句循环时，用户答对当前句后不立即跳句；应先完成当前句的既定播放流程，再把当前句完整回放 1 次，然后自动进入下一句。
- **D-02:** 开启单句循环时，当前句应持续循环播放并停留在本句，直到用户主动关闭循环，或手动触发上一句 / 下一句。
- **D-03:** 单句循环是跨课程、跨进入次数的全局记忆偏好；下次进入沉浸学习时沿用上一次的循环开关状态。
- **D-04:** 用户在播放中或暂停中按上一句 / 下一句时，应硬中断当前播放、暂停、答后回放和循环状态，立即切到目标句，并自动播放目标句。
- **D-05:** 用户在播放中按揭示字母 / 揭示单词时，揭示应立即生效，但不得暂停、重启或改写当前音频播放。
- **D-06:** 点击“上一句”区域右侧唯一的喇叭按钮时，应硬中断当前句状态，完整播放上一句 1 次；播放结束后回到当前句待命，不自动恢复当前句播放或循环。
- **D-07:** 单句循环和倍速控件只需要在影院全屏的答题板块常驻可见；不必把这组控件扩展成一个单独的非全屏主交互面。
- **D-08:** 倍速只提供固定档位 `0.75x / 0.90x / 1.00x`。
- **D-09:** 倍速仅在当前一次沉浸学习会话内保持；退出沉浸学习后恢复默认 `1.00x`，但在同一次沉浸会话内切句、切全屏、开关遮挡板都不得重置当前倍速。
- **D-10:** 进入 / 退出全屏、显示 / 隐藏上一句、开关字幕遮挡板、拖动字幕遮挡板位置，都只能改变显示层，不得重置当前句索引、当前输入内容、已揭示进度、循环开关、当前会话倍速或句子完成状态。
- **D-11:** “显示 / 隐藏上一句”是需要持久化的用户偏好，下次进入沉浸学习时沿用上一次的显示状态。
- **D-12:** 字幕遮挡板的开关状态和拖拽后的位置都需要持久化，下次进入沉浸学习时恢复。
- **D-13:** “上一句”区域的回听入口收口为右侧单个喇叭按钮，不再扩展为额外文案按钮或多组操作。

### the agent's Discretion
- 状态机 / reducer 的事件命名、模块边界和副作用组织方式
- 全屏答题板块中循环与倍速控件的具体排版和视觉表达
- 上一句喇叭按钮的图标、禁用态和提示文案
- 非全屏 fallback 视图是否保留轻量状态提示

### Deferred Ideas (OUT OF SCOPE)
- 生词本复习逻辑和 SRS 扩展
- 新的学习模式或新的练习页
- 单独的 UI-SPEC 设计阶段；Phase 8 以行为收口为主，继续复用现有沉浸学习界面骨架
</user_constraints>

---

## Standard Stack

### Core
| Library / Module | Version / Source | Purpose | Why it matters here |
|------------------|------------------|---------|----------------------|
| `react` / `react-dom` | `18.3.1` | 本地 reducer、effect、副作用编排 | 当前沉浸页已完全基于 React，本阶段不需要引入新的状态机框架 |
| `frontend/src/features/immersive/useSentencePlayback.js` | codebase | 句子播放、暂停 / 继续、当前速率回报 | 这是现成播放执行层，Phase 8 应围绕它建模，而不是重写媒体控制 |
| `frontend/src/features/immersive/learningSettings.js` | codebase | 学习偏好持久化和快捷键设置 | 单句循环、上一句显示、遮挡板偏好都应继续挂在这里 |
| `frontend/src/app/learning-shell/LearningShellContainer.jsx` | codebase | 沉浸模式进入 / 退出、课程详情加载、进度刷新 | 这是状态机和学习壳之间的现成边界 |
| `pytest` + 现有 contract/e2e 目录 | repo test stack | 回归验证 | 当前仓库没有前端单测框架，Phase 8 更适合新增 source-contract 测试 + 构建验证 |

### Supporting
| Tool / Pattern | Purpose | When to use |
|----------------|---------|-------------|
| `npm --prefix frontend run build` | 前端编译完整性检查 | 每次拆状态 / 改 JSX 或 hook 后 |
| `npm --prefix frontend run build:app-static` | 同步并验证 `app/static` | 阶段收尾或涉及网页端交互交付时 |
| `tests/contracts/*.py` | 源码契约回归 | 锁定控件文本、导入关系、禁止回归的重置逻辑 |
| `tests/e2e/test_e2e_key_flows.py` | 学习与进度链路 smoke | 保证练习进度 API 仍支持沉浸学习主流程 |

No additional npm packages are recommended for this phase.

---

## Architecture Patterns

### Pattern 1: 本地 reducer 负责状态迁移，组件负责副作用

当前 `ImmersiveLessonPage.jsx` 既决定“下一状态是什么”，也直接操作媒体、全屏、拖拽和焦点。最佳拆法不是把所有状态丢进 Zustand，而是新增一个局部 `immersiveSessionMachine.js`（或等价模块），只负责：

- lesson/session 初始化
- 句子推进与停留规则
- 答对、答后回放、循环、跳句、暂停继续的事件迁移
- 全屏 / 上一句 / 遮挡板这类显示偏好的状态表达

组件层只保留：

- `playSentence()` / `stopPlayback()` / `togglePausePlayback()` 调用
- DOM / fullscreen / pointer 事件桥接
- 把 reducer 状态投影到 UI

### Pattern 2: 播放执行层继续复用 `useSentencePlayback`

`useSentencePlayback.js` 已经封装：

- 主媒体 / clip 模式切换
- `playSentence()`
- `togglePausePlayback()`
- `onMainMediaTimeUpdate()`
- `currentPlaybackRate`

这意味着 Phase 8 的主任务是让“谁在什么条件下触发这些 API”变清晰，而不是再发明一套播放器 hook。

### Pattern 3: 固定倍速应取代隐藏尾段减速作为主速度系统

当前 `learningSettings.js` 的 `resolveReplayAssistance()` 仍会输出 `0.95 / 0.85 / 0.75` 的尾段减速方案；这和 Phase 8 已锁定的固定倍速 `0.75 / 0.90 / 1.00` 冲突。最佳收口方式是：

- 保留 reveal-letter / reveal-word 的文本辅助阶段
- 不再把 `tailRate` 作为主播放速度来源
- 所有句子播放、手动重播、答后回放、上一句喇叭试听统一使用用户当前选中的固定倍速

### Pattern 4: 显示层副作用必须与学习态解耦

当前 `enterCinemaFullscreen()` 里直接 `setShowFullscreenPreviousSentence(false)`，这已经违反了用户锁定的“只改显示层，不重置学习状态”。同类风险还存在于：

- 字幕遮挡板开关 / 拖动
- 全屏 fallback 与退出逻辑
- 上一句显示切换

这些交互应只改 UI 偏好和展示，而不触碰：

- `currentSentenceIndex`
- `wordInputs`
- `wordStatuses`
- `sentenceTypingDone`
- `sentencePlaybackDone`
- loop 开关
- 当前会话速率

### Pattern 5: 契约测试比引入前端测试框架更现实

当前 repo 没有 Vitest / Jest。为了在 Phase 8 内保持执行成本可控，最现实的自动化方案是：

- 新增 `tests/contracts/test_learning_immersive_contract.py`，锁住关键 UI/源码合同
- 继续使用 `npm --prefix frontend run build` 检查编译
- 用 `build:app-static` 覆盖网页端静态产物同步要求

---

## Key File Findings

### `frontend/src/features/immersive/ImmersiveLessonPage.jsx`
- 单文件 128KB，承担状态、播放、副作用、UI、快捷键和上一句词选逻辑。
- 存在两套快捷键分发：`window` 级 `onWindowKeyDown` 和页面内 `handleKeyDown`。
- 目前全屏入口 `enterCinemaFullscreen()` 会主动 `setShowFullscreenPreviousSentence(false)`。
- 上一句区域当前右侧主操作仍是“加入生词本”，没有用户要求的单个喇叭回听入口。

### `frontend/src/features/immersive/useSentencePlayback.js`
- 已有播放起止、暂停继续和速率计划步骤执行能力。
- 目前支持 `playbackPlan.initialRate + rateSteps`，适合改造成“固定基础速率 + 可选无额外速率步骤”的执行模型。

### `frontend/src/features/immersive/learningSettings.js`
- 已经保存快捷键、`showFullscreenPreviousSentence` 和 `translationMask`。
- 目前 `playbackPreferences` 只有 `autoReplayAnsweredSentence`，没有 `singleSentenceLoopEnabled`。
- 现有 `DEFAULT_STANDARD_TAIL_RATES` 和 `resolveReplayAssistance()` 仍在控制听感速率。

### `frontend/src/app/learning-shell/LearningShellPanelContent.jsx` / `LearningShellContainer.jsx`
- 沉浸页通过 `immersiveLayoutActive` 切到同一 learning shell 下渲染。
- `loadLessonDetail(lessonId, { autoEnterImmersive: true })` 已是进入沉浸学习的主入口，不需要新增页面层级。

### Current Test Baseline
- 当前没有任何专门覆盖 `ImmersiveLessonPage` 的 contract test 或 frontend unit test。
- 与学习壳直接相关的现有契约只出现在 `tests/contracts/test_desktop_runtime_contract.py`，范围不足以锁住本阶段行为。

---

## Anti-Patterns to Avoid

- **不要引入新的全局 store 来替代局部状态机。** 这个阶段的问题是单页内部状态迁移，不是跨页面共享状态不足。
- **不要同时保留“固定倍速”和“隐藏尾段减速”两套主速度系统。** 这会让用户无法预测当前速度到底由谁决定。
- **不要把 fullscreen / 遮挡板 / 上一句显示切换写成会重置输入或句子索引的 shortcut。**
- **不要通过新增另一个“普通模式控制面板”来解决全屏控件需求。** 用户心智已经锁定全屏答题板块为主路径。
- **不要只改 `frontend/src` 而忽略 `app/static`。** 这是本项目对网页端交付的硬约束。

---

## Common Pitfalls

### Pitfall 1: reducer 抽出来了，但副作用仍然散落
**What goes wrong:** 文件拆多了，真实状态迁移仍然靠组件里的 `setState` 链。
**Why it happens:** 只抽常量和 helper，没有把事件模型也统一。
**How to avoid:** 明确 reducer event 名称，并让重播、跳句、暂停继续、答后回放、loop 切换都通过统一 dispatch 入口进入。

### Pitfall 2: 固定倍速被旧 replay assistance 偷偷覆盖
**What goes wrong:** UI 上选了 `0.90x`，但重播时实际听到 `0.85x` 或 `0.95x`。
**Why it happens:** 旧的 `tailRate` 逻辑仍然参与生成 `playbackPlan`。
**How to avoid:** 把 reveal 辅助和 audible playback rate 分离；固定倍速是唯一可听速率来源。

### Pitfall 3: 全屏 / 遮挡板逻辑继续重置学习态
**What goes wrong:** 进入全屏或拖动遮挡板后，上一句显示被重置、输入态丢失或句子播放重新开始。
**Why it happens:** 显示层副作用直接调用了学习态 setter。
**How to avoid:** 对显示层交互建立白名单，只允许触碰 UI preference state，不允许碰 session state。

### Pitfall 4: 契约测试只锁文案，不锁禁止回归的逻辑
**What goes wrong:** 按钮文案在，但实现又偷偷恢复了 `setShowFullscreenPreviousSentence(false)` 这类错误。
**Why it happens:** contract test 只看“有什么”，不看“不该有什么”。
**How to avoid:** 同时断言存在的控件 / key 和禁止出现的旧重置逻辑。

---

## Code Examples

### Existing playback primitive

`frontend/src/features/immersive/useSentencePlayback.js` 已有稳定的播放 API：

```js
return {
  isPlaying,
  isPlaybackPaused,
  currentPlaybackRate,
  playSentence,
  stopPlayback,
  togglePausePlayback,
  onMainMediaTimeUpdate,
};
```

这说明状态机只需要决定何时调用这些动作，不必重写播放器。

### Existing fullscreen reset risk

当前 `enterCinemaFullscreen()` 里存在直接重置上一句显示偏好的语句：

```js
setShowFullscreenPreviousSentence(false);
```

这是 Phase 8 必须移除或改造的显示层副作用。

### Existing immersive shell entry

学习壳已经有 canonical 入口：

```js
await loadLessonDetail(lessonId, { autoEnterImmersive: true });
```

因此 Phase 8 不需要新增 route，只需要稳定沉浸页内部状态合同。

---

## Validation Architecture

Phase 8 的验证应围绕三件事建立：

1. **状态合同存在且集中**
   - 新的本地状态机 / reducer 模块存在。
   - `ImmersiveLessonPage.jsx` 通过统一事件入口消费它，而不是继续散落 `setState` 链。

2. **用户锁定行为被编码**
   - 单句循环开关可持久化。
   - 固定倍速只有 `0.75x / 0.90x / 1.00x`。
   - 上一句喇叭按钮存在，并且全屏 / 遮挡板不再重置状态。

3. **网页端交付闭环完成**
   - `npm --prefix frontend run build` 通过。
   - `npm --prefix frontend run build:app-static` 通过并同步到 `app/static`。
   - 新 contract tests 能锁住 Phase 8 的关键交互合同。

---

## Sources

### Primary (HIGH confidence)
- `.planning/workstreams/milestone/phases/08-immersive-learning-refactor/08-CONTEXT.md`
- `.planning/workstreams/milestone/ROADMAP.md`
- `.planning/workstreams/milestone/REQUIREMENTS.md`
- `.planning/research/SUMMARY.md`
- `.planning/research/STACK.md`
- `frontend/src/features/immersive/ImmersiveLessonPage.jsx`
- `frontend/src/features/immersive/useSentencePlayback.js`
- `frontend/src/features/immersive/learningSettings.js`
- `frontend/src/app/learning-shell/LearningShellPanelContent.jsx`
- `frontend/src/app/learning-shell/LearningShellContainer.jsx`
- `tests/contracts/test_desktop_runtime_contract.py`
- `tests/e2e/test_e2e_key_flows.py`

### Secondary (MEDIUM confidence)
- `frontend/package.json`

---

## Metadata

**Research scope:**
- Core technology: React 18 local state management in a shared frontend shell
- Codebase surface: immersive player, learning settings, shell entry, existing tests
- Risks explored: hidden speed logic, fullscreen side effects, missing regression coverage

**Confidence breakdown:**
- State decomposition recommendation: HIGH
- Speed/loop recommendation: HIGH
- Validation strategy: HIGH

**Research date:** 2026-03-28
**Valid until:** 2026-04-27

---

*Phase: 08-immersive-learning-refactor*
*Research completed: 2026-03-28*
*Ready for planning: yes*
