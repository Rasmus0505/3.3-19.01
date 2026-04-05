# ROADMAP: Bottle English Learning — v2.6 清洗 CEFR 词典数据源

**Milestone:** v2.6
**Goal:** 将旧 COCA rank-based CEFR 等级替换为权威 CEFR-J Vocabulary Profile 等级，补全词性（POS）信息，修复数据质量问题，为未来 CEFR 等级识别打好基础。
**Granularity:** Standard
**Phases:** 2

## Phases

- [ ] **Phase 30: CEFR 词表权威修正** — 执行 fix_cefr_levels.py，将 7,020 个 CEFR-J 匹配词替换为权威等级，生成修正后词表
- [ ] **Phase 31: 前后端适配验证** — 验证 vocabAnalyzer、computeCefrClassName 与新词表无缝衔接

---

## Phase Details

### Phase 30: CEFR 词表权威修正

**Goal:** 执行 `fix_cefr_levels.py`，生成包含正确等级、`pos_entries`、版本元数据的修正后词表 `cefr_vocab_fixed.json`

**Depends on:** None

**Requirements:** DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06

**Success Criteria** (what must be TRUE):

1. `fix_cefr_levels.py --dry-run` 输出无错误，升降级统计清晰可读
2. 生成的 `cefr_vocab_fixed.json` 包含顶级字段 `_vocab_version: "fixed-v1"`
3. 所有 CEFR-J 匹配词（约 7,020）包含 `pos_entries` 数组，每个条目含 `pos` 和 `level`
4. 未匹配词（约 43,000）包含 `_source: "rank-based"` 标记，保留原始 rank-based 等级
5. 修正后词表总词数为 50,000，无词丢失，无词重复；commit message 包含等级分布变化摘要

**Plans:** TBD

---

### Phase 31: 前后端适配验证

**Goal:** 验证前端 `vocabAnalyzer` 和 CEFR 展示组件与新词表结构无缝衔接

**Depends on:** Phase 30

**Requirements:** FRONT-01, FRONT-02, FRONT-03, FRONT-04, FRONT-05, TEST-01, TEST-02, TEST-03

**Success Criteria** (what must be TRUE):

1. `vocabAnalyzer.load()` 加载 `cefr_vocab_fixed.json` 成功，`_vocab_version` 校验通过，无错误
2. `computeCefrClassName("A1", "B2")` → `cefr-below-i`（绿色）正确渲染
3. `computeCefrClassName("C2", "B2")` → `cefr-above-i+1`（红色）正确渲染
4. 未收录词（null/undefined）→ `cefr-mastered`（灰色）正确渲染
5. 修正后词表同步到 `app/static`，Web/Desktop 均包含修正后数据；50,000 词随机抽样验证无报错

**Plans:** TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 30. CEFR 词表权威修正 | 0/1 | Not started | - |
| 31. 前后端适配验证 | 0/1 | Not started | - |

---

## Coverage

- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---

*Roadmap created: 2026-04-05*
*Last updated: 2026-04-05*
