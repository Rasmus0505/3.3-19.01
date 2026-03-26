# Phase 1: Shared Cloud Generation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 01-Shared Cloud Generation
**Areas discussed:** 网页端媒体准备路径、运行时能力提示、共享云端任务体验、输入范围与大文件处理

---

## 网页端媒体准备路径

| Option | Description | Selected |
|--------|-------------|----------|
| Prefer cloud file path | 使用 Bottle 2.0 的云端文件路径，不默认走服务器侧转码 | ✓ |
| Let server transcode as fallback | 当 Web 端处理不了时，让你自己的服务器参与转码 | |

**User's choice:** 优先走云端文件路径，不让服务器成为默认转码兜底。
**Notes:** 用户明确希望降低服务器压力，并接受在网页端失败时引导用户下载桌面客户端，而不是服务器侧兜底。

---

## 运行时能力提示

| Option | Description | Selected |
|--------|-------------|----------|
| Popup + CTA | 用清晰弹窗解释桌面专属功能，并提供下载按钮 | ✓ |
| Passive inline note | 只给一个弱提示，不做强引导 | |

**User's choice:** 使用弹窗 + CTA。
**Notes:** CTA 应位于右下角；如果正式安装包链接还没准备好，可以先给群号或人工分发说明。

---

## 共享云端任务体验

| Option | Description | Selected |
|--------|-------------|----------|
| Unified stages | Web 和 Desktop 尽量看到同一套 Bottle 2.0 状态阶段 | ✓ |
| Runtime-specific flows | 允许 Web 和 Desktop 的云端任务体验明显不同 | |

**User's choice:** 尽量统一阶段状态。
**Notes:** 用户希望 Bottle 2.0 被理解成同一条云端生成产品能力，而不是两条风格不同的流程。

---

## 输入范围与大文件处理

| Option | Description | Selected |
|--------|-------------|----------|
| Local uploads only for Phase 1 | 当前阶段先支持本地音频/视频上传，链接导入放后面 | ✓ |
| Fold link import into Phase 1 | 把链接导入一并纳入当前共享云端生成阶段 | |
| Hard product cap now | 现在就写死严格文件大小上限 | |
| Validate first, warn users, recommend desktop when needed | 先验证真实云端能力，再给用户提示并推荐桌面端 | ✓ |

**User's choice:** 当前阶段先支持本地音频/视频上传；文件边界先按真实云端能力验证，不立即写死保守上限。
**Notes:** 用户并不是否定未来的链接导入，只是接受它属于后续专门阶段。超大文件或高风险场景优先推荐桌面端，而不是服务器兜底。

---

## the agent's Discretion

- 弹窗文案和 CTA 层级的具体视觉实现
- 共享 Bottle 2.0 阶段标签的最终中文表达
- 在真实云端边界验证后，具体 warning / hard-block 阈值如何划分

## Deferred Ideas

- 桌面端链接导入属于后续阶段
- 正式安装包托管/分发路径可后续再定
- 永久性大文件限制策略应基于真实验证结果再决定