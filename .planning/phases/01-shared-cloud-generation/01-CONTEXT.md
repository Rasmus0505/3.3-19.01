# Phase 1: Shared Cloud Generation - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

交付一条稳定的 Bottle 2.0 云端生成路径，让 Web 和 Desktop 用户都能使用，同时避免让中心服务器变成默认的重媒体处理节点。本阶段只讨论共享的 Bottle 2.0 云端生成路线，不覆盖 Bottle 1.0 本地生成，也不覆盖桌面端链接导入。

</domain>

<decisions>
## Implementation Decisions

### 网页端媒体准备路径
- **D-01:** Bottle 2.0 应优先走云端文件路径，而不是在你的服务器上做音频转换/转码后再上传。
- **D-02:** 如果某些网页端 Bottle 2.0 素材在直连云端文件链路下失败，产品应推荐用户转到桌面客户端，而不是回退到服务器侧媒体转换。

### 运行时能力提示
- **D-03:** 当某项能力仅支持桌面端时，产品应使用清晰弹窗解释原因，而不是静默失败或隐藏边界。
- **D-04:** 桌面专属弹窗必须在右下角动作区提供下载按钮。
- **D-05:** 如果正式安装包直链尚未准备好，下载入口可以临时落到群号或人工分发说明。

### 共享云端任务体验
- **D-06:** Bottle 2.0 在 Web 和 Desktop 上应尽量表现为同一套任务状态流。
- **D-07:** 期望的统一用户可见阶段为：upload -> submit cloud task -> transcribing -> generating lesson -> completed/failed。
- **D-08:** 即使底层实现不同，重试、失败提示和任务恢复体验也应尽量统一。

### 本阶段支持的输入范围
- **D-09:** Phase 1 的 Bottle 2.0 先支持本地文件上传。
- **D-10:** 支持的本地文件类别应包括音频和视频。
- **D-11:** 链接导入不并入 Bottle 2.0 Phase 1 规划；即使产品未来会支持，它当前仍属于后续桌面端导入阶段。

### 大文件处理策略
- **D-12:** 在真实云端链路能力验证前，不要先写死一个过于保守的产品级文件大小上限。
- **D-13:** 产品应向用户显示可见的大小/时长提示；当当前限制被触发或可靠性不足时，应推荐桌面端，而不是服务器兜底。

### the agent's Discretion
- 桌面专属弹窗的具体视觉样式和 CTA 层级
- 共享云端任务状态文本的最终中文表达，只要阶段模型一致即可
- 在完成真实上传/模型边界验证后，警告阈值与硬阻断阈值的具体划分

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 产品范围与路线图
- `.planning/PROJECT.md` — 产品边界、运行时分层、计费/密钥归属、服务器压力约束
- `.planning/REQUIREMENTS.md` — 第 1 阶段需求契约（`AUTH-01`、`AUTH-02`、`AUTH-03`、`BILL-01`、`WEB-01`、`WEB-02`、`WEB-03`、`DESK-02`）
- `.planning/ROADMAP.md` — 第 1 阶段目标、成功标准与规划边界

### 现有 Bottle 2.0 上传/任务链路
- `app/api/routers/dashscope_upload.py` — Bottle 2.0 直传上传策略接口
- `app/api/routers/lessons/router.py` — `dashscope_file_id` 任务创建和 lesson task API 契约
- `app/services/lesson_command_service.py` — 基于 `dashscope_file_id` 的任务创建与排队编排
- `app/services/lesson_service.py` — 基于已上传 DashScope 文件 ID 的生成流程

### 共享前端与桌面云桥接
- `frontend/src/features/upload/UploadPanel.jsx` — 现有 Bottle 2.0 直传体验、状态文案、能力提示、桌面端专属消息
- `frontend/src/features/upload/asrStrategy.js` — Bottle 2.0 / Bottle 1.0 的云端/本地路由逻辑和错误映射
- `frontend/src/shared/api/client.js` — 共享请求客户端与桌面端 `requestCloudApi` 桥接
- `desktop-client/electron/preload.cjs` — 向 renderer 暴露桌面云桥接能力
- `desktop-client/electron/main.mjs` — 承载桌面端云请求转发和 runtime 信息

### 能力与模型元数据
- `app/services/asr_model_registry.py` — 模型能力注册和 Bottle 2.0 元数据
- `frontend/src/shared/lib/asrModels.js` — 前端模型标签和运行时描述

### No external specs
- 本轮讨论中没有额外引用项目外 spec / ADR；当前需求已由上述决策和现有代码路径完整描述。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/features/upload/UploadPanel.jsx`：已经包含 Bottle 2.0 直传流程、离线提示、能力边界提示和云端任务编排钩子。
- `frontend/src/shared/api/client.js`：已经抽象了浏览器 fetch 与桌面端 `window.desktopRuntime.requestCloudApi(...)` 云桥接。
- `app/api/routers/dashscope_upload.py`：已经提供直传所需的上传策略接口。
- `app/api/routers/lessons/router.py`：已经接收 `dashscope_file_id` 并创建云端任务。
- `app/services/lesson_command_service.py`：已经持久化/排队 Bottle 2.0 云端任务。

### Established Patterns
- 云端生成和本地生成在当前上传流里已经以“运行时策略”而不是“完全独立产品”形式存在。
- Desktop 复用同一套 renderer，只是通过 cloud bridge 替换传输层，而不是单独维护第二套前端。
- 产品里已经存在离线、云端不可用、桌面端专属等用户提示模式。
- 任务进度、暂停/恢复、debug-report 等 lesson task 机制已经存在，后续应复用而不是重造。

### Integration Points
- Phase 1 变化主要会落在 `frontend/src/features/upload/UploadPanel.jsx`、共享 API client、`app/api/routers/dashscope_upload.py` 和 lesson task 创建/生成服务。
- Desktop 下的云端行为仍应通过共享 renderer + `desktopRuntime.requestCloudApi` 进入，而不是增加平行 UI。
- 生成入口上的 auth/billing 边界应继续复用现有钱包和鉴权契约，而不是另外写一套特殊规则。

</code_context>

<specifics>
## Specific Ideas

- 产品应强烈偏向 Bottle 2.0 的云端文件路径，不要在网页端失败时悄悄回退到服务器转码。
- 当用户碰到桌面专属边界时，产品应该解释原因，并给出明显的桌面客户端下载路径。
- 如果正式安装包托管方案还没定，先用群号/人工分发说明作为临时方案是可以接受的。
- 即使 Web 和 Desktop 在底层实现不完全一样，学习者感知到的 Bottle 2.0 仍应是同一条云端生成流程。

</specifics>

<deferred>
## Deferred Ideas

- 桌面端链接导入 / URL 转媒体生成属于后续独立阶段，不应在当前阶段扩 scope。
- 最终安装包托管/分发基础设施可后续再定，本阶段只要求前台提示和 CTA 行为成立。
- 永久性文件大小上限应在验证真实云端路径后再决定，而不是现在猜一个数字。

</deferred>

---

*Phase: 01-shared-cloud-generation*
*Context gathered: 2026-03-26*