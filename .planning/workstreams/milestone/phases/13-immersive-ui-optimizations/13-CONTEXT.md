---
phase: 13
name: 沉浸学习前端交互优化
status: ready
gathered: 2026-03-31
source: 对话确认
---

<domain>
## Phase Boundary

对 `frontend/src/features/immersive/ImmersiveLessonPage.jsx` 和 `immersive.css` 做 5 个小而精确的交互优化，均为样式/行为调整，不涉及架构改动。
</domain>

<decisions>
## Implementation Decisions

### 需求 1：加入生词本不触发重播 + 答题区上方悬浮提示
- **当前行为：** 点击"加入生词本"按钮后，`collectWordbookEntry` 成功回调中调用 `onWordbookChanged`，可能触发画面跳转/重播
- **目标行为：** `collectWordbookEntry` 成功后显示轻量悬浮提示（1.5 秒自动消失），**不触发任何播放跳转**
- **实现方案：**
  - 在组件 state 中增加 `wordbookToastShown`（boolean）和 `wordbookToastTimerRef`（timer ref）
  - `collectWordbookEntry` 成功时：清除旧 timer → 显示 toast → 1.5s 后隐藏
  - 移除 `onWordbookChanged?.()` 调用（或替换为仅刷新 wordbook 计数 UI，不触发会话跳转）
  - 悬浮提示文案：`已加入生词本`（`toast.success` 即可，不需要额外自定义组件）
  - 提示出现位置：答题区（wordbook 区域）正上方

### 需求 2：加入生词本按钮文案更黑
- **当前实现（line 3630-3649）：**
  ```jsx
  <Button type="button" size="sm" variant="outline" className="shrink-0" ...>
    {wordbookBusy ? "加入中..." : "加入生词本"}
  </Button>
  ```
- **目标：** 文案颜色加黑
- **实现方案：** 在 Button 的 `className` 中增加 `text-foreground` 或直接覆盖 `cn-button-variant-outline` 的文字颜色
  ```jsx
  className="shrink-0 text-foreground"
  ```

### 需求 3：句子跳转/倍速输入框可手动输入
- **当前问题：** `type="number"` 的 input 有浏览器默认 spinners（上下箭头），影响手动输入体验
- **当前实现（line 3471-3482，句子跳转）和（line 3514-3526，倍速）：**
  ```jsx
  // 句子跳转
  <input type="number" className="... appearance-none" style={{ MozAppearance: "textfield" }} .../>
  // 倍速
  <input type="number" className="immersive-session-rate-input" .../>
  ```
- **实现方案：** 隐藏所有浏览器 number spinners（`-moz-appearance: textfield` 已加在句子跳转，但倍速漏了）
  ```css
  /* immersive.css 或行内 style */
  /* Webkit (Chrome/Safari/Edge) */
  input[type="number"]::-webkit-inner-spin-button,
  input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; }
  /* Firefox */
  input[type="number"] { -moz-appearance: textfield; }
  /* 已在句子跳转上：style={{ MozAppearance: "textfield" }} */
  /* 需要对倍速 input 也加上同等样式 */
  ```

### 需求 4：倍速/重置/固定按钮与左边隔开
- **当前布局（line 3485-3540）：**
  ```jsx
  <div className="immersive-session-controls" aria-label="沉浸学习控制">
    {/* 上一句 下一句 精听 */}
    {/* 倍速 input */}
    <button>重置</button>
    <button>固定</button>
  </div>
  ```
- **目标：** 倍速 input、重置、固定 三个元素与左侧的上/下一句、精听按钮有视觉分隔
- **实现方案：** 在 `immersive-session-controls` 中的倍速 label 前加分隔（margin-left）
  ```jsx
  <label className="immersive-session-rate-field" style={{ marginLeft: "8px" }}>
  ```

### 需求 5：喇叭按钮动态定位到文字末尾 + 只播放音频不跳转画面
- **当前行为：** 喇叭按钮（Volume2）固定在行尾，但文字过长时位置固定不变
- **目标行为：** 喇叭按钮跟随文字自然流到行末（inline-flex + flex-1）；点击只播放音频，不触发主媒体跳转
- **当前实现（line 3617-3627）：**
  ```jsx
  <div className="immersive-previous-sentence__row">
    <div className="... flex-1 ...">
      {/* token buttons */}
    </div>
    <button className="immersive-previous-sentence__speaker">Volume2</button>
  </div>
  ```
- **实现方案：**
  1. 移除 `<div className="immersive-previous-sentence__row">` 上的 `justify-content: flex-start` 固定，改为自然流
  2. `immersive-previous-sentence__speaker` 改为 `shrink-0`（已固定）—— 不需要改定位，保持在 flex 容器末尾
  3. **关键修复：** `requestInteractiveWordbookSentencePlayback` 点击时只播放音频 clip，不跳主媒体时间轴
     - 当前：调用 `requestInteractiveWordbookSentencePlayback` → 主媒体跳到对应句子时间点
     - 目标：只播放 audio clip（类似 `clipAudioRef.current?.play()`，不影响主媒体 `mediaElementRef`）
  4. 检查是否有现成的 clip 音频播放逻辑（`clipAudioRef` 存在于 line 931）
</decisions>

<canonical_refs>
## Canonical References

- `frontend/src/features/immersive/ImmersiveLessonPage.jsx` — 主组件（所有 5 个改动在此文件）
- `frontend/src/features/immersive/immersive.css` — 样式文件
- `frontend/src/components/ui/button.jsx` — shadcn Button 组件
- `frontend/src/components/ui/alert.jsx` — shadcn Alert（悬浮提示用）
</canonical_refs>

