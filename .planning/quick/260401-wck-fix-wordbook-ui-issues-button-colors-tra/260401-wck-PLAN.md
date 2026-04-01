# Quick Plan: 260401-wck-fix-wordbook-ui-issues-button-colors-tra

**Task:** Fix wordbook UI issues: button colors, translation, pronunciation, player button
**Mode:** quick (discuss)
**Date:** 2026-04-01

## Tasks

### Task 1: 统一复习按钮样式

**Files:** `frontend/src/features/wordbook/WordbookPanel.jsx`

**Action:**
1. 找到 `variant={action.grade === "good" ? "default" : "outline"}` 代码
2. 改为全部使用 `variant="outline"`

**Verify:** 四个按钮都是白色边框样式

**Done:** when all four review buttons have same outline style

---

### Task 2: 确保播放器按钮显示并修改文字

**Files:** `frontend/src/features/wordbook/WordbookPanel.jsx`

**Action:**
1. 检查 `reviewItem.source_lesson_id` 条件判断
2. 如果为空，尝试用 `reviewItem.source_lesson_id` 或 fallback 到一个可用的 lesson_id
3. 将按钮文字从"查看课程"改为"播放课程"
4. 将图标从 `ExternalLink` 改为 `Play`

**Verify:** 复习模式下卡片右上角有"播放课程"按钮

**Done:** when "播放课程" button is visible in review mode

---

### Task 3: 改进翻译显示

**Files:** `frontend/src/features/wordbook/WordbookPanel.jsx`

**Action:**
1. 检查 `reviewItem.latest_sentence_zh` 是否已显示
2. 确保翻译在词条文本下方清晰显示

**Verify:** 词条翻译在复习卡片中清晰可见

**Done:** when translation is clearly visible in review card

---

## Must-Haves (from discuss)

- [ ] 所有复习按钮统一为白色轮廓样式
- [ ] "播放课程"按钮在复习模式下可见
- [ ] 翻译文字清晰显示
