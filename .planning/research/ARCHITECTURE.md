# Architecture Research: CEFR Vocabulary Dataset

**Domain:** Static vocabulary dataset for client-side language learning analysis
**Researched:** 2026-04-05
**Confidence:** HIGH

## Executive Summary

清洗和规范化 CEFR 词汇数据集的核心挑战是：在静态文件约束下，平衡数据结构完整性、客户端加载性能和向后兼容性。当前 `vocabAnalyzer.js` 已设计为支持 `pos_entries` 扩展，关键决策点是文件版本标识、字段布局和部署流程。

## Recommended Architecture

### Data Flow

```
cefr_vocab.json (原始)
        ↓
fix_cefr_levels.py (CEFR-J 修正)
        ↓
cefr_vocab_fixed.json (清洗后)
        ↓
Build/Deploy (静态资源)
        ↓
VocabAnalyzer.load() (浏览器加载)
        ↓
Map<string, WordEntry> (内存)
```

### Word Entry Structure

```json
{
  "run": {
    "rank": 42,
    "level": "A1",
    "count": 987654,
    "pos_entries": [
      { "pos": "verb",   "level": "A2", "source": "CEFR-J" },
      { "pos": "noun",   "level": "B1", "source": "CEFR-J" }
    ]
  }
}
```

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `rank` | number | Yes | COCA 词频排名 |
| `level` | string | Yes | **主等级**（最低复杂度词性）— 向后兼容 |
| `count` | number | Yes | 词频计数 |
| `pos_entries` | array | Yes (可为空) | 完整词性列表 |

### File Header Structure

```json
{
  "_vocab_version": "fixed-v1",
  "license": "MIT",
  "source": "COCA via vocabulary-list-statistics",
  "generated_at": "2026-04-05",
  "total_words": 50000,
  "cefr_thresholds": { "A1": 600, ... },
  "words": { ... }
}
```

## Key Decisions

### 1. Keep Flat Structure (50K Top-Level Keys)

**Decision:** 保持 `words` 对象为扁平的 50,000 个顶层 key-value 映射。

**Rationale:**
- `VocabAnalyzer` 使用 `new Map(Object.entries(data.words))` 转换为 JavaScript Map，O(1) 查找性能不受影响
- 按 CEFR 级别拆分文件会破坏 `analyzeVideo()` 的全局统计逻辑（需要遍历所有词）
- 单文件简化部署和版本管理

**Trade-off:**
- 约 4.6 MB 文件大小
- gzip 压缩后 ~1.2 MB（可接受）

### 2. `pos_entries` Inside Word Object

**Decision:** 将 `pos_entries` 保留在每个词条对象内部，而非拆分独立文件。

**Rationale:**
- 单源一致性：修正后的等级和词性绑定在同一记录
- `getWordInfo(word)` 已返回完整对象，无需 API 变更
- 避免跨文件 JOIN 查询

**Alternative considered:** 拆分 `pos_entries` 为独立索引文件 `{word: [pos_entry...]}`。  
**Why rejected:** 增加加载复杂度，且大部分场景只需主等级字段。

### 3. Backward Compatibility via `level` Field

**Decision:** 每个词保留 `level` 字段作为主等级（取最简单词性对应的等级），确保旧版 `VocabAnalyzer` 兼容。

**Implementation:**
```
pos_entries[最低优先级].level → word.level
```

**Rationale:**
- `vocabAnalyzer._lookupWord()` 仅读取 `{word, level, rank}`
- `analyzeSentence()` 仅依赖 `level` 做颜色标记
- 新字段 `pos_entries` 是可选增强，不破坏现有功能

### 4. Single File Deployment

**Decision:** 不按 CEFR 级别拆分文件，统一部署单个 `cefr_vocab_fixed.json`。

**Rationale:**
- 当前 `vocabAnalyzer.load()` 只加载一个文件
- 按级别拆分需要修改加载逻辑，且 `analyzeVideo()` 的全局统计会失效
- 4.6 MB 单文件在 4G 网络下 < 1 秒加载时间可接受

**If future optimization needed:** 考虑按级别分片懒加载（Phase 2+）

## Integration Architecture

### VocabAnalyzer Data Flow

```
load()
  ├─→ fetch(/data/vocab/cefr_vocab_fixed.json)
  ├─→ validate(isValidCefrVocabPayload) → 检查 _vocab_version
  └─→ _initFromData()
        └─→ this.wordMap = new Map(Object.entries(data.words))

analyzeSentence(text)
  └─→ _lookupWord(token) → wordMap.get(lower) → {word, level, rank}

getWordInfo(word)
  └─→ wordMap.get(word) → 完整对象含 pos_entries
```

### Version Control Strategy

| Version | Description | VocabAnalyzer 支持 |
|---------|-------------|-------------------|
| `original` | 旧版 `{rank, level, count}` | 需要更新 `_vocab_version` 检查 |
| `fixed-v1` | CEFR-J 修正版，含 `pos_entries` | 当前实现已支持 |

**Migration path:** 文件名保留 `cefr_vocab_fixed.json`，版本通过 `_vocab_version` 字段控制。

## Validation Strategy

### Pre-Deployment Checks

```python
def validate_vocab(data):
    assert "_vocab_version" in data
    assert data["_vocab_version"] == "fixed-v1"
    assert "words" in data
    assert len(data["words"]) == 50000
    
    for word, info in data["words"].items():
        assert "rank" in info
        assert "level" in info
        assert "count" in info
        assert "pos_entries" in info
        # pos_entries 可为空数组但必须有此字段
```

### Runtime Validation (VocabAnalyzer)

```javascript
function isValidCefrVocabPayload(data) {
  return Boolean(
    data &&
    typeof data === "object" &&
    data.words &&
    typeof data.words === "object" &&
    data._vocab_version === CURRENT_VOCAB_VERSION
  );
}
```

## Build/Deploy Pipeline

```
┌─────────────────────────────────────────────┐
│  1. Source Data                             │
│     app/data/vocab/cefr_vocab.json          │
│     cefrj-vocabulary-profile-1.5.csv       │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│  2. Run Fix Script                          │
│     python fix_cefr_levels.py --save        │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│  3. Output                                  │
│     app/data/vocab/cefr_vocab_fixed.json    │
│     (或自定义路径)                          │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│  4. CI/CD 集成                              │
│     build script 自动执行修正脚本           │
│     输出到 app/data/vocab/                  │
│     触发前端构建                             │
└─────────────────────────────────────────────┘
```

## Anti-Patterns

### Anti-Pattern 1: 按级别拆分为多个文件

**What people do:** 按 CEFR 级别拆分 `a1_vocab.json`, `a2_vocab.json`...

**Why it's wrong:**
- `analyzeVideo()` 需要全局统计，无法从单文件获取
- 增加了 `VocabAnalyzer.load()` 的复杂度
- 词的多词性分布在多个文件中无法统一查询

**Do this instead:** 保持单文件，Phase 2+ 需要性能优化时再考虑懒加载。

### Anti-Pattern 2: 删除旧字段添加新字段

**What people do:** 删除 `level` 用 `primary_level` 替代。

**Why it's wrong:**
- 破坏 `VocabAnalyzer._lookupWord()` 的兼容性
- 需要同时更新前后端代码

**Do this instead:** 保留 `level` 作为主等级，添加 `pos_entries` 作为可选扩展。

### Anti-Pattern 3: 修改文件名而非版本字段

**What people do:** 每次修正后改名 `cefr_vocab_v2.json`, `cefr_vocab_v3.json`...

**Why it's wrong:**
- 前端 URL 硬编码或需要配置更新
- 版本历史追踪困难

**Do this instead:** 使用 `_vocab_version` 字段控制版本，文件名固定为 `cefr_vocab_fixed.json`。

## Performance Considerations

| Metric | Value | Notes |
|--------|-------|-------|
| 文件大小 | ~4.6 MB | 修正后含 pos_entries |
| gzip 后 | ~1.2 MB | 可接受 |
| 首次加载 | < 1s (4G) | sessionStorage 缓存 |
| 内存占用 | ~50k * 约200B ≈ 10 MB | Map 结构 |
| 查询复杂度 | O(1) | Map 查找 |

**SessionStorage 限制:** 部分浏览器 sessionStorage 有 5MB 限制，修正后的 JSON（约 4.6MB）序列化后可能接近限制。代码已处理此情况（写失败时仍可在内存使用）。

## Sources

- `app/frontend/src/utils/vocabAnalyzer.js` — 客户端加载和查询逻辑
- `fix_cefr_levels.py` — 修正脚本和目标数据结构定义
- `app/data/vocab/cefr_vocab.json` — 当前数据结构
