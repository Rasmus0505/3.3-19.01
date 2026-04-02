# Phase 20: wordbook-entry-enhancements - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

生词本每个词条展示完整的翻译和发音信息，用户可独立查看翻译和播放发音。

</domain>

<decisions>
## Implementation Decisions

### 卡片结构（上下堆叠）
- 布局顺序（从上到下）：单词 → 翻译区块 → 例句
- **注意**：翻译在单词下方，不是单词上方
- 结构：单词+发音按钮 → 翻译区块 → 语境信息

### 翻译区块样式
- 独立视觉区块：浅色背景（如 `bg-muted/20`）
- 明确区域边界，与其他内容清晰分隔
- 独立区块让翻译文字有独立的视觉焦点

### 卡片高度策略
- 自适应最小高度（`min-h-[4rem]` 或类似）
- 内容超出时自动调整高度，不截断、不滚动
- 卡片高度不一致是可以接受的，因为内容本身长短不同

### 发音按钮
- 图标：`Volume2`（lucide-react）
- 动态定位：紧挨单词尾部，不是常驻容器最右侧
- 实现：flex + flex-wrap，播放按钮跟在单词文本后面

### 发音状态处理
- 点击后按钮显示 `Loader2` spinner（加载中）
- 发音结束后恢复正常
- 失败时短暂显示错误态（如红色感叹号），几秒后恢复
- 不静默失败

### 发音来源
- 主要方案：Web Speech API（`window.speechSynthesis.speak()`，lang='en-US'）
- 无额外 API 成本，浏览器原生支持
- 备选：句子 `audio_url`（sentence-level）

### 语境信息
- 保留现有语境显示：英文语境、中文语境、下次复习时间等
- 语境在翻译区块下方，与 Phase 17/18 风格一致

### Claude's Discretion
- 具体翻译区块背景色（`bg-muted/20` vs 其他）
- 卡片最小高度具体值
- 发音按钮的尺寸和间距
- 错误态的具体样式（图标、颜色、持续时间）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Wordbook Frontend
- `frontend/src/features/wordbook/WordbookPanel.jsx` — 列表视图主组件，当前展示词条卡片
- `frontend/src/features/wordbook/TranslationDialog.jsx` — 翻译对话框参考
- `frontend/src/features/wordbook/FloatingToolbar.jsx` — 批量操作工具栏参考

### Wordbook Backend
- `app/models/lesson.py` — `WordbookEntry` 模型，`word_translation` 字段定义
- `app/services/wordbook_service.py` — 词条收集逻辑，`translate_to_zh` 调用
- `app/api/routers/wordbook.py` — 词条 API 端点

### Prior Phase Context
- `.planning/workstreams/milestone/phases/17-wordbook-review-improvements/17-CONTEXT.md` — 复习入口和掌握度反馈决策
- `.planning/workstreams/milestone/phases/18-wordbook-management-improvements/18-CONTEXT.md` — 批量操作和翻译决策
- `.planning/workstreams/milestone/phases/17-wordbook-review-improvements/17-UI-SPEC.md` — 视觉风格规范（shadcn 组件、颜色、间距）

### Requirements
- `.planning/REQUIREMENTS.md` §WB-01, WB-02 — 生词本词条增强需求定义

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Tooltip` + `TooltipContent` 组件：已在 WordbookPanel 中使用，复习按钮轻提示系统已建立
- `TranslationDialog` 组件：局部翻译弹窗，可参考状态管理模式
- `Loader2` (lucide-react)：已用于删除按钮的加载态

### Established Patterns
- 词条数据从 `/api/wordbook` 获取，返回 `WordbookEntryResponse` 结构
- 每个词条已有 `word_translation` 字段（存储翻译）、`entry_text`（单词）
- `busyEntryId` 状态控制加载态，可复用此模式
- shadcn Card 系列组件已在生词本中使用

### Integration Points
- `WordbookPanel.jsx` 的列表视图（`panelMode === "list"`）中的词条卡片是主要修改目标
- 复习视图（`panelMode === "review"`）中的词条卡片也需要同步增强（保持一致性）
- 发音功能在列表和复习两种模式下都可用

</code_context>

<specifics>
## Specific Ideas

1. **发音按钮动态定位**：在单词文本右侧自然跟随，文字多时按钮位置随文字长短动态变化，不固定在容器最右侧
2. **翻译区块背景**：使用与卡片背景有区分的浅色背景（如淡蓝/淡灰），视觉上形成独立区块感
3. **卡片结构示意**：
   ```
   ┌───────────────────────────────────────┐
   │  serendipity 🔊                       │  ← 单词 + 动态发音按钮
   ├───────────────────────────────────────┤
   │  意外之喜；巧合                        │  ← 翻译区块（浅背景）
   ├───────────────────────────────────────┤
   │  英文语境：It was pure serendipity... │
   │  下次复习：明天 14:30                 │
   └───────────────────────────────────────┘
   ```

</specifics>

<deferred>
## Deferred Ideas

- 暂无

</deferred>

---

*Phase: 20-wordbook-entry-enhancements*
*Context gathered: 2026-04-02*