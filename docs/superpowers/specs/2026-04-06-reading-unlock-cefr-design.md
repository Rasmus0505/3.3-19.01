# 阅读板块升级设计：Unlock 按钮 + CEFR 复核 + 双重渲染

**日期**：2026-04-06
**主题**：阅读板块交互升级
**状态**：草稿，待用户确认

---

## 1. 需求总览

### 当前状态 vs 理想状态

| 维度 | 当前 | 理想 |
|------|------|------|
| 提交按钮 | 「开始分析」文本按钮 | 「Unlock」紫色渐变按钮，醒目 |
| CEFR 复核 | 无，本地词典直接判定等级 | DeepSeek 先复核词典等级是否准确 |
| 原文渲染 | 所有高难度词都有 CEFR 下划线 | 仅 DeepSeek 判定为需要简化的词显示下划线 |
| 重写版渲染 | 所有词都有 CEFR 下划线 | 简化词显示黄色背景，无下划线 |
| 简化目标 | 不明确 | 简化为 i+1 等级，非最简化 |

---

## 2. DeepSeek CEFR 复核流程

### 2.1 触发时机

每次用户粘贴文章并点击 **Unlock** 后，前端立即在后台收集 `wordsToSimplify`（词典判定为 > i+1 的词），然后发给 `/simplify-words` 接口。

### 2.2 API 请求参数

```
sentence         — 用户粘贴的完整文章文本（原文）
words            — 词典判定为需要简化的词列表（按文章出现顺序，去重）
target_level     — 用户 i+1 等级（如用户 B1 → 目标 B2）
word_levels      — {word: level} 字典，DeepSeek 参考用
enable_thinking  — false（节省成本，用 DeepSeek-Fast）
```

### 2.3 DeepSeek 行为（后端 prompt 升级）

DeepSeek 对每个词做两步判断：

**Step 1 — 复核词典等级**
- 词典说这个词是 B2/C1，但 base form（如 `fixing` 的 base `fix`）是 A2
- 对于 i+1 学习者，base form 已掌握，不需要简化 → 返回 `""`

**Step 2 — 判断是否语境上真的需要简化**
- 即使词本身偏难，但所在语境中已经通过上下文暗示了词义
- 或该词的某个词性（名词/动词）已经是 i+1 等级 → 返回 `""`

**返回规则**
- 返回 `""`（空字符串）= 词典等级判定有误或语境已足够清晰，**不需要简化**
- 返回简化词 = 需要简化，**原文和重写版都标注**

### 2.4 返回值变化

```json
{
  "simplified_words": ["", "hate", "", "reading carefully"],
  "input_words": ["loathe", "escew", "fixing", "perusing"]
}
```

对应关系：`input_words[i]` 对应 `simplified_words[i]`：
- `""` → 词典等级过低，不需要简化，**不渲染下划线**
- 有值 → 确认需要简化，**渲染下划线**，并在重写版用黄色背景标记

---

## 3. 双重渲染方案

### 3.1 原文视图（原文章）

渲染规则：
- **有下划线 + CEFR 色**：DeepSeek 判定需要简化，且 `simplified_words[i] ≠ ""`
- **无特殊样式**：DeepSeek 判定不需要简化（返回 `""`）
- **hover tooltip**：显示该词的 DeepSeek 判定等级（如果有变化）

布局：原文渲染到 `ArticlePanel`，下划线颜色和当前一致（teal/red/gray）。

### 3.2 重写版视图（简化后文章）

渲染规则：
- **黄色背景块（暖黄 #FEF9C3）**：仅被简化替换的词
- **无下划线，无 CEFR 着色**：简化词本身不再标注 CEFR 等级
- **其余部分**：保持普通样式，无任何标记

实现方案：复用一个新组件 `RewrittenPanel`，布局与 `ArticlePanel` 相同，但：
- 每个 token 先判断是否为简化词（通过 `rewriteMappings` 查表）
- 是简化词 → `<span class="rewritten-word">简化词</span>`
- 不是 → `<span class="rewritten-word--normal">原文词</span>`

### 3.3 简化对照表（AnalysisPanel）

`rewriteMappings` 从 `{original, rewritten}` 升级为 `{original, rewritten, confirmed: bool}`：
- `confirmed: true` = DeepSeek 确认需要简化
- `confirmed: false` = 词典有标记但 DeepSeek 判定不需要简化

只在 `confirmed: true` 时显示在简化对照表。

---

## 4. Unlock 按钮升级

### 4.1 视觉规格

```
文案：        Unlock
样式：        紫色渐变背景（和上传素材页 Unlock 按钮一致）
图标：        <Unlock className="size-4" />
位置：        LeftPanel textarea footer，右侧
颜色：        primary（紫色渐变，和 btn-unlock 相同）
尺寸：        同 btn-unlock 规格
状态：        提交后显示 loading spinner
```

### 4.2 位置和上下文

- 仅在 `mode === "input"` 且 textarea 有内容时显示
- 点击后：
  1. 调用 `handleArticleSubmit(draft)`
  2. `mode` 切换为 `"reading"`
  3. 自动触发 `useReadingRewrite` → `/simplify-words` API
  4. 显示 `isRewriting` loading overlay

---

## 5. 实现计划

### Wave 1 — 按钮 + API

| 文件 | 改动 |
|------|------|
| `frontend/src/features/reading/LeftPanel.jsx` | 「开始分析」按钮 → Unlock 紫色按钮样式 |
| `app/api/routers/llm.py` | 升级 `/simplify-words` system prompt，增加"词典等级复核"说明 |

### Wave 2 — 原文 CEFR 下划线（按 DeepSeek 结果）

| 文件 | 改动 |
|------|------|
| `frontend/src/hooks/useReadingRewrite.js` | 传递 `user_level` 给 handleRewrite，升级 `rewriteMappings` 结构 |
| `frontend/src/features/reading/ReadingPage.jsx` | 传递 `userLevel` 到 `useReadingRewrite` |
| `frontend/src/features/reading/api/readingRewriteApi.js` | 传递 `word_levels` 到 `/simplify-words` |

### Wave 3 — 重写版黄色块渲染

| 文件 | 改动 |
|------|------|
| `frontend/src/features/reading/ArticlePanel.jsx` | 新增 `isRewritten` prop，渲染时判断 |
| `frontend/src/features/reading/LeftPanel.jsx` | `isRewritten` 传入 ArticlePanel |
| `frontend/src/features/reading/reading.css` | `.rewritten-word` 黄色背景样式 |

---

## 6. 技术细节

### 6.1 rewriteMappings 升级

```javascript
// 当前
rewriteMappings = [{ original: "eschew", rewritten: "avoid" }]

// 升级后
rewriteMappings = [{
  original: "eschew",       // 原文词
  rewritten: "avoid",       // 简化后词
  confirmed: true,          // DeepSeek 确认需要简化
  originalLevel: "C1",      // 原文词典 CEFR 等级
}]
```

### 6.2 本地词替换逻辑不变

`applySimplifiedWords()` 函数逻辑不变，只是 `rewriteMappings` 多了 `confirmed` 字段。

### 6.3 后端 prompt 核心改动

```python
# 新增说明（插入到 SIMPLIFY_WORDS_SYSTEM_PROMPT 中）
"
IMPORTANT: You must first verify each word's CEFR level against its base form.
Words like 'fixing' (base: fix=A2) should be marked as '' if a {target_level} learner already knows the base form.
Return '' when the word's base form is at or below the {target_level} level, even if its CEFR tag is higher.
"
```

---

## 7. 待确认问题（已确认）

- [x] **Loading 文案**：`Unlock 中...`（与按钮文案呼应）
- [x] **无词可简化**：`toast` 提示「当前文章没有需要简化的高难度词」，继续显示原文
- [x] **简化对照表**：只显示 `confirmed: true` 的词

---

## 8. 验收标准

1. 点击「Unlock」按钮后，DeepSeek 复核词典 CEFR 等级
2. 原文视图中，只有 DeepSeek 确认需要简化的词有下划线
3. 重写版视图中，简化词用暖黄色 `#FEF9C3` 背景，无下划线
4. Unlock 按钮样式和上传素材页一致（紫色渐变）
5. 按钮文案为「Unlock」
