# Phase 10: 管理台前后端收口 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 10-admin-console-alignment
**Areas discussed:** 中文优先表面与深链兼容, 金额与计费语义, Bottle 命名层级, 顶层信息架构

---

## 中文优先表面与深链兼容

| Option | Description | Selected |
|--------|-------------|----------|
| 只改界面文案为中文，URL 继续保持英文深链 | 页面内容中文，现有 `/admin/...` 和 query 深链继续使用 | ✓ |
| 新增中文优先路由入口，旧英文深链继续兼容 | 页面和部分入口中文化，同时维护两套路由入口 | |
| 连 URL、query 参数和深链语义都一起中文化 | 路由和深链整体重写成中文语义 | |

**User's choice:** 页面内容全部中文，网址先不强行改中文，旧链接继续能用。
**Notes:** 用户先给出“保持中文”，随后明确“就这样”，落点是可见表面中文化而不是重写 URL 契约。

---

## 金额与计费语义

| Option | Description | Selected |
|--------|-------------|----------|
| 只显示元 | 页面上只保留 `元` 语义，不再展示技术值 | |
| 元优先，必要时小字补充技术值 | 运营主视角看 `元`，需要时保留次级技术上下文 | ✓ |
| 元和技术值一直同时显示 | 所有页面长期并排显示两套金额语义 | |

**User's choice:** 2
**Notes:** 用户明确要求“元优先，必要时小字补充技术值”。

---

## Bottle 命名层级

| Option | Description | Selected |
|--------|-------------|----------|
| 运营页尽量不露技术名，只有排障页才露 | 技术模型名只保留在排障场景 | |
| 管理台主名称用 Bottle，技术名放在下方次级说明 | 用户侧只看 Bottle；管理台可保留技术名但不抢主标题 | ✓ |
| 所有页面继续同时明显显示两套名称 | Bottle 名和技术名共同作为显眼标题 | |

**User's choice:** 用户页面只显示模型名也即是 bottle；管理台上方模型名下方技术名。
**Notes:** 这条同时约束用户侧和管理台层级，后续不能把技术名重新抬回用户表面。

---

## 顶层信息架构

| Option | Description | Selected |
|--------|-------------|----------|
| 保持 4 个一级入口 | 用户运营 / 活动兑换 / 排障中心 / 安全中心 全部独立 | |
| 改成 3 个一级入口，把安全中心并进排障中心 | 更强调诊断与高权限维护统一归口 | ✓ |
| 再进一步重组，交给 the agent 自行收口 | 不预设最终一级结构 | |

**User's choice:** 2
**Notes:** 用户接受把安全中心并入排障中心，意味着 `/admin/security` 只需要保留兼容入口，不需要继续作为独立一级导航。

---

## the agent's Discretion

- 排障中心内部如何命名和编排“系统 / 安全 / 任务 / 审计”等二级区块。
- 哪些后台页保留技术模型名次级说明，哪些可以完全只显示 Bottle 名。
- 元优先金额展示的具体组件样式与帮助文案密度。

## Deferred Ideas

- 全局数字输入框体验问题：默认值为 `0` 的数字输入框不便于直接清空并重新输入，应单独作为全局 UI 修复处理。
