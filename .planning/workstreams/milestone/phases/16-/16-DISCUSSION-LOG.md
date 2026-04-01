# Phase 16: 公告与更新日志系统 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 16-announcement-system
**Areas discussed:** 数据模型 + Admin 页面设计, 用户端展示入口, 公告的端能力匹配与持久化

---

## 公告系统讨论范围

|| Option | Description | Selected |
|--------|--------|-------------|----------|
| 仅数据模型 + Admin 页面设计 | 只讨论公告存哪和 admin 管理入口 | |
| 仅用户端展示入口 | 只讨论 banner/modal/changelog 在哪看 | |
| 仅端能力匹配与持久化 | 只讨论如何匹配 web/desktop 和已读状态 | |
| 以上全部 | 全部讨论 | ✓ |

**User's choice:** 以上全部
**Notes:** 用户希望全面讨论公告系统的各个层面

---

## Admin 公告管理入口位置

|| Option | Description | Selected |
|--------|--------|-------------|----------|
| 新增公告管理 Tab（独立 Tab） | 独立入口，运营人员容易找到 | ✓ |
| 放在系统设置页（AdminSystemPage 内） | 不增加 Tab 数量，适合小型管理 | |
| 新增独立公告管理页面 | 介于两者之间 | |

**User's choice:** 新增公告管理 Tab（独立 Tab）
**Notes:** 运营人员需要独立、清晰的公告管理入口，不应混在系统设置里

---

## Banner 触发方式

|| Option | Description | Selected |
|--------|--------|-------------|----------|
| 登录/打开 App 时自动弹出（自动弹出） | 阻塞视线，直到用户主动关闭 | ✓ |
| 需要用户主动触发（点击小铃铛） | 非阻塞，用户自主查看 | |

**User's choice:** 登录/打开 App 时自动弹出（自动弹出）
**Notes:** —

---

## Modal 类型公告范围

|| Option | Description | Selected |
|--------|--------|-------------|----------|
| 仅「重要公告」（服务器维护/故障/账号安全） | 仅重要事件才弹 Modal | |
| 所有 modal 类型公告 | 所有标记为 modal 的都弹 | ✓ |

**User's choice:** 所有 modal 类型公告
**Notes:** —

---

## Changelog 展示位置

|| Option | Description | Selected |
|--------|--------|-------------|----------|
| 个人中心 / 设置页面内嵌 | 找起来方便，不占路由 | ✓ |
| 单独的「更新日志」页面（/changelog） | 更像正规产品，但占一个路由 | |

**User's choice:** 个人中心 / 设置页面内嵌
**Notes:** —

---

## 公告存储

|| Option | Description | Selected |
|--------|--------|-------------|----------|
| 后端数据库（SQLite/PostgreSQL） | 可跨设备同步、admin 可查看到达情况、支持未来扩展 | ✓ |
| 仅前端 localStorage（无后端记录） | 无后端改动，但只能单机使用、无法统计 | |

**User's choice:** 后端数据库（SQLite/PostgreSQL）
**Notes:** —

---

## 公告是否需要登录

|| Option | Description | Selected |
|--------|--------|-------------|----------|
| 无需用户身份（匿名即可看） | 所有人都能看到，适合公开维护公告 | |
| 登录用户专属（根据 user_id 记录已读） | 跨设备同步，精细化控制 | ✓ |

**User's choice:** 登录用户专属（根据 user_id 记录已读）
**Notes:** —

---

## 公告数据模型字段范围

|| Option | Description | Selected |
|--------|--------|-------------|----------|
| 最简版：标题 + 内容 + 类型 + 状态 | 当前够用，结构简单 | ✓ |
| 完整版（+ 发布时间 + 结束时间 + 排序权重 + 目标端） | 满足 ANNC-06 扩展，但当前阶段不需要 | |

**User's choice:** 最简版：标题 + 内容 + 类型 + 状态
**Notes:** ANNC-06 定时投放将来需迁移 schema，当前阶段保持最简

---

## Claude's Discretion

- Banner 横幅的具体视觉样式和文案措辞（由设计/实现阶段决定）
- Modal 弹窗的具体动画和交互细节
- Changelog 在个人中心的具体内嵌位置和展示方式
- 公告已读状态的精确存储结构和 API 设计
- 数据库表的具体实现（SQLAlchemy 模型结构）

---

## Deferred Ideas

- ANNC-06 定时投放、结束时间、排序权重、精细化人群定向 — 将来单独 phase 实现
- 发音/音标可行性评估 — 归入 Phase 17/18 词本 deferred

