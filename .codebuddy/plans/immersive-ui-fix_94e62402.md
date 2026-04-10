---
name: immersive-ui-fix
overview: 修复 immersive 页面拼写区宽度问题、移除冗余文案、确保页面一屏显示
todos:
  - id: fix-typing-width
    content: 修复 immersive.css 中 .immersive-typing 的 max-width 并添加 workbench 宽度覆盖
    status: completed
  - id: remove-typing-text
    content: 删除 TypingPanel.jsx 中"拼写"标签和等待播放提示文案
    status: completed
  - id: reduce-spacing
    content: 减小 workbench 模式下 typing padding/gap 和 word-row-frame min-height
    status: completed
    dependencies:
      - fix-typing-width
  - id: clean-video-text
    content: 删除 VideoPanel.jsx 音频/降级模式的 hint 子文案
    status: completed
  - id: clean-explanation-text
    content: 精简 ExplanationSidebarContent.jsx 空状态文案
    status: completed
---

## 产品概述

修复 Immersive 沉浸学习页面中拼写区的布局和文案问题，使页面一屏完整显示。

## 核心需求

1. **拼写区宽度与视频对齐** — 修复拼写区右侧莫名空白，确保宽度与上方视频一致
2. **移除"等待播放结束"文案** — 删除"输入已完成，等待本句播放结束。"提示，用户已知视频在播放
3. **清理多余文案** — 删除"拼写"标签、精简音频/降级模式提示文字、精简讲解区空状态文案
4. **一屏显示** — 确保整个 immersive 页面无需滚动即可完整显示

## 技术栈

- 前端框架: React + JSX
- 样式: 纯 CSS (immersive.css, 约3058行)
- 当前布局模式: `immersive-layout--workbench`（左右两列，左列视频+拼写 flex 6:4）

## 实现方案

### 问题1：拼写区右侧空白

**根因**: `.immersive-typing` 的 `max-width: 100vw`（immersive.css 第170行）会以视口宽度为基准，当父容器有 padding 或处于 flex 布局中时，100vw 可能超出父容器实际宽度，导致右侧空白。

**修复**:

- 将 `.immersive-typing` 的 `max-width: 100vw` 改为 `max-width: 100%`
- 在 workbench 模式覆盖中显式设置 `max-width: 100% !important` 和 `width: 100% !important`

### 问题2：等待播放结束文案

**修复**: 直接删除 TypingPanel.jsx 中第177-179行的 `waitingForInitialPlayback` 提示块。变量定义（ImmersiveLessonPage.jsx:1968）保留，仅删除 UI 渲染。prop 传递可保留，不影响逻辑。

### 问题3：多余文案清理

- 删除 TypingPanel.jsx 第175行的"拼写"标签
- 删除 VideoPanel.jsx 音频模式的 hint 子文案（第116行）
- 删除 VideoPanel.jsx 降级模式的 hint 子文案（第136行）
- 精简 ExplanationSidebarContent.jsx 空状态文案，去掉英文部分

### 问题4：一屏显示

- 减小 workbench 模式下 `.immersive-word-row-frame` 的 `min-height`（从 124px 减至 80px）
- 减小 workbench 模式下 `.immersive-typing` 的 padding（从 18px 减至 14px）和 gap（从 16px 减至 12px）

## 修改文件清单

```
d:/3.3-19.01/frontend/src/features/immersive/
├── TypingPanel.jsx          # [MODIFY] 删除"拼写"标签和等待播放提示
├── immersive.css            # [MODIFY] 修复宽度、减小间距和min-height
├── VideoPanel.jsx           # [MODIFY] 删除音频/降级模式hint子文案
└── ExplanationSidebarContent.jsx  # [MODIFY] 精简空状态文案
```

## 实现细节

### TypingPanel.jsx 修改

- 删除第175行: `<span className="immersive-typing__label">拼写</span>`
- 删除第177-179行: 整个 `waitingForInitialPlayback` 条件渲染块

### immersive.css 修改

1. 第170行: `max-width: 100vw` → `max-width: 100%`
2. 第2795-2805行 workbench `.immersive-typing` 覆盖中:

- 添加 `max-width: 100% !important;` 和 `width: 100% !important;`
- padding 从 `18px` 减至 `14px`
- gap 从 `16px` 减至 `12px`

3. 第2846-2848行 workbench `.immersive-word-row-frame`:

- `min-height: 124px` → `min-height: 80px`

### VideoPanel.jsx 修改

- 第116行: 删除 `<p className="immersive-hint">主舞台保留节奏感，拼写任务放到底部 Dock 完成。</p>`
- 第136行: 删除 `<p className="immersive-hint">媒体不可用，已切换到逐句播放与底部拼写任务。</p>`

### ExplanationSidebarContent.jsx 修改

- 第65行: `"当前句没有需要讲解的表达。Expressions above your current level will appear here."` → `"当前句没有需要讲解的表达。"`

## 注意事项

- `waitingForInitialPlayback` 变量和 prop 传递保留不动，只删除 UI 显示，不影响状态机逻辑
- 课程完成提示（`课程已完成，恭喜你！`）和评测中提示（`评测中...`）保留，它们有实际反馈意义
- mediaError 提示保留，这是错误状态必要的用户反馈