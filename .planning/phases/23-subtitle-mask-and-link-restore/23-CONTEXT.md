# Phase 23: 字幕遮挡板与链接恢复 - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

调整沉浸学习中字幕遮挡板的位置记忆策略，并增强桌面客户端历史记录的链接恢复能力。遮挡板部分只涉及沉浸学习 `frontend/src/features/immersive/ImmersiveLessonPage.jsx` 和 `learningSettings.js`；链接恢复部分只涉及历史记录恢复入口 `frontend/src/features/lessons/LessonList.jsx` 和 `UploadPanel.jsx`。

**不在本阶段范围：** 遮挡板 UI 样式重做（仅调整记忆策略）；视频内容提取记录类型（Phase 22）；GenerationConfigModal 配置弹窗（Phase 22）。

</domain>

<decisions>
## Implementation Decisions

### 遮挡板位置记忆策略

**D-01（MASK-01）：新视频遮挡板水平居中，不记忆绝对位置**
- 每次进入新的 lesson（`lessonId` 改变）时，遮挡板自动恢复到**水平居中**
- 水平居中的计算基准：`videoElement.width * 0.58` 宽度，水平居中于视频容器内，距视频底部 `TRANSLATION_MASK_DEFAULT_BOTTOM_OFFSET_PX`（12px）
- 不记忆上次 lesson 的 x/y 绝对值，新 lesson 一律从居中开始

**D-02（MASK-01 补充）：遮挡板宽度自适应最新句子**
- 进入新 lesson 后，遮挡板宽度初始为 `TRANSLATION_MASK_DEFAULT_WIDTH_RATIO`（58% 视频宽）
- **每次句子切换时，自动将遮挡板宽度扩展到当前句子字幕的最宽值**（防止遮挡内容跑到答题区下方后拉不出来）
- 宽度只向上扩展（只变宽不变窄），直到 session 结束

**D-03（MASK-02）：遮挡板启用状态跨 lesson 记忆**
- `translationMask.enabled` 写入 `learningSettings.uiPreferences.translationMask.enabled`
- 用户关闭遮挡板后，换 lesson 时遮挡板保持关闭状态（`enabled !== true` 时 `useState` 读取到 false）
- 用户开启遮挡板后，换 lesson 时遮挡板保持开启状态
- Phase 8 D-12 的"跨课程记忆"约束**仅限于开关状态**，不扩展到位置

### 链接恢复入口

**D-04（MASK-04 链接部分）：统一恢复入口 + 内部区分**
- 历史记录菜单中，"恢复视频"为单一入口按钮
- 点击后根据 lesson 是否有 `source_url` 区分行为：
  - **有 source_url** → 弹窗二选一："恢复本地视频"（打开文件选择器）| "按链接恢复"（触发 yt-dlp 重新下载）
  - **无 source_url** → 直接打开文件选择器（当前行为不变）

**D-05（链接恢复行为）：先检查本地缓存再下载**
- 用户选择"按链接恢复"后，先检查本地 IndexedDB 缓存是否已有该 lesson 的媒体
- **有本地缓存** → 弹窗确认："本地已有视频，是否覆盖？"（Yes：覆盖，No：取消）
- **无本地缓存** → 直接触发 yt-dlp 下载流程
- 下载完成后覆盖当前 lesson 的媒体；下载失败时显示错误，不改变当前 lesson 状态

### Claude's Discretion

- 遮挡板宽度自适应的"只变宽不变窄"是否需要在 session 结束后重置为默认值（还是保持当前 session 内最宽值）
- 遮挡板恢复居中的具体触发时机：是在 `LearningShellContainer` 加载 lesson 时，还是在 `ImmersiveLessonPage` mount 时（需要确认 session 的定义边界）
- 链接恢复的"弹窗二选一"使用 `AlertDialog`、`Popover` 还是 `Sheet` 实现

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Immersive Learning Mask Persistence
- `frontend/src/features/immersive/ImmersiveLessonPage.jsx` — 遮挡板 `useState`、`normalizeTranslationMaskRect`、`resolveTranslationMaskRect`、`persistTranslationMaskPreference` 相关逻辑（主要修改面）
  - Line 925-932: `translationMaskEnabled` / `translationMaskRect` 的 `useState` 初始化（从 `readLearningSettings()` 读取）
  - Line 1540-1585: `resolveTranslationMaskRect` / `computeCenteredMaskRect` / `persistTranslationMaskPreference`（遮挡板位置计算和持久化）
- `frontend/src/features/immersive/learningSettings.js` — `DEFAULT_UI_PREFERENCES`、`sanitizeUiPreferences`、`writeLearningSettings`
  - Line 96: `TRANSLATION_MASK_LAYOUT_VERSION = 3`
  - Line 98-108: `DEFAULT_UI_PREFERENCES.translationMask`（enabled 默认为 true）
  - Line 566-593: `sanitizeUiPreferences`（版本检测 + 百分比归一化）

### Link Import History
- `frontend/src/features/lessons/LessonList.jsx` — 历史记录菜单和恢复入口（主要修改面）
  - Line 784-788: `openRestorePicker`（触发文件选择器）
  - Line 791-815: `submitRestore`（文件恢复提交逻辑）
  - Line 1193-1203: "恢复本地视频"按钮
- `frontend/src/features/upload/UploadPanel.jsx` — 链接导入恢复相关
  - `restoreSuccessSnapshot` / `restorePersistedTaskSnapshot`：lesson 恢复时的媒体状态重建

### Prior Phase Decisions
- `.planning/workstreams/milestone/phases/08-immersive-learning-refactor/08-CONTEXT.md` — Phase 8 D-12："字幕遮挡板的开关状态和拖拽后的位置都需要持久化，下次进入沉浸学习时恢复"（开关状态跨课记忆已锁定；位置记忆策略本次调整）
- `.planning/workstreams/milestone/phases/19-immersive-learning-bugfix/19-CONTEXT.md` — Phase 19 Bug 修复决策（不得破坏 Phase 8 reducer 状态机）
- `.planning/workstreams/milestone/phases/04-desktop-link-import/04-CONTEXT.md` — Phase 4 D-04~D-32 链接导入合同
- `.planning/workstreams/milestone/phases/21-material-import-ux-optimization/21-CONTEXT.md` — Phase 21 deferred："桌面客户端链接恢复（记住原始 URL，提供'按链接恢复'）" → 本次实现

### Project Requirements
- `.planning/ROADMAP.md` Phase 23 — Success Criteria（MASK-01/02）
- `.planning/PROJECT.md` — 约束：Immersive 架构必须保留 reducer 结构；Brownfield Preservation；Desktop Security Boundary

</canonical_refs>

<codebase_context>
## Existing Code Insights

### Reusable Assets
- `normalizeTranslationMaskRect`（Line ~150-170）：将存储的百分比（x/y/width/height 0-1）转换为像素 rect，是遮挡板居中恢复的现成接线点
- `resolveTranslationMaskRect`（Line ~1270-1282）：将 rect（像素值）转为 `style` 对象，驱动 CSS absolute 定位
- `persistTranslationMaskPreference`（Line ~1365-1375）：拖拽结束时写入 `writeLearningSettings`，可复用此函数写入居中位置
- `TRANSLATION_MASK_DEFAULT_WIDTH_RATIO = 0.58` 和 `TRANSLATION_MASK_DEFAULT_BOTTOM_OFFSET_PX = 12`：遮挡板默认尺寸常量，已有
- `LessonList.jsx` 的 `openRestorePicker` + `submitRestore`：现有恢复流程，只需在中间插入 URL 检测 + 弹窗分支逻辑
- IndexedDB 缓存检查：参考 `UploadPanel.jsx` 中的 `restorePersistedTaskSnapshot` 和 `restoreSavedSourceFile` 模式

### Established Patterns
- 遮挡板位置以**百分比**存储在 `uiPreferences.translationMask`（相对于视频容器），支持跨分辨率迁移
- `learningSettings` 通过 localStorage 持久化，`sanitizeUiPreferences` 有版本检测（`TRANSLATION_MASK_LAYOUT_VERSION`），版本不一致时清除位置
- Lesson 的 `source_url` 字段应已存在于 lesson 对象中（Phase 4/11 的 link import 会保存）；需要确认字段名称（`source_url` vs `sourceUrl`）

### Integration Points
- 遮挡板居中触发时机：`ImmersiveLessonPage` mount 时检测 lessonId 变化，调用 `setTranslationMaskRect(normalizeTranslationMaskRect(null))` 或新增 `resetMaskToCenter()` 逻辑
- 遮挡板宽度自适应：句子切换的 reducer action（`NAVIGATE_TO_SENTENCE`）触发副作用，计算当前句子字幕宽度并更新 `translationMaskRect.width`
- 链接恢复弹窗：可在 `LessonList.jsx` 中复用现有的 `AlertDialog` / `Dialog` 组件；弹窗内的两个按钮分别调用现有 `submitRestore`（文件路径）和新增 `submitLinkRestore`（yt-dlp URL）

</codebase_context>

<specifics>
## Specific Ideas

- 遮挡板水平居中示意：`left = (videoWidth - maskWidth) / 2`，宽度 `width = videoWidth * 0.58`，底部距 `bottom = 12px`
- 宽度自适应示意：每次 `NAVIGATE_TO_SENTENCE` 后，`maskWidth = max(currentMaskWidth, subtitleMaxWidth)`
- 链接恢复弹窗文案：
  - 标题："选择恢复方式"
  - "本地已有视频，是否覆盖？"（确认弹窗）
  - "按链接恢复" → yt-dlp 下载 → 成功后显示"视频已更新"

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 23-subtitle-mask-and-link-restore*
*Context gathered: 2026-04-03*
