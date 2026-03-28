---
phase: 07-competitive-research-and-product-specs
verified: 2026-03-28T11:59:00Z
status: passed
score: 5/5 must-haves verified
gaps: []
nyquist: compliant
---

# Phase 07: Competitive Research and Product Specs Verification Report

**Phase Goal:** 固定 v2.1 的产品定位、竞品参考、Bottle 1.0 / Bottle 2.0 文案与网页端转化路径，让后续体验改造不是凭感觉推进。  
**Verified:** 2026-03-28  
**Status:** PASSED  
**Nyquist:** compliant

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | 官方竞品矩阵覆盖直接英语学习产品、沉浸式学习工具、内容驱动学习产品、相邻参考四类口径，并包含 LingQ、Migaku、FluentU、Glossika | ✓ VERIFIED | `07-COMPETITOR-MATRIX.md` 含 `## 研究范围`、`## 对比维度`、`## 官方竞品矩阵`，并在矩阵中列出四类口径、四个必选产品与 `官方来源` 列 |
| 2 | Bottle 1.0 / Bottle 2.0 的标准定位、命名映射和产品边界已固定为可复用规范 | ✓ VERIFIED | `07-PRODUCT-POSITIONING-SPEC.md` 含精确定位文案、旧词到新词映射、下游消费面、以及 `网页端不得执行 Bottle 1.0` |
| 3 | Phase 7 留下 benchmark-backed monetization summary，并明确 v2.1 不引入订阅 | ✓ VERIFIED | `07-PRODUCT-POSITIONING-SPEC.md` 的 `## Benchmark-backed Monetization Summary` 包含 `不引入订阅`、`沿用按次付费`、`用场景化主次 CTA 提升下载/充值转化，而不是扩展套餐复杂度` |
| 4 | 网页端 CTA 已被固定成场景到主次动作的正式规则，而不是零散判断 | ✓ VERIFIED | `07-WEB-CTA-SPEC.md` 含 5 条必选场景规则，覆盖 `Bottle 2.0 默认网页流程`、`Bottle 1.0`、`链接导入`、`超大文件 / 长时长 / 网络不稳定`、`余额不足` |
| 5 | 后续实现阶段已经有可直接复用的模型卡、受阻场景与 admin/runtime copy deck | ✓ VERIFIED | `07-COPY-DECK.md` 含 `选择学习素材质量`、Bottle 主文案、桌面端 CTA、余额恢复文案、admin/runtime 命名、旧词到新词映射 |

**Score:** 5/5 must-haves verified

### Automated Verification Results

| Task ID | Requirement | Command | Result |
| --- | --- | --- | --- |
| 07-01-01 | GROW-02 | `Select-String 07-COMPETITOR-MATRIX.md "官方来源|LingQ|Migaku|FluentU|Glossika|对比维度|fast default vs high-value advanced path|blocked-action recovery tied to current task|platform boundary explained before submission"` | ✅ green |
| 07-01-02 | WEB-01, GROW-02 | `Select-String 07-PRODUCT-POSITIONING-SPEC.md "Bottle 1.0：生成速度一般，字幕质量较好（客户端专属）|Bottle 2.0：生成速度快，字幕质量好|Bottle 2.0 = 网页即用、快速起步、默认推荐|Bottle 1.0 = 桌面高精度、长时长/复杂素材/链接导入优先|不引入订阅|沿用按次付费|网页端不得执行 Bottle 1.0"` | ✅ green |
| 07-02-01 | WEB-02, WEB-03, GROW-01 | `Select-String 07-WEB-CTA-SPEC.md "场景决策表|Bottle 2.0 默认网页流程|Bottle 1.0|链接导入|超大文件 / 长时长 / 网络不稳定|余额不足|下载桌面端|充值后生成|余额不足属于付费阻塞，不属于能力边界|网页端可以展示 Bottle 1.0 价值，但不得把它写成浏览器内可执行流程"` | ✅ green |
| 07-02-02 | WEB-01, WEB-02, WEB-03, GROW-01 | `Select-String 07-COPY-DECK.md "选择学习素材质量|Bottle 1.0：生成速度一般，字幕质量较好（客户端专属）|Bottle 2.0：生成速度快，字幕质量好|Bottle 1.0 网页不可直接执行，请下载桌面端继续。|当前是余额阻塞，不是能力边界；主恢复动作保持为充值后生成。|Bottle 1.0 / Bottle 2.0 是主命名|网页端不得执行 Bottle 1.0"` | ✅ green |

*Regression gate note: Phase 07 is documentation-only. No application code changed, so prior-phase automated test suites were not rerun.*

### Manual-Only Verifications

| Behavior | Requirement | Why Manual | Status |
| --- | --- | --- | --- |
| 竞品矩阵的 `官方来源` 全部指向官方站点、官方 pricing/help/FAQ 页面 | GROW-02 | 需要人工判断链接是否属于官方域名而非媒体或社区转载 | pass |
| Bottle 1.0 在定位稿和 copy deck 中始终被写成“可见但网页不可执行” | WEB-02, WEB-03 | 需要人工判断语义是否误导成浏览器内可执行路径 | pass |
| `余额不足 -> 充值后生成` 与桌面能力边界没有被混写 | GROW-01, WEB-03 | 需要人工检查 CTA 逻辑是否自洽 | pass |
| 下游消费面足够明确，后续实现阶段知道文档将落到哪些真实文件 | WEB-01 | 需要人工判断规范是否可执行 | pass |

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| WEB-01 | 07-01, 07-02 | 网页端在生成前清楚解释 Bottle 1.0 / Bottle 2.0 差异 | ✓ SATISFIED | 定位稿固定标准文案；copy deck 固定 `选择学习素材质量` 及两条主文案 |
| WEB-02 | 07-02 | 网页端不得执行 Bottle 1.0 | ✓ SATISFIED | 定位稿、CTA spec、copy deck 都明确写出 Bottle 1.0 只可解释/引导，不能网页执行 |
| WEB-03 | 07-02 | 当 Bottle 1.0 更适合时，网页端提供清晰桌面 CTA | ✓ SATISFIED | CTA spec 将 Bottle 1.0、链接导入、高风险素材主 CTA 固定为 `下载桌面端` |
| GROW-01 | 07-02 | 上传模型卡和受阻状态使用更清晰的场景 guidance | ✓ SATISFIED | CTA spec 和 copy deck 固定模型卡标题、桌面 CTA、余额恢复和 admin/runtime 命名 |
| GROW-02 | 07-01 | 里程碑留下 benchmark-backed monetization summary 且不引入订阅 | ✓ SATISFIED | 竞品矩阵和定位稿都沉淀了官方 benchmark 与“不引入订阅 / 沿用按次付费”结论 |

## Anti-Patterns Found

None.

## Gaps Summary

No gaps found. Phase 7 now has all four required spec artifacts, every Phase 7 requirement is covered, and manual review confirms the core product boundary remained intact: Bottle 1.0 is visible on the web but never executable there.

---

_Verified: 2026-03-28_  
_Verifier: Codex (inline execute-phase verification)_
