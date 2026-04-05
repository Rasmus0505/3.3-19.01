# Requirements: Bottle English Learning — v2.6 清洗 CEFR 词典数据源

**Defined:** 2026-04-05
**Core Value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.

## v1 Requirements

Requirements for cleaning and normalizing the CEFR vocabulary dataset. Grounded in research findings from `.planning/research/SUMMARY.md`.

### Data Quality (DATA)

The core goal: replace inaccurate COCA rank-based CEFR levels with authoritative CEFR-J Vocabulary Profile levels, and add POS information.

- [ ] **DATA-01**: CEFR 词表执行 CEFR-J 权威修正 — 运行 `fix_cefr_levels.py --save`，将 7,020 个 CEFR-J 匹配词的等级替换为权威值
- [ ] **DATA-02**: 修正后词表包含 `_vocab_version: "fixed-v1"` 元数据字段 — 确保前端 `vocabAnalyzer` 校验通过，不回退到 SUPER
- [ ] **DATA-03**: 修正后词表包含完整 `pos_entries` 数组 — 每个 CEFR-J 匹配词保留所有词性条目（verb/noun/adjective 等）
- [ ] **DATA-04**: 未匹配词保留 rank-based 等级，并附加 `_source: "rank-based"` 标记 — 区分已验证 vs 估算等级
- [ ] **DATA-05**: 修正报告生成 — 显示升降级统计、等级分布变化、词性覆盖率 — 人工审查后写入 commit message
- [ ] **DATA-06**: 输出词表总词数仍为 50,000 — 无词丢失，无词重复

### Frontend Compatibility (FRONT)

Ensure existing frontend CEFR analysis pipeline (`vocabAnalyzer`, `computeCefrClassName`) continues to work with the new vocabulary structure.

- [ ] **FRONT-01**: `vocabAnalyzer` 加载修正后词表成功 — `_vocab_version` 校验通过，无错误
- [ ] **FRONT-02**: `computeCefrClassName` 对所有新等级值（A1-C2 + SUPER）返回正确的 CSS class — 无断链
- [ ] **FRONT-03**: 沉浸式学习页面词等级显示正常 — A1-C2 颜色下划线 + SUPER 红色正确渲染
- [ ] **FRONT-04**: 生词本色块 CEFR 徽章正常显示 — `cefr-level-tag` 组件对所有等级正确着色
- [ ] **FRONT-05**: 修正后词表构建到 `app/static` — `dist/` 或 `app/static` 包含新词表，Web/Desktop 均可用

### Validation (TEST)

Regression validation to confirm the data correction didn't break anything.

- [ ] **TEST-01**: 50,000 词全部可查询 — 随机抽样 100 词验证 lookup 不报错
- [ ] **TEST-02**: `analyzeVideo()` 对任意字幕文本返回 CEFR 分布 — 不因新等级崩溃
- [ ] **TEST-03**: `computeCefrClassName` 边界测试 — null/undefined → `cefr-mastered` (gray) 仍然正确

## v2 Requirements

Deferred for future milestones. Based on research, these are acknowledged but not in current scope.

### Vocabulary Enrichment (ENRICH)

- **ENRICH-01**: 复数/过去式等曲折词形合并到词根 — walk/walked/walking 归一
- **ENRICH-02**: 添加更多 CEFR 参考词表 — 将覆盖率从 14% 提升
- **ENRICH-03**: 多词组表达支持 — a lot of / in order to 等短语
- **ENRICH-04**: IPA 音标 — 通过 CMU Pronouncing Dictionary 补充

### Frontend POS Display (POS-UI)

- **POS-UI-01**: 词详情显示所有词性 — 对多词性词（如 run noun/verb）展示完整 pos_entries
- **ENRICH-05**: 置信度指标 — "已验证（CEFR-J）" vs "估算（频率）" 在分析面板显示
- **POS-UI-02**: 覆盖率统计 — 内容分析结果中显示 CEFR-J 验证覆盖率百分比

### Refactoring (REFRACTOR)

- **REFRACTOR-01**: 提取 `CEFR_LEVEL_ORDER` 到共享常量文件 — 当前硬编码在 6+ 文件，防止未来等级扩展断裂
- **REFRACTOR-02**: 缩写词独立词条 — don't / it's / I'm 作为独立词而非映射到 base word

## Out of Scope

Explicitly excluded to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Lemmatization / 词形还原 | 需要额外 NLP 工具，引入新依赖，v2+ 再考虑 |
| 多参考词表合并 | 需要额外数据源和冲突解决策略，v2+ 再考虑 |
| 短语词汇支持 | 需要额外数据源，v2+ 再考虑 |
| IPA 音标 | 需要 CMU 词典，引入外部依赖，v2+ 再考虑 |
| 新的 CEFR 等级 | 当前 A1-C2 + SUPER 已够用，增加等级需同步修改前端硬编码 |
| 用户可见置信度 UI | 属于独立 UX 需求，v2+ 作为 POS-UI 处理 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 30 | Pending |
| DATA-02 | Phase 30 | Pending |
| DATA-03 | Phase 30 | Pending |
| DATA-04 | Phase 30 | Pending |
| DATA-05 | Phase 30 | Pending |
| DATA-06 | Phase 30 | Pending |
| FRONT-01 | Phase 31 | Pending |
| FRONT-02 | Phase 31 | Pending |
| FRONT-03 | Phase 31 | Pending |
| FRONT-04 | Phase 31 | Pending |
| FRONT-05 | Phase 31 | Pending |
| TEST-01 | Phase 31 | Pending |
| TEST-02 | Phase 31 | Pending |
| TEST-03 | Phase 31 | Pending |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-05*
*Last updated: 2026-04-05 after initial definition*
