# Quick Task 260331-qnj: 允许沉浸式学习和管理台数字输入框清空后重输，并为倍速输入框增加0.25步进内嵌上下调节按钮 - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

## Task Boundary

- 沉浸式学习页的“跳转到指定句子”输入框允许先清空再重新输入，不能在删除到空白时立刻回填当前句号。
- 输入 `0` 时按“跳转第一句”处理，而不是视为非法值。
- 倍速输入框右侧增加内嵌式上下调节按钮，单次步进 `0.25`，不扩大整组控件体积。
- 学习参数这类数字配置页也要允许空白草稿态，避免用户从已有数字改新数字时被即时回填。

## Implementation Decisions

### 句子跳转输入的空白态

- 用“是否处于编辑态”区分展示值与默认回显值；未编辑时仍显示当前句号，编辑中允许保留空字符串。

### `0` 的语义

- `0` 归一化到第一句；负数和非数字仍按非法输入处理并回到当前句号。

### 配置页数字输入的中间态

- 仅取消本地编辑态里的即时 sanitize，让空字符串先留在组件状态里；真正写入存储时继续走既有 sanitize 兜底。

### 倍速调节按钮形态

- 采用输入框内嵌的窄型上下按钮列，点击即按 `0.25` 步进提交倍速，保留现有倍速文本输入能力。

## Specific Ideas

- 主要修改：`frontend/src/features/immersive/ImmersiveLessonPage.jsx`、`frontend/src/features/immersive/immersive.css`、`frontend/src/features/lessons/LessonList.jsx`

## Canonical References

No external specs — requirements fully captured in decisions above.
