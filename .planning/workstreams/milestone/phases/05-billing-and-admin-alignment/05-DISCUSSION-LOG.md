# Phase 5: Billing and Admin Alignment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 05-billing-and-admin-alignment
**Areas discussed:** Admin workspace structure, billing control scope, troubleshooting depth, operations organization, troubleshooting placement

---

## 管理台工作区结构

| Option | Description | Selected |
|--------|-------------|----------|
| 精简主后台 | 在现有壳层基础上精简，只保留必要入口，降低信息密度 | ✓ |
| 升级为更完整的运营后台 | 直接把更多运营/监控能力提升为主后台结构 | |

**User's choice:** 精简主后台
**Notes:** 用户要求“可以进行精简和优化，只保留必要的和信息密度低的样子”。

---

## 计费配置范围

| Option | Description | Selected |
|--------|-------------|----------|
| 计费 + 运行参数混合 | 价格、启停、并发阈值、切片时长、最大并发一起维护 | |
| 拆成计费与运行控制两块 | 计费独立，运行参数进入另一套管理界面 | |
| 只保留计费配置 | 只管理价格和启停，不提供运行参数管理 | ✓ |

**User's choice:** 只保留计费配置
**Notes:** 用户明确要求“只保留计费配置，不要管理运行参数”。

---

## 排障入口深度

| Option | Description | Selected |
|--------|-------------|----------|
| 基础健康页 | 只看 `/health`、`/health/ready` 和简单状态 | |
| 中等深度状态页 | 健康检查 + 模型/运行就绪状态 | |
| 完整排障入口 | 系统状态、任务失败、翻译失败、操作日志、运行就绪统一可查 | ✓ |

**User's choice:** 完整排障入口
**Notes:** 用户要求“一套完整排障入口方便开发者快速定位错误”。

---

## 运营组织方式

| Option | Description | Selected |
|--------|-------------|----------|
| 用户中心型 | 从用户出发，延伸到钱包、兑换、运营操作 | ✓ |
| 活动运营型 | 从批次、兑换码、活动效果出发组织后台 | |
| 双入口分层型 | 拆成“用户与计费”/“兑换与活动”两个低密度入口 | |

**User's choice:** 用户中心型
**Notes:** 用户选择“用户中心型”，说明主业务后台应先服务于按用户排查和处理问题。

---

## 排障区放置方式

| Option | Description | Selected |
|--------|-------------|----------|
| 单独开发者/高级运维区 | 与业务后台分开，面向排障与开发定位 | ✓ |
| 混入主导航 | 直接作为主后台常规入口之一 | |
| the agent decides | 由后续规划决定 | |

**User's choice:** 单独开发者/高级运维区
**Notes:** 用户确认“要，单独做一个排障区”。

---

## the agent's Discretion

- 主后台精简后的具体入口名称与排序
- 用户中心型页面中的低密度布局实现方式
- 主后台到排障区、以及用户页到兑换/审计页的跳转细节
- 排障区内部 tab/panel 的精确分组方式

## Deferred Ideas

None.
