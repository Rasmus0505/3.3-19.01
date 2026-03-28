---
phase: 07
slug: competitive-research-and-product-specs
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
---

# 阶段 07 — 验证策略

> Phase 7 是文档规范阶段。验证目标不是跑业务测试，而是确认交付文件完整、边界正确、并且能直接被后续执行阶段消费。

---

## 测试基础设施

| 属性 | 值 |
|----------|-------|
| **框架** | PowerShell 文本断言 + 人工规范审阅 |
| **配置文件** | none |
| **快速运行命令** | `Get-ChildItem ".planning/workstreams/milestone/phases/07-competitive-research-and-product-specs" -Filter "07-*.md" \| Select-String -Pattern "Bottle 1.0|Bottle 2.0|选择学习素材质量|下载桌面端|充值后生成"` |
| **完整套件命令** | `Get-ChildItem ".planning/workstreams/milestone/phases/07-competitive-research-and-product-specs" -Filter "07-*.md" \| Select-String -Pattern "官方来源|Benchmark-backed Monetization Summary|场景决策表|旧词到新词映射|网页端不得执行 Bottle 1.0"` |
| **预计运行时间** | ~10 秒 |

---

## 采样率

- **每次任务提交后：** 运行快速文本断言命令
- **每个计划波次后：** 运行完整文本断言命令并进行一次人工审阅
- **`$gsd-verify-work` 之前：** 所有目标文件必须存在，且关键字符串与禁止项都已落文
- **最大反馈延迟：** 30 秒

---

## 每任务验证映射

| 任务 ID | 计划 | 波次 | 需求 | 测试类型 | 自动化命令 | 文件存在 | 状态 |
|---------|------|------|------|-----------|------------|----------|------|
| 07-01-01 | 01 | 1 | GROW-02 | 文本断言 | `Select-String -Path ".planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-COMPETITOR-MATRIX.md" -Pattern "官方来源|LingQ|Migaku|FluentU|Glossika|对比维度"` | ❌ 执行后创建 | ⬜ pending |
| 07-01-02 | 01 | 1 | WEB-01, GROW-02 | 文本断言 | `Select-String -Path ".planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-PRODUCT-POSITIONING-SPEC.md" -Pattern "Bottle 1.0：生成速度一般，字幕质量较好（客户端专属）|Bottle 2.0：生成速度快，字幕质量好|Benchmark-backed Monetization Summary|不引入订阅"` | ❌ 执行后创建 | ⬜ pending |
| 07-02-01 | 02 | 2 | WEB-02, WEB-03, GROW-01 | 文本断言 | `Select-String -Path ".planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-WEB-CTA-SPEC.md" -Pattern "场景决策表|下载桌面端|充值后生成|Bottle 1.0|链接导入|高风险素材"` | ❌ 执行后创建 | ⬜ pending |
| 07-02-02 | 02 | 2 | WEB-01, WEB-02, WEB-03, GROW-01 | 文本断言 | `Select-String -Path ".planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-COPY-DECK.md" -Pattern "选择学习素材质量|旧词到新词映射|Bottle 1.0：生成速度一般，字幕质量较好（客户端专属）|Bottle 2.0：生成速度快，字幕质量好|网页端不得执行 Bottle 1.0"` | ❌ 执行后创建 | ⬜ pending |

*状态：⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] 现有 Markdown 文件和 PowerShell 文本断言足以覆盖本阶段
- [x] 无需新增测试框架、fixture 或脚本
- [x] 验证方式已覆盖四个计划产出文件

---

## 纯人工验证

| 行为 | 需求 | 为什么人工 | 测试说明 |
|----------|------|------------|----------|
| 竞品矩阵是否仍坚持“官方来源优先” | GROW-02 | 链接是否真的是官方页面需要审阅判断 | 打开 `07-COMPETITOR-MATRIX.md`，逐项确认 `官方来源` 列没有二手测评、媒体转载或社区帖子 |
| CTA 分流是否把“能力边界”和“付费阻塞”区分开 | WEB-02, WEB-03, GROW-01 | 需要人工判断规则逻辑是否自洽 | 审阅 `07-WEB-CTA-SPEC.md`，确认 `余额不足 -> 充值后生成`，而不是误切成 `下载桌面端` |
| Bottle 1.0 是否始终被写成“可见但网页不可执行” | WEB-02, WEB-03 | 这是产品边界判断，不只是关键词存在性 | 审阅 `07-COPY-DECK.md` 与 `07-PRODUCT-POSITIONING-SPEC.md`，确认没有把 Bottle 1.0 描述为浏览器内可直接运行 |
| 下游消费面是否足够明确 | WEB-01, GROW-01 | 需要人工判断文档是否真能指导后续执行 | 检查规范中是否明确列出 `UploadPanel.jsx`、`asrStrategy.js`、`asrModels.js`、`asr_model_registry.py`、`AdminSystemTab.jsx`、`Docx/产品介绍.md` |

---

## 验证签收

- [x] 所有计划任务都有自动化文本断言或人工验证路径
- [x] 采样连续性满足要求：没有连续 3 个任务缺少自动化检查
- [x] Wave 0 无缺失基础设施
- [x] 无 watch-mode 命令
- [x] 反馈延迟 < 30 秒
- [x] `nyquist_compliant: true` 已写入 frontmatter

**审批：** Ready for execution
