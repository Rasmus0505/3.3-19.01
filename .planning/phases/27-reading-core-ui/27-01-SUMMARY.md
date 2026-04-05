# Phase 27 Summary — 阅读板块核心 UI

## 概述

Phase 27 基于 Phase 26 的 Pretext CEFR 测量基础设施，在 `frontend/src/features/reading/` 下构建阅读板块核心 UI：方案 A 布局（文章主体 + 右侧词边栏）、CEFR 着色的词渲染、响应式断点。`npm run build` 通过，0 linter 报错。

---

## 完成的任务

### Task 1 — 目录结构 + 路由集成

- `features/reading/` 目录建立（4 个新文件）
- `/reading` 路由注册到 `panelRoutes.js`
- Sidebar「阅读」菜单项（使用 `BookOpenText` icon）
- `ReadingPage` 通过 `lazy()` 懒加载接入 `LearningShellPanelContent`

**文件**：
- `frontend/src/app/learning-shell/panelRoutes.js` — 添加 `reading` 条目
- `frontend/src/app/learning-shell/LearningShellSidebar.jsx` — 添加 `reading` 到 `PANEL_ITEMS`
- `frontend/src/app/learning-shell/LearningShellPanelContent.jsx` — `lazy()` + `reading` 分支

### Task 2 — ArticlePanel 主体渲染

- `useRichLayout` hook 集成：传入 `text`、`measuredWidth`、`"18px Inter"`、`30px` 行高
- `RichLine[]` 渲染为 `<div class="article-line">` flex 行，每行 `<span>` 逐词渲染
- `ResizeObserver` 监听容器宽度，宽度变化时触发 `useRichLayout` 重新布局
- VocabAnalyzer 加载中显示 skeleton shimmer；加载失败显示错误提示

**文件**：`frontend/src/features/reading/ArticlePanel.jsx`

### Task 3 — CEFR 词着色 CSS

- 复刻 `CefrBadge.jsx` 的 `computeCefrClassName(wordLevel, userLevel)` 逻辑（避免跨模块循环依赖）
- CEFR 三色态：
  - `.cefr-i-plus-one` → teal 下划线 `oklch(0.75 0.16 175)`
  - `.cefr-above-i-plus-one` → red 下划线 `oklch(0.58 0.24 25)`
  - `.cefr-mastered` → 透明下划线 + 灰色文字
- hover `translateY(-1px)` 悬浮效果；`onWordClick` 回调接口暴露

**文件**：`frontend/src/features/reading/reading.css`

### Task 4 — WordSidebar 组件 + ReadingPage 整合

- `WordSidebar` 受控组件：接收 `selectedWords[]`、`onRemove`、`onAddAllToWordbook`
- 桌面：280px 固定右侧边栏（`position: sticky`）
- 移动端（≤900px）：flex 纵向堆叠，边栏置底
- 空状态引导文案 + hover `translateX(2px)` 效果
- 边栏 item CEFR 徽章（teal/red/gray 三色）
- `ReadingPage` 状态提升：词选 toggle 逻辑、选中态背景提示

**文件**：
- `frontend/src/features/reading/WordSidebar.jsx`
- `frontend/src/features/reading/ReadingPage.jsx`

### Task 5 — Demo 文章 + 边界态 + Build 验证

- 约 400 词的真实英文文章（"The Art of Reading in a Digital Age"）
- VocabAnalyzer 加载失败降级（所有词显示 mastered 态）
- `selectedWords.length > 20` 边栏自动滚动
- `onAddAllToWordbook` → `console.warn`（Phase 28 实现 API）
- `npm run build` 通过，生成独立 chunk：
  - `ReadingPage-BJBqih-q.js` 31.75 kB
  - `ReadingPage-Cgbz_PFW.css` 3.85 kB
  - `WordSidebar-QfR5Wj4e.js` 1.81 kB

---

## 关键设计决策

1. **方案 A 布局**：flex 横向布局，`ResizeObserver` 动态测量内容区宽度（桌面约 640px，移动端自适应）
2. **CEFR 三色方案**：复用沉浸式页面的 oklch 颜色语义，i+1=teal，above-i+1=red，mastered=gray
3. **CEFR 计算逻辑内联**：`computeCefrClassName` 直接复制到 `ArticlePanel.jsx`（而非依赖 `CefrBadge.jsx`），避免懒加载组件的循环依赖问题
4. **边栏受控模式**：`selectedWords` 状态提升到 `ReadingPage`，`WordSidebar` 纯展示
5. **响应式断点**：900px，≤900px 自动切换为堆叠布局
6. **懒加载**：`ReadingPage`、`ArticlePanel`、`WordSidebar` 全部使用 `lazy()` 接入，不增加首屏负担

---

## Phase 28 入口

Phase 28 将基于本阶段建立的 `onWordClick` 接口，实现：
- 词选入时的 scale 动画反馈（`1.0 → 1.08`，200ms ease-out）
- 批量加入生词本 API 调用（POST `/api/wordbook/batch`）
- 多选态 UI（check 徽章叠加）
- 词汇表弹窗（释义查看、发音）

---

## 交付物清单

| 文件 | 说明 |
|------|------|
| `frontend/src/features/reading/ReadingPage.jsx` | 阅读板块根组件，状态提升管理 |
| `frontend/src/features/reading/ArticlePanel.jsx` | 文章主体 + `useRichLayout` 集成 |
| `frontend/src/features/reading/WordSidebar.jsx` | 词边栏受控组件 |
| `frontend/src/features/reading/reading.css` | 全部阅读板块样式 |
| `frontend/src/app/learning-shell/panelRoutes.js` | 添加 `/reading` 路由 |
| `frontend/src/app/learning-shell/LearningShellSidebar.jsx` | 添加「阅读」菜单项 |
| `frontend/src/app/learning-shell/LearningShellPanelContent.jsx` | 懒加载 `ReadingPage` |
| `.planning/phases/27-reading-core-ui/27-01-PLAN.md` | 执行计划 |
| `.planning/ROADMAP.md` | 更新 Phase 27 为 Complete |

---

## Bug 修复

- Phase 26 的 `useRichLayout.ts` 中 `@/utils/vocabAnalyzer` 路径在 Vite build 时无法解析，已修复为相对路径 `../utils/vocabAnalyzer`

---

*Phase 27 完成: 2026-04-05*
