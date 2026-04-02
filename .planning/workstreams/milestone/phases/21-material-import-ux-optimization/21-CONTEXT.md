# Phase 21: 素材导入 UX 优化 - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

优化 `frontend/src/features/upload/UploadPanel.jsx` 和 `frontend/src/features/lessons/LessonList.jsx` 中的素材导入界面。默认进入链接导入流程，文案精简无冗余，快捷键配置紧凑易览。

**不在本阶段范围：** GenerationConfigModal 配置弹窗（Phase 22）；生词本词条增强（Phase 20）；视频内容提取单独记录类型（Phase 22）；字幕遮挡板位置策略（Phase 23）。

</domain>

<decisions>
## Implementation Decisions

### 默认 Tab 选中
- **UPLOAD-01:** 默认选中"链接导入"Tab，而非"本地文件"Tab
- 修改：`UploadPanel.jsx:1795` 中 `useState(DESKTOP_UPLOAD_SOURCE_MODE_FILE)` → `useState(DESKTOP_UPLOAD_SOURCE_MODE_LINK)`

### 链接 Tab 文案精简
- **UPLOAD-02:**
  - "支持常见公开视频链接：YouTube、B站..." → 改为输入框 placeholder 文案（输入框已有 `placeholder` 属性，直接替换）
  - "仅支持公开单条链接..." → **移除**，不再显示此条说明
  - 底部仅保留 SnapAny 外链说明（"无法导入时可改用 SnapAny"，可点击跳转）
- SnapAny 链接保持可点击外链（`openSnapAnyFallback()` 逻辑不变）

### 自动填标题
- **UPLOAD-03:** 粘贴链接导入成功后，视频标题自动填入标题输入框
- **已确认在代码中实现**（`UploadPanel.jsx:3458, 3651`），无需额外开发
- 逻辑：用户已编辑过标题则不覆盖（`prev || payload.title`），用户从零开始则自动填入

### 快捷键配置紧凑布局
- **UPLOAD-04:**
  - 7 个快捷键 action 排列为两行紧凑网格
  - 第一行 4 个 action，第二行 3 个 action（居中或靠左排列均可）
  - 每行内部使用 `flex flex-row gap-x` 横向排列
  - **每张卡片宽度刚好包裹内容**，不使用固定宽度，不留多余空白
  - 每个 action 卡片结构不变：标签 + 当前按键 + 修改按钮（垂直方向）
  - 移除 `md:grid-cols-2 lg:grid-cols-3` 的大列宽网格，改为精确贴合内容的 flex 行
- 效果：7 个 action 约两行，比原来 4 行高度节省 50%，且不需要横向滚动

### Claude's Discretion
- 快捷键卡片宽度精确贴合内容的具体 CSS 写法（`w-fit`、`min-w-0`、还是其他）
- 第二行 3 个 action 的水平对齐方式（居中或靠左）
- SnapAny fallback 链接文字的具体措辞（是否保留"无法导入时"前缀）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Upload Panel
- `frontend/src/features/upload/UploadPanel.jsx` — UploadPanel 主组件，UPLOAD-01/02/03 的修改面
  - Line 1795: `useState(DESKTOP_UPLOAD_SOURCE_MODE_FILE)` 默认值（需改为 LINK）
  - Line 6836-6844: 链接 Tab 说明文案（需精简）
  - Line 3458: `setDesktopLinkTitle` 自动填标题（已实现）
  - Line 3650-3651: `setDesktopLinkTitle` 自动填标题（已实现）
  - `DESKTOP_LINK_PUBLIC_SUPPORT_MESSAGE` (Line 64): 需移除并转为 placeholder
  - `DESKTOP_LINK_PUBLIC_ONLY_MESSAGE` (Line 65): 需移除

### Lesson List / Shortcut Settings
- `frontend/src/features/lessons/LessonList.jsx` — 快捷键配置区域，UPLOAD-04 的修改面
  - Line 896-927: 快捷键配置 section（当前 grid-cols-3 三列网格）
  - `SHORTCUT_ACTIONS` (from `learningSettings.js`): 7 个 action ID 和标签

### Prior Phase Context
- `.planning/phases/20-wordbook-entry-enhancements/20-CONTEXT.md` — Phase 20 生词本词条增强决策
- `.planning/workstreams/milestone/phases/18-wordbook-management-improvements/18-CONTEXT.md` — Phase 18 批量操作和翻译决策
- `.planning/workstreams/milestone/phases/19-immersive-learning-bugfix/19-CONTEXT.md` — Phase 19 Bug 修复决策

### Requirements
- `.planning/REQUIREMENTS.md` §UPLOAD-01, UPLOAD-02, UPLOAD-03, UPLOAD-04 — 素材导入 UX 优化需求定义
- `.planning/ROADMAP.md` Phase 21 — 成功标准 4 条

</canonical_refs>

<codebase_context>
## Existing Code Insights

### Reusable Assets
- `DESKTOP_LINK_PUBLIC_SUPPORT_MESSAGE` 常量（Line 64）：目前是静态字符串，需要移除文字部分，提取平台列表作为 placeholder 候选项
- `DESKTOP_LINK_PUBLIC_ONLY_MESSAGE` 常量（Line 65）：整条移除
- SnapAny fallback 链接（Line 6839-6843）：保持不变
- `setDesktopLinkTitle` 逻辑（Line 3458, 3650-3651）：已完整实现 UPLOAD-03，无需修改

### Established Patterns
- 快捷键配置使用 `SHORTCUT_ACTIONS.map()` 遍历渲染，每个 action 的卡片结构固定
- UploadPanel 中使用 `cn()` 工具函数组合 Tailwind 类名
- `openSnapAnyFallback()` 函数已存在（Line ~7560），SnapAny 链接直接复用

### Integration Points
- `desktopSourceMode` 控制 Tab 选中状态，与 `handleDesktopSourceModeChange` 配合使用
- 快捷键配置 section 与学习设置其他区块共用同一 Dialog/Sheet，布局改动不应影响其他区块
- UPLOAD-01 的 `defaultTab` 改动仅影响 UploadPanel 的初始渲染状态，不影响运行时的 Tab 切换

</codebase_context>

<specifics>
## Specific Ideas

1. **快捷键两行布局示意：**
   ```
   [reveal_letter] [reveal_word] [previous] [replay]     ← 第一行，4 个
        [toggle_pause] [next] [extra_reveal]               ← 第二行，3 个，居中
   ```
   每张卡片 `w-fit` 或 `min-w-[具体值]`，刚好包裹内容，不留多余空白。

2. **链接 Tab 文案精简示意：**
   - 输入框 placeholder："粘贴公开单条视频链接，例如 https://www.youtube.com/watch?v=..."
   - 底部只保留：无法导入时可改用 [SnapAny]（可点击）

3. **两行 vs 一行：** 用户明确选择两行紧凑网格，不做单行 flex 横向滚动。

</specifics>

<deferred>
## Deferred Ideas

- GenerationConfigModal 配置弹窗 — Phase 22
- 视频内容提取单独记录类型（蓝色"课程"badge vs 琥珀色"内容提取"badge）— Phase 22
- 历史记录按类型过滤 — Phase 22
- 字幕遮挡板位置居中恢复 + 启用状态跨视频记忆 — Phase 23
- 桌面客户端链接恢复（记住原始 URL，提供"按链接恢复"）— Phase 22
- SnapAny 外链 fallback 体验优化 — 如有需求，归入 Phase 22 或更晚阶段

</deferred>

---

*Phase: 21-material-import-ux-optimization*
*Context gathered: 2026-04-02*
