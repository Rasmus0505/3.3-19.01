# 架构

## 总体形态

这个仓库是一个多表面应用：

- `app/` 中的 FastAPI 后端
- `frontend/` 中的 React/Vite Web UI
- `desktop-client/` 中的 Electron 桌面客户端
- `migrations/` 中的 Alembic 迁移
- `tests/` 中的自动化验证体系

Web 和 Desktop 在大部分产品流程与 API 合约上共享同一套产品模型。Desktop 更像是在现有前端外面包了一层能力更强的运行时，而不是重新实现一套独立产品。

## 后端分层

后端采用的是务实分层，而不是教科书式框架目录。

### 入口 / 应用组装

- `app/main.py` 创建 FastAPI 应用，挂载静态资源，暴露 `/health` 与 `/health/ready`，注册中间件并接入各 router。

### API 层

- `app/api/routers/*` 承载 auth、billing、lessons、media、practice、wallet、admin、transcribe 等路由。
- 这里同时存在平铺 router 文件和分目录 router 包，例如 `app/api/routers/auth.py` 与 `app/api/routers/auth/router.py` 并存，`app/api/routers/admin.py` 与 `app/api/routers/admin/router.py` 也并存。

### Service 层

- `app/services/*` 负责业务编排和领域流程。
- 代表文件包括：`lesson_command_service.py`、`lesson_query_service.py`、`lesson_task_manager.py`、`billing.py`、`billing_service.py`、`transcription_service.py`。
- lesson 相关逻辑已经明显拆成 command/query 模式，而不是全部塞在 router 里。

### Repository / 持久化层

- `app/repositories/*` 封装数据库读写。
- 数据模型位于 `app/models/*`。
- Pydantic 风格的请求/响应 schema 位于 `app/schemas/*`。

### Infra / 适配层

- `app/infra/*` 封装外部提供方能力和本地 runtime 工具。
- 例如：`app/infra/asr/dashscope.py`、`app/infra/translation/qwen_mt.py`、`app/infra/media_ffmpeg.py`、`app/infra/runtime_tools.py`。

## 请求与数据流

典型 API 流程如下：

1. Router 校验并标准化输入
2. Router 解析鉴权/数据库依赖
3. Service 层完成业务编排、计费判断、任务调度
4. Repository / Model 层读写持久化状态
5. Serializer / Schema 层塑造响应结构

例子：

- 鉴权：`app/api/routers/auth/router.py` -> `app/security.py` + `app/services.billing_service.get_or_create_wallet_account`
- 课程上传：`app/api/routers/lessons/router.py` -> `app/services.lesson_command_service.py` / `app/services.lesson_service.py`
- 就绪检查：`app/main.py` -> 数据库检查 + 管理员 bootstrap + 媒体/runtime 探针

## Web 前端架构

- 应用入口：`frontend/src/main.jsx`
- 根应用：`frontend/src/App.jsx`
- 共享 Shell：`frontend/src/app/LearningShell.jsx`
- 共享 API Client：`frontend/src/shared/api/client.js`
- 全局状态：`frontend/src/store/` 中的 Zustand slices
- `frontend/src/features/` 下按功能拆分：auth、upload、lessons、immersive learning、wallet、wordbook 和多个 admin workspace

桌面端感知能力主要被注入到共享 API Client 和入口层：

- `frontend/src/main.jsx` 根据环境在 `BrowserRouter` 和 `HashRouter` 之间切换
- `frontend/src/shared/api/client.js` 在 Electron 环境下通过 `window.desktopRuntime.requestCloudApi(...)` 走桌面云桥接

## Desktop 架构

Electron 采用标准的 main/preload/renderer 分层：

- Main process：`desktop-client/electron/main.mjs`
- Preload bridge：`desktop-client/electron/preload.cjs`
- Runtime config：`desktop-client/electron/runtime-config.mjs`
- Helper/runtime 打包逻辑：`desktop-client/electron/helper-runtime.mjs`
- 模型更新逻辑：`desktop-client/electron/model-updater.mjs`

Renderer 仍然是共享前端构建产物。所有本地能力都通过 preload 暴露，而不是让前端直接接触 Node 能力。

## 健康与安全护栏

`app/main.py` 不只是一个薄启动器，它还承担：

- 生产数据库策略检查
- 导出确认文本安全策略检查
- ffmpeg / ffprobe / 上传型 ASR 的运行时就绪检查
- 当数据库未就绪时阻断 `/api/*` 请求
- SPA 静态路由 fallback