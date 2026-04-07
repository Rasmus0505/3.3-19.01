# 阅读板块词汇简化功能重构 - 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现三步处理流程（本地词典初筛 → DeepSeek二次筛选 → 双视图渲染），重构阅读板块词汇简化功能。

**Architecture:** 通过 `useVocabularyFilter` Hook 整合本地词典分析和 API 调用，`ArticlePanel` 支持原文/重写版双视图切换，IndexedDB 持久化处理结果。

**Tech Stack:** React Hooks, FastAPI, DeepSeek V3.2, IndexedDB

---

## 文件结构概览

```
frontend/src/features/reading/
├── useVocabularyFilter.js          # 新建：整合三步流程的 Hook
├── api/readingRewriteApi.js         # 修改：补充前端 API 调用
├── ArticlePanel.jsx                 # 修改：集成 Hook，支持双视图
├── readingRewriteDB.js              # 修改：更新 Schema 对齐新设计
└── reading.css                      # 修改：补充新样式

app/api/routers/llm.py               # 修改：清理旧端点，保留/增强新端点
app/infra/llm/deepseek.py            # 无需修改：现有 call_deepseek 通用
```

---

## 任务 1: 后端 API 整理

### 任务 1.1: 分析现有端点与设计文档差异

**目标:** 对比设计文档 API 与现有实现，确定需要保留/新增/清理的端点。

设计文档 vs 现有实现：

| 设计文档 API | 现有实现 | 处理 |
|-------------|---------|------|
| `POST /api/llm/validate-words` | `POST /filter-and-simplify-words` | 已实现，功能相同（筛选+验证+重写），保留 |
| `POST /api/llm/rewrite-article` | 包含在 `filter-and-simplify-words` 中 | 合并到现有端点，无需新增 |
| `DELETE /api/llm/rewrite-text` (旧) | `POST /rewrite-text` | 待清理 |

### 任务 1.2: 清理旧的重写端点

**文件:** `app/api/routers/llm.py:1160-1336`

- [ ] **Step 1: 确认 `/rewrite-text` 端点无其他调用方**

运行: `grep -r "rewrite-text" frontend/src/ --include="*.js" --include="*.jsx"`
预期: 无引用（或仅历史记录查询）

- [ ] **Step 2: 删除 `rewrite_text_endpoint` 函数及 `RewriteTextRequest` Schema**

```python
# 删除以下内容（约 180 行）：
# class RewriteTextRequest(BaseModel): ...  (line ~43-50)
# @router.post("/rewrite-text", ...)  (line ~1160-1336)
# REWRITE_SYSTEM_PROMPT, REWRITE_WITH_MAPPINGS_SYSTEM_PROMPT (line ~260-315)
```

- [ ] **Step 3: 提交变更**

```bash
git add app/api/routers/llm.py
git commit -m "refactor(llm): remove legacy rewrite-text endpoint (Phase 36)"
```

---

## 任务 2: 前端 Hook 开发

### 任务 2.1: 创建 `useVocabularyFilter` Hook

**文件:** Create: `frontend/src/features/reading/useVocabularyFilter.js`

- [ ] **Step 1: 创建 Hook 文件骨架**

```javascript
/**
 * useVocabularyFilter.js — 词汇筛选 Hook
 * 整合三步处理流程：
 * 1. 本地词典初筛（VocabAnalyzer）
 * 2. DeepSeek 二次筛选（filterAndSimplifyWords API）
 * 3. 构建 rewriteMappings 供 ArticlePanel 使用
 */
import { useState, useCallback, useRef } from "react";
import { filterAndSimplifyWords } from "./api/readingRewriteApi";

export function useVocabularyFilter({ accessToken, userLevel = "B1", targetLevel = "B2" }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  
  // 处理结果状态
  const [originalText, setOriginalText] = useState("");
  const [rewrittenText, setRewrittenText] = useState("");
  const [validI1Words, setValidI1Words] = useState([]);
  const [validAboveI1Words, setValidAboveI1Words] = useState([]);
  const [removedWords, setRemovedWords] = useState([]);
  const [rewriteMappings, setRewriteMappings] = useState([]);
  const [wordLevels, setWordLevels] = useState({});
  
  const abortRef = useRef(null);
  
  // ... 实现 processArticle 和 reset 方法
}

export default useVocabularyFilter;
```

- [ ] **Step 2: 实现 `processArticle` 方法**

核心逻辑：
1. 接收原文 `text` 和词典分析结果 `candidateWords` (格式: `[{word, cefrLevel}]`)
2. 调用 `filterAndSimplifyWords` API
3. 根据 `simplifiedWords` 构建 `rewriteMappings` 数组
4. 在原文中应用简化替换，生成 `rewrittenText`

```javascript
const processArticle = useCallback(async (text, candidateWords) => {
  if (!text?.trim() || !candidateWords?.length) {
    setError("文章为空或无候选词汇");
    return;
  }
  
  setIsProcessing(true);
  setError(null);
  
  try {
    // 提取词列表和等级映射
    const words = candidateWords.map(c => c.word);
    const wordLevels = {};
    candidateWords.forEach(c => { wordLevels[c.word.toLowerCase()] = c.cefrLevel; });
    
    // 调用 API
    const result = await filterAndSimplifyWords(
      text,
      words,
      wordLevels,
      targetLevel,
      userLevel,
      accessToken
    );
    
    // 更新状态
    setOriginalText(text);
    setValidI1Words(result.validI1Words);
    setValidAboveI1Words(result.validAboveI1Words);
    setRemovedWords(result.removedWords);
    setWordLevels(result.wordLevels);
    
    // 构建 rewriteMappings
    const mappings = result.validAboveI1Words.map((word, idx) => ({
      original: result.simplifiedWords[idx] || word,  // 简化后的词
      originalLower: word.toLowerCase(),
      rewritten: word,                                 // 原文（tooltip 显示）
      confirmed: Boolean(result.simplifiedWords[idx]),
      dsLevel: result.wordLevels[word.toLowerCase()] || "unknown"
    })).filter(m => m.confirmed);  // 只保留实际被简化的
    
    setRewriteMappings(mappings);
    
    // 生成重写版文本
    let rewritten = text;
    // 按长度倒序替换，避免部分匹配问题
    [...mappings].sort((a, b) => b.original.length - a.original.length)
      .forEach(m => {
        const regex = new RegExp(`\\b${escapeRegex(m.rewritten)}\\b`, 'gi');
        rewritten = rewritten.replace(regex, m.original);
      });
    
    setRewrittenText(rewritten);
    
  } catch (err) {
    setError(err.message || "处理失败");
  } finally {
    setIsProcessing(false);
  }
}, [accessToken, userLevel, targetLevel]);
```

- [ ] **Step 3: 实现 `reset` 方法**

```javascript
const reset = useCallback(() => {
  setOriginalText("");
  setRewrittenText("");
  setValidI1Words([]);
  setValidAboveI1Words([]);
  setRemovedWords([]);
  setRewriteMappings([]);
  setWordLevels({});
  setError(null);
}, []);
```

- [ ] **Step 4: 导出 Hook**

```javascript
return {
  isProcessing,
  error,
  originalText,
  rewrittenText,
  validI1Words,
  validAboveI1Words,
  removedWords,
  rewriteMappings,
  wordLevels,
  processArticle,
  reset,
};
```

- [ ] **Step 5: 添加辅助函数**

```javascript
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- [ ] **Step 6: 提交**

```bash
git add frontend/src/features/reading/useVocabularyFilter.js
git commit -m "feat(reading): add useVocabularyFilter Hook for three-step processing"
```

---

## 任务 3: ArticlePanel 集成 Hook

### 任务 3.1: 修改 ArticlePanel Props 接口

**文件:** `frontend/src/features/reading/ArticlePanel.jsx:33-46`

- [ ] **Step 1: 更新 Props 说明注释**

```javascript
/**
 * Props (更新):
 *   ...
 *   rewriteMappings {{original: string, originalLower: string, rewritten: string, confirmed: boolean, dsLevel: string}[]}
 *   validI1Words  {string[]}
 *   validAboveI1Words {string[]}
 *   removedWords  {Array<{word: string, reason: string}>}
 *   viewMode       {'original'|'rewritten'}
 *   // 新增：从 useVocabularyFilter 传入
 *   rewrittenText  {string}  — Hook 处理后的重写版全文
 */
```

- [ ] **Step 2: 确认现有代码已支持新 Props**

现有 `ArticlePanel.jsx` 代码已包含：
- `validI1Words`, `validAboveI1Words`, `removedWords` 处理
- `rewriteMappings` 匹配逻辑
- `viewMode` 切换逻辑

**无需修改**，现有实现已对齐设计。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/features/reading/ArticlePanel.jsx
git commit -m "docs(ArticlePanel): update Props documentation"
```

---

## 任务 4: IndexedDB Schema 验证与更新

### 任务 4.1: 对齐设计文档 Schema

**文件:** `frontend/src/features/reading/readingRewriteDB.js:37-55`

- [ ] **Step 1: 对比现有 Schema 与设计文档**

| 设计文档字段 | 现有 Schema | 对齐状态 |
|------------|------------|---------|
| `id` | `articleId` | ✅ 已对齐 |
| `originalText` | ✅ 有 | ✅ |
| `validI1Words` | ✅ 有 | ✅ |
| `validAboveI1Words` | ✅ 有 | ✅ |
| `removedWords` | ✅ 有 | ✅ |
| `wordLevels` | ✅ 有 | ✅ |
| `wordMappings` | `mappings` | ✅ 已对齐（字段名不同但功能一致）|
| `rewrittenText` | ✅ 有 | ✅ |
| `currentView` | `viewMode` | ✅ 已对齐 |

现有 Schema 已完整覆盖设计文档要求，无需修改。

- [ ] **Step 2: 提交**

```bash
git add frontend/src/features/reading/readingRewriteDB.js
git commit -m "docs(readingRewriteDB): verify Schema alignment with design doc"
```

---

## 任务 5: CSS 样式补充

### 任务 5.1: 添加设计文档中的新样式

**文件:** `frontend/src/features/reading/reading.css`

设计文档第 5.3 节描述的样式 vs 现有实现对比：

| 设计样式 | 现有 CSS | 对齐状态 |
|---------|---------|---------|
| `.word-i1` 绿色下划线 | `.cefr-i-plus-one` | ✅ 已有对应样式 |
| `.word-above-i1` 红色下划线 | `.cefr-above-i-plus-one` | ✅ 已有对应样式 |
| `.word-simplified` 黄色背景块 | `.article-word--simplified` | ✅ 已有对应样式 |

现有 CSS 已对齐设计，无需修改。

- [ ] **Step 1: 提交**

```bash
git add frontend/src/features/reading/reading.css
git commit -m "docs(reading.css): verify style alignment with design doc"
```

---

## 任务 6: ReadingPage 集成新 Hook

### 任务 6.1: 修改 ReadingPage 使用新 Hook

**文件:** `frontend/src/features/reading/ReadingPage.jsx`

- [ ] **Step 1: 读取现有 ReadingPage 实现**

```javascript
// 确认现有实现是否已使用类似 Hook
// 如有，替换为新的 useVocabularyFilter
```

- [ ] **Step 2: 如需修改，添加 Hook 导入**

```javascript
import { useVocabularyFilter } from "./useVocabularyFilter";
```

- [ ] **Step 3: 初始化 Hook**

```javascript
const {
  isProcessing,
  error,
  originalText,
  rewrittenText,
  validI1Words,
  validAboveI1Words,
  removedWords,
  rewriteMappings,
  wordLevels,
  processArticle,
  reset,
} = useVocabularyFilter({
  accessToken: user?.access_token,
  userLevel: readCefrLevel() || "B1",
  targetLevel: "B2",
});
```

- [ ] **Step 4: 传递 Props 给 ArticlePanel**

```javascript
<ArticlePanel
  text={viewMode === "rewritten" ? rewrittenText : originalText}
  rewriteMappings={rewriteMappings}
  validI1Words={validI1Words}
  validAboveI1Words={validAboveI1Words}
  removedWords={removedWords}
  viewMode={viewMode}
  // ... 其他 props
/>
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/features/reading/ReadingPage.jsx
git commit -m "feat(ReadingPage): integrate useVocabularyFilter Hook"
```

---

## 任务 7: 端到端测试

### 任务 7.1: 手动功能测试

- [ ] **Step 1: 启动开发服务器**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: 访问阅读板块**

导航到 `/reading` 页面

- [ ] **Step 3: 粘贴测试文章**

```text
The eschew of modern technology requires careful consideration.
I used to loathe and scrutinize complex documents.
The CEO announced a new initiative to peruse sustainable practices.
```

- [ ] **Step 4: 验证词典初筛**

确认候选词汇被正确识别（如 `eschew`, `scrutinize`, `peruse`, `loath`, `consideration`）

- [ ] **Step 5: 验证 DeepSeek 二次筛选**

检查 API 调用日志，确认：
- `valid_i1_words`: 保留 i+1 词（如 `scrutinize` B2 对于 B1 用户）
- `valid_above_i1_words`: 标记需要简化的词（如 `eschew` C1）
- `removed_words`: 过滤过于简单的词

- [ ] **Step 6: 验证原文视图渲染**

- i+1 词：绿色下划线
- >i+1 词：红色下划线
- 简化词：黄色背景块 + hover 显示原文

- [ ] **Step 7: 验证重写版视图**

切换到重写版视图，确认：
- 简化后的词显示在正确位置
- 原文词被替换

- [ ] **Step 8: 验证 IndexedDB 持久化**

刷新页面，确认历史记录保留

- [ ] **Step 9: 提交测试结果**

```bash
git add .
git commit -m "test(reading): e2e verification for vocabulary simplify feature"
```

---

## 验收标准检查清单

| 标准 | 状态 |
|------|------|
| 用户粘贴文章后，系统正确识别 i+1 和 >i+1 词汇 | 待验证 |
| DeepSeek 能够过滤词典误标的简单词 | 待验证 |
| DeepSeek 将 >i+1 词重写为 i+1 水平的词/短语 | 待验证 |
| 原文视图正确显示绿色/红色下划线和黄色背景块 | 待验证 |
| 重写版视图显示简化后的全文 | 待验证 |
| 悬浮提示正确显示原文对照 | 待验证 |
| 历史记录支持视图切换，状态正确保存 | 待验证 |

---

## 依赖关系图

```
Task 1 (后端清理)
    ↓
Task 2 (Hook 开发)
    ↓
Task 3 (ArticlePanel) ← 可并行
Task 4 (IndexedDB)    ← 可并行
Task 5 (CSS)         ← 可并行
    ↓
Task 6 (ReadingPage 集成)
    ↓
Task 7 (端到端测试)
```

---

## 风险与注意事项

1. **API 兼容性**: 现有 `filter-and-simplify-words` 端点返回格式需与 Hook 期望一致
2. **性能**: 大量候选词时，逐一替换可能导致性能问题，考虑批量处理
3. **边界情况**: 空文章、无候选词、全部过滤等场景已设计，需验证
