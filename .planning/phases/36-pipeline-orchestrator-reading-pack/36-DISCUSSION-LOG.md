# Phase 36: Pipeline Orchestrator & Reading Pack - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10T15:52:05+08:00
**Phase:** 36-pipeline-orchestrator-reading-pack
**Areas discussed:** 生成过程展示, 阅读包成功态, 逐句对照视图, 中断恢复与失败回退

---

## 生成过程展示

| Option | Description | Selected |
|--------|-------------|----------|
| 保留工作台骨架 | 延续当前阅读页布局，只在原位增强生成状态 | |
| 舞台式主视图 | 生成阶段切成更强的主舞台，突出阶段推进和演示感 | ✓ |

**User's choice:** 舞台式主视图
**Notes:** 用户明确要求“切成更强的舞台式主视图”。

---

## 阅读包成功态

| Option | Description | Selected |
|--------|-------------|----------|
| 资产页型 | 生成后进入明显的新结果页，强调 reading pack 是可回看的成品资产 | ✓ |
| 阅读工作台型 | 保留当前 reading 页面骨架，仅在页内叠加结果头部和模式切换 | |

**User's choice:** 按推荐
**Notes:** 推荐为“资产页型”，用户确认按推荐执行。

---

## 逐句对照视图

| Option | Description | Selected |
|--------|-------------|----------|
| 左右并排 | 原句和 i+1 句横向对照，偏桌面演示 | |
| 上下堆叠 | 原句在上、i+1 在下，移动端更稳但展示弱 | |
| 句子卡片式 | 一张卡展示一组句子前后变化，适合结合变化高亮和说明 | ✓ |

**User's choice:** 按推荐
**Notes:** 在用户询问“这个是做什么的，能不能鼠标悬浮在被重写后的单词上显示原文”后，补充说明：逐句对照负责句级 before/after 理解，hover 原文负责词级即时对照，两者并存，不做替代关系。

---

## 中断恢复与失败回退

| Option | Description | Selected |
|--------|-------------|----------|
| 自动回到最近可继续状态 | 刷新或失败后优先保留上下文，让用户最快继续 | ✓ |
| 回到输入或普通阅读初态 | 流程更简单，但容易丢失用户上下文 | |

**User's choice:** 由 the agent 决定
**Notes:** 用户要求“你看哪个更符合交互原则，你就做哪个”。据此锁定为“最少丢失上下文、最容易继续”的恢复原则：完成态直接开 pack，中断态回最近阶段并给继续入口，失败态保留原文和诊断上下文。

---

## the agent's Discretion

- 舞台式主视图内部的具体排布
- 阅读包头部信息区的精确组织形式
- 恢复时默认停留在最近已完成阶段还是自动继续推进

## Deferred Ideas

- 词汇解释面板、收词接力和 pack library 资产卡片化留给 Phase 37
- 多 target-level variants 和阅读后题目生成不纳入本 phase
