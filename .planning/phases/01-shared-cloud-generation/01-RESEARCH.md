# Phase 1: Shared Cloud Generation - 研究

**Researched:** 2026-03-26
**Status:** Ready for planning

## Objective

研究如何为 Web 和 Desktop 同时落地一条稳定的 Bottle 2.0 云端生成路径，并避免让 Bottle 主服务器成为默认重媒体处理节点。

## Key Findings

### 1. 官方 DashScope 约束天然偏向“云端文件处理”，而不是“服务器中转转码”

从阿里云 / DashScope 官方资料可以得出：

- `qwen3-asr-flash-filetrans` 是长文件异步转写模型。
- 模型输入更偏向“公网可访问的文件 URL”，而不是把本地文件直接塞进识别接口本身。
- 官方推荐使用 OSS / 云对象存储为转写提供文件 URL。
- 官方列出的支持格式同时包含音频和视频容器，例如 `mp3`、`wav`、`m4a`、`ogg`、`opus`、`mp4`、`mov`、`mkv`、`avi`、`flv`、`webm`、`wmv`。
- 官方给出的实用上限是 **2 GB** 和 **12 小时**。
- 对非 PCM 输入，服务端会先做重采样后再识别。

含义：
- 你的产品目标在技术上和 DashScope 的设计方向是对齐的：先把文件送到云端对象存储，再用云端文件引用去转写。
- 没有必要把你自己的服务器变成 Bottle 2.0 的默认音频转换节点。

### 2. 当前代码库已经具备接近目标形态的直传架构

现有实现里已经有一条很接近目标的路径：

- `app/api/routers/dashscope_upload.py` 会申请上传策略，并返回 `upload_host`、`upload_dir`、`oss_fields`、`file_id`
- `frontend/src/features/upload/UploadPanel.jsx` 已经会用该策略把文件直传到云端存储，然后再带着 `dashscope_file_id` 调用 `/api/lessons/tasks`
- `app/api/routers/lessons/router.py` 已经接收 `dashscope_file_id` 并创建生成任务
- `app/services/lesson_command_service.py` 会把 `dashscope_file_id` 持久化为任务产物并排队执行
- `app/services/lesson_service.py::generate_from_dashscope_file_id(...)` 会拿到云端对象路径后生成签名 URL，再直接从云端对象进入 ASR 流程，而不是在 Bottle 服务器上做本地媒体转换

含义：
- Phase 1 不是“发明一套新架构”，而是把现有直传链路收敛成产品主路径。

### 3. 仓库里仍然存在一条“服务器中转”的旧 Bottle 2.0 路径

当前仓库还保留了另一条 Bottle 2.0 流：

- `app/api/routers/lessons/cloud_transcribe.py`
- `frontend/src/features/upload/CloudUploadPanel.tsx`

这条路径会把浏览器媒体上传到 Bottle 服务器，落到临时文件，再由服务器转发到 DashScope。虽然文件不长期落地，但服务器仍然介入了媒体处理。

含义：
- 这条旧路径和当前产品决策冲突：你希望 Bottle 2.0 优先走云端文件链路，而不是默认让服务器参与媒体处理。
- Phase 1 需要明确：用户主路径应收敛到直传 + `dashscope_file_id`，而不是继续让旧路径留在前台主流程里。

### 4. Desktop 与 Web 已经共享同一套 renderer 侧云端传输抽象

- `frontend/src/shared/api/client.js` 已经抽象了浏览器 fetch 与桌面端 `window.desktopRuntime.requestCloudApi(...)`
- `desktop-client/electron/preload.cjs` 与 `desktop-client/electron/main.mjs` 已经实现了桌面端云桥接
- `frontend/src/features/upload/UploadPanel.jsx` 已经承载了大部分统一的 Bottle 2.0 UX 逻辑

含义：
- 正确方向是统一共享上传流的状态标签、恢复行为和能力提示，而不是为 Web / Desktop 再拆两套 Bottle 2.0 产品体验。

### 5. 产品文案层已经有桌面专属提示的基础能力

当前上传流里已经具备：

- offline / cloud-unavailable 状态处理
- Bottle 1.0 / Bottle 2.0 路由决策逻辑
- desktop-only / local-only 用户提示文案
- 桌面 runtime 检查和 helper 状态查询

含义：
- Phase 1 中新增“桌面端专属弹窗 + CTA”是增量强化，而不是产品重构。

## Recommended Approach

1. 让“直传 + `dashscope_file_id`”成为 Bottle 2.0 的唯一主路径。
2. 把 `cloud_transcribe` 这种服务器中转路径降级为历史/兼容路径，不能继续做前台主流程默认值。
3. 在共享上传流里统一状态命名和任务恢复体验。
4. 当浏览器能力不足或可靠性不够时，优先引导到桌面端，而不是回退到服务器转码。
5. 文件大小边界先做“软提示 + 实测验证”，不要在正式验证前提前写死一个远小于提供方上限的产品值。

## Known Unknowns

- 浏览器中真实 `video/*` 文件走直传链路时，在所有样本上是否都足够稳定，仍需用真实 `mp4` / `mov` / `webm` 验证。
- 最终对用户展示文件边界时，是按文件大小、时长还是两者一起提示，还需要产品文案层进一步定型。
- 旧的服务器中转路径是立即移除，还是只下掉前台入口，仍需在实现层决定。

## Research Flags

- 需要对真实 `mp4` / `mov` / `webm` 样本做定向验证，再决定最终 UI 限制文案。
- 需要检查所有当前仍可触发 Bottle 2.0 的前端入口，确认没有入口仍默认走服务器中转。

## Validation Architecture

Phase 1 的验证应持续覆盖三件事：

1. **契约稳定性**
   - 上传策略响应结构稳定
   - `dashscope_file_id` 任务创建契约稳定

2. **主路径收敛**
   - 共享上传 UI 默认走直传链路
   - 桌面端不会在云端生成路径上分叉出另一套状态词汇体系

3. **边界行为**
   - 浏览器场景不适合时，产品推荐桌面端，而不是服务器兜底
   - auth / 余额错误仍然以用户可理解方式呈现

## Sources

### Official
- Aliyun Model Studio: `qwen-speech-recognition` — 文件转写模型能力、支持格式、大小/时长限制、文件 URL 指导
- Aliyun Model Studio: 上传策略 / 临时上传能力相关文档

### Codebase
- `app/api/routers/dashscope_upload.py`
- `app/api/routers/lessons/router.py`
- `app/api/routers/lessons/cloud_transcribe.py`
- `app/services/lesson_command_service.py`
- `app/services/lesson_service.py`
- `frontend/src/features/upload/UploadPanel.jsx`
- `frontend/src/features/upload/CloudUploadPanel.tsx`
- `frontend/src/shared/api/client.js`