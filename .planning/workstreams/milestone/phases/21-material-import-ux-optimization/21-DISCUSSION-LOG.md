# Phase 21: 素材导入 UX 优化 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 21-material-import-ux-optimization
**Areas discussed:** 默认Tab, 链接Tab文案, 自动填标题, 快捷键布局

---

## 默认 Tab 选中

|| Option | Description | Selected |
|--------|---------|------------|----------|
| 链接导入 (LINK) | 默认进入链接导入 Tab | ✓ |
| 本地文件 (FILE) | 默认进入本地文件 Tab（当前状态） | |

**User's choice:** 链接导入
**Notes:** 直接改代码即可，不需要额外讨论。

---

## 自动填标题

|| Option | Description | Selected |
|--------|---------|------------|----------|
| 代码已实现 | `UploadPanel.jsx:3458, 3651` 已有 `setDesktopLinkTitle` 调用，用户已编辑过不覆盖 | ✓ |
| 未实现需开发 | 需要重新实现 | |

**User's choice:** 代码已实现
**Notes:** 经代码审查确认，`setDesktopLinkTitle((prev) => prev || payload.title)` 在 yt-dlp 解析成功后正确填入标题，用户有输入则不覆盖。UPLOAD-03 标记为已完成，无需开发。

---

## 快捷键配置紧凑布局

|| Option | Description | Selected |
|--------|---------|------------|----------|
| 方向 A: 单行 flex | 7 个 action 横排一行，可横向滚动 | |
| **方向 B: 两行紧凑** | **第一行 4 个、第二行 3 个，每行 flex 横排，卡片宽度刚好包裹内容，不留空白** | **✓** |

**User's choice:** 方向 B（两行紧凑）
**Notes:** 用户明确要求：两行紧凑，不需要滚动，卡片不要留空白，刚刚好和配置文案所需大小即可。第二行 3 个 action 的对齐方式由 planner 决定（居中或靠左均可）。

---

## 链接 Tab 文案精简

|| Option | Description | Selected |
|--------|---------|------------|----------|
| 保留第②条 | 保留"仅支持公开单条链接，不支持 cookies、账号登录、会员内容、受限内容导入" | |
| **移除第②条** | **完全移除第②条，只保留 SnapAny 外链** | **✓** |

**User's choice:** 移除
**Notes:** 用户明确选择移除第②条说明，避免在用户粘贴链接前增加心理摩擦，降低转化阻力。

---

## Claude's Discretion

| Area | Claude Decides |
|------|----------------|
| 快捷键卡片宽度精确 CSS | `w-fit`、`min-w-0` 或其他由 planner 决定 |
| 第二行 3 个 action 水平对齐 | 居中或靠左均可 |
| SnapAny 链接文字措辞 | 是否保留"无法导入时"前缀 |

## Deferred Ideas

- GenerationConfigModal 配置弹窗 — Phase 22
- 视频内容提取单独记录类型 — Phase 22
- 历史记录按类型过滤 — Phase 22
- 字幕遮挡板策略 — Phase 23
- 桌面客户端链接恢复 — Phase 22
