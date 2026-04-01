# Quick Task 260401-wck: Fix wordbook UI issues - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Task Boundary

修复生词本 UI 问题：
1. 复习按钮样式统一为白色轮廓
2. 添加短语/单词翻译显示
3. ~~发音播放~~（用户说后面专门做）
4. 播放器按钮改为"播放课程"，确保在复习模式下可见

</domain>

<decisions>
## Implementation Decisions

### 按钮样式
- 统一改为白色轮廓，不保留黑色高亮

### 发音播放
- 跳过，用户说后面专门做

### 播放器按钮
- 改为"播放课程"文字
- 确保在复习模式的卡片中显示
- 需要排查 source_lesson_id 为空的问题

### 翻译显示
- 在复习模式卡片中显示当前句子的翻译（已有 latest_sentence_zh）
- 检查是否有词条本身的翻译字段

</decisions>

<specifics>
## Specific Ideas

1. 按钮颜色问题：WordbookPanel.jsx 中 "good" grade 使用 variant="default"，其他使用 variant="outline"
2. 播放器按钮：只在 source_lesson_id 存在时显示，但可能词条创建时 latest_lesson_id 没正确保存
3. 翻译显示：reviewItem.latest_sentence_zh 已存在但显示位置不明显

</specifics>

<canonical_refs>
## Canonical References

- frontend/src/features/wordbook/WordbookPanel.jsx
- app/services/wordbook_service.py

</canonical_refs>
