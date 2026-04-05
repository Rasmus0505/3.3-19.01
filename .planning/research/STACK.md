# Stack Research

**Domain:** Python data-processing tools for CEFR vocabulary cleaning and normalization
**Researched:** 2026-04-05
**Confidence:** HIGH

## Recommended Stack

### Core Technologies (标准库，零依赖)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `json` | Python 3.11+ 内置 | 读取/写入 50,000 词 JSON | 标准库足够处理 50K 条目，`json.load()` 约 0.3-0.5s，`json.dump()` 输出 indent=2 可读性最佳 |
| `unicodedata` | Python 3.11+ 内置 | Unicode 规范化、大小写折叠 | 处理 "café" vs "cafe" 类词汇变体，`str.casefold()` 比 `str.lower()` 更适合国际化文本 |
| `csv` | Python 3.11+ 内置 | 读取 CEFR-J 参考词表 | `csv.DictReader` 直接映射 CSV 列到 dict，与 `json.load()` 流程一致 |
| `collections` | Python 3.11+ 内置 | 高效聚合统计 | `defaultdict(list)` 是加载参考词表时按 (word, pos) 分组的最佳选择 |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pytest` | ^8.0 | 回归测试、验证修正后数据 | 修正脚本开发阶段需要验证：schema 不被破坏、前端消费字段存在、等级分布合理 |
| `pytest-repeat` | ^0.9 | 重复运行测试确保一致性 | 验证多次运行脚本结果一致（dry-run vs --save） |

### 开发工具（可选）

| Tool | Purpose | Notes |
|------|---------|-------|
| `python -m json.tool` | 快速验证 JSON 语法 | 修正前先用 `--dry-run` 预览报告，确认后才 `--save` |
| `jq` (系统级) | 命令行查看大 JSON | `jq '.words | length' cefr_vocab.json` 快速检查词数 |

## 不需要第三方库的理由

### 为什么 `json` 标准库足够

50,000 条词汇 JSON 文件约 3-5MB，Python 内置 `json` 模块处理此规模毫无压力：

```
json.load()  50K 条目  →  ~300-500ms
json.dump()  50K 条目  →  ~500-800ms (带 indent=2)
```

引入 `orjson` 或 `ujson` 可提速 3-5 倍，但：
- 首次加载后数据已驻留内存，后续处理是纯 Python 对象操作
- 仅节省 200-400ms 对一次性数据处理任务无意义
- 新增依赖带来版本管理成本

### 为什么不需要 `pandas`

`pandas` 处理 50K 行 CSV 绰绰有余，但：
- CEFR-J CSV 仅 7,799 行、7 列，`csv.DictReader` 单次遍历即可
- `pandas` 依赖 NumPy，启动慢（约 200ms），远超实际处理时间
- 内存占用是 `csv` 模块的 10 倍以上

### 为什么不需要 `textdistance` 或 `rapidfuzz`

字符串相似度/模糊匹配在此场景不适用：
- CEFR-J 参考词表是精确匹配（`word.lower()` in reference）
- "a.m./A.M./am/AM" 类特殊格式已由 `fix_cefr_levels.py` 中的 `split("/")` 处理

## 安装

```bash
# 回归测试需要（可选）
pip install pytest pytest-repeat
```

现有 `fix_cefr_levels.py` **零依赖**，直接运行：

```bash
python fix_cefr_levels.py --dry-run
python fix_cefr_levels.py --save
```

## Alternatives Considered

| Category | 我们的选择 | 替代方案 | 为什么不用替代 |
|----------|-----------|----------|--------------|
| JSON 解析 | 标准库 `json` | `orjson` / `ujson` | 性能收益 < 0.5s，无需提速 |
| CSV 解析 | 标准库 `csv` | `pandas` | 仅 8K 行 7 列，过度工程化 |
| 字符串相似度 | 不需要 | `rapidfuzz` / `thefuzz` | 精确匹配已满足需求 |
| Unicode 处理 | 标准库 `unicodedata` | `text-unidecode` | 仅需 NFC/NFD 规范化 |

## What NOT to Use

| 避免 | 为什么 | 使用替代 |
|------|--------|----------|
| `ujson` / `orjson` 作为默认 | 一次性处理任务，依赖成本 > 性能收益 | 标准库 `json`，除非后续需要流式处理 GB 级 JSON |
| `pandas` 用于 CSV 加载 | 仅 8K 行，用它杀鸡用牛刀 | 标准库 `csv.DictReader` |
| `numpy` 作为数据容器 | 数字数组非本任务场景 | Python `list` / `dict` |
| fuzzy matching 库 | 精确匹配已覆盖 CEFR-J 词表 | 不需要 |

## 后端兼容性策略

### 新结构向后兼容（已有方案）

`fix_cefr_levels.py` 输出新增字段均为可选：

```python
# 前端消费的核心字段（原有，不变）
info["rank"]      # 保留
info["level"]     # 保留，值可能变化
info["count"]     # 保留

# 新增字段（前端可选择性消费）
info["pos_entries"]       # [] 如果未在 CEFR-J 中找到
info["_fixed"]            # 仅调试用，可忽略
info["_original_rank_level"]  # 仅调试用，可忽略
```

### 前端兼容性检查点

| 检查点 | 前端消费者 | 兼容方式 |
|--------|-----------|---------|
| `vocabAnalyzer` | 分析 lesson 词时用 `words[word].level` | ✅ 字段不变，新增字段无害 |
| `computeCefrClassName` | 返回 CSS class 如 `level-a1` | ✅ level 值变化，需重新生成 class 映射 |
| 词性展示 | 如需显示 POS 信息 | 检查 `pos_entries` 是否存在 |

## 版本兼容性

| Package | Compatible With | Notes |
|---------|----------------|-------|
| Python | >= 3.11 | 使用 `dict` 有序保证（3.7+），f-string 格式（3.6+） |

---

*Stack research for: CEFR vocabulary data processing*
*Researched: 2026-04-05*
