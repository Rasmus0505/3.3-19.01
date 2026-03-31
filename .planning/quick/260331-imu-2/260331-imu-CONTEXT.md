# Quick Task 260331-imu: 听写入口轻提示：仅保留快捷键行并置顶，增加首页修改说明，2秒自动消失 - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

## Task Boundary

- 删除沉浸学习入口半透明卡片内三行文案：「进入学习」「直接敲键盘开始听写」「当前是听写模式」。
- 仅保留三条快捷键提示（揭示单词 / 重播 / 下一句，随用户配置动态显示），并置于卡片上方区域。
- 快捷键行下方增加一行说明：「快捷键可在首页修改」。
- 保留「用户开始输入（含退格）时关闭 overlay」；新增「展示满 2 秒后自动关闭」。

## Implementation Decisions

### 计时与输入关闭的交互

- 两种关闭方式并存：任一先发生即关闭；2 秒定时器在 `showEntryHintOverlay` 为 true 时启动，卸载或隐藏时清除。

### 文案与路由用语

- 说明句采用用户指定文案「快捷键可在首页修改」，与产品内「历史记录页顶部」学习参数入口语义一致，不另改措辞。

### Claude's Discretion

- 使用 `setTimeout(2000)` + cleanup 实现自动消失；移除仅用于该 overlay 的 `getImmersivePhaseLabel` 辅助函数。

## Specific Ideas

- 实现位置：`ImmersiveLessonPage.jsx` 中 `immersive-entry-hint` 区块与 `immersive.css` 样式。

## Canonical References

No external specs — requirements fully captured in decisions above.
