# 项目研究摘要

**Project:** Bottle 英语学习产品
**Domain:** 基于用户媒体素材生成英语学习课程
**Researched:** 2026-03-26
**Confidence:** MEDIUM

## Executive Summary

这是一个已经有明显技术基础的英语学习产品。推荐路线不是重写，而是进一步收紧产品边界：保留共享的 Web / Desktop 产品模型，让桌面端成为完整能力入口，并让服务器主要承担状态、计费、编排和最终课程保存，而不是默认承担重媒体处理。

最合理的产品策略是按运行时能力进行生成分层。桌面端承担 Bottle 1.0、本地 ffmpeg、yt-dlp 和链接导入；网页端提供最广泛、最稳定的浏览器安全能力，核心围绕 Bottle 2.0。最大的风险不是技术上“做不到”，而是产品边界反复漂移，最后又回到服务器兜底媒体处理。

## Key Findings

### Recommended Stack

建议保持现有技术栈，只在现有基础上优化。

**Core technologies:**
- FastAPI / SQLAlchemy / Alembic：承载后端 API、计费、课程状态和后台能力
- React / Vite / Zustand：承载 Web / Desktop 共享产品界面
- Electron：承载完整桌面能力和本地 runtime bridge
- DashScope 云端 ASR + faster-whisper 本地 bundle：共同组成 Bottle 2.0 / Bottle 1.0 双路径模型

### Expected Features

**Must have (table stakes):**
- Auth、钱包/点数、兑换码、课程生成、学习/练习消费流程
- 清晰的生成进度与失败反馈
- Bottle 2.0 同时可服务网页端和桌面端

**Should have (competitive):**
- 低摩擦桌面端 Bottle 1.0 本地生成
- 桌面端 URL 导入能力
- 不同生成路线最终落成一致课程结果

**Defer (v2+):**
- 任何和浏览器环境天然冲突的重本地工具链能力
- 用户自己管理密钥的使用路径

### Architecture Approach

应当延续现有共享产品架构，但把边界说清楚。桌面端负责本地工具链和完整能力，网页端负责浏览器安全范围内的生成路径，后端负责状态、计费、后台和统一课程结果保存。

### Critical Pitfalls

1. **服务器滑向媒体处理节点** — 应优先把重处理压回用户设备侧或云对象存储链路
2. **浏览器越界承诺** — 不应在浏览器中承诺本地工具链完全等价能力
3. **学习产物不一致** — 需要统一后续课程契约
4. **计费与能力不匹配** — 价格与能力边界要显式绑定
5. **准备摩擦** — 桌面端尽量自动化，网页端要把边界讲清楚

## Implications for Roadmap

### Phase 1: Shared Cloud Generation Hardening
**Rationale:** Bottle 2.0 是 Web 与 Desktop 的共同入口，应优先稳定。
**Delivers:** 稳定共享的云端生成路径和能力边界表达
**Addresses:** 运行时分层、网页端可用性、点数消费路径

### Phase 2: Desktop Bottle 1.0 Experience
**Rationale:** 本地生成是桌面端的核心差异化能力，也最能减轻服务器压力。
**Delivers:** 自动化的本地准备体验和稳定的 Bottle 1.0 生成链路
**Uses:** Electron helper、本地模型、ffmpeg

### Phase 3: Unified Lesson and Practice Output
**Rationale:** 用户关心的是学习结果，而不是底层生成路线。
**Delivers:** 不同生成路线统一的课程与学习产物

### Phase 4: Desktop Link Import
**Rationale:** 链接导入依赖更稳定的桌面端 runtime 边界。
**Delivers:** 基于 yt-dlp / 本地转换的桌面端媒体导入能力

### Phase 5: Admin Pricing and Operations
**Rationale:** 计费和后台运营必须反映真实产品策略。
**Delivers:** 可配置的价格体系、可见的运行状态和后台控制

### Phase 6: Product Polish and Reliability
**Rationale:** 引导、fallback 和边界场景处理直接决定学习者的日常体验。
**Delivers:** 更低摩擦、更可信赖的产品使用体验

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | 现有代码已经支持这条产品方向 |
| Features | MEDIUM | 产品包装和能力边界仍需进一步收紧 |
| Architecture | HIGH | 共享 renderer + desktop bridge 已经存在 |
| Pitfalls | MEDIUM | 主要不确定性在运营边界和执行纪律，而不是底层架构 |

**Overall confidence:** MEDIUM

### Gaps to Address

- 需要进一步验证 Bottle 2.0 在 Web 端的最佳低服务器压力媒体路径
- 需要明确 Web / Desktop 能力差异时的产品提示方式
- 需要进一步完善不同运行时、不同生成模式下的最终定价策略

---
*Research completed: 2026-03-26*
*Ready for roadmap: yes*