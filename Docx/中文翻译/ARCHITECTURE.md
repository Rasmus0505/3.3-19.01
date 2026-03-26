# 架构

## 高层形态

该仓库是一个多端形态应用：

- 位于 `app/` 的 FastAPI 后端
- 位于 `frontend/` 的 React/Vite Web UI
- 位于 `desktop-client/` 的 Electron 桌面壳层
- 位于 `migrations/` 的 Alembic 迁移
- 位于 `tests/` 的自动化验证

Web 与桌面端共享了大部分产品流程和 API 契约。桌面客户端是对现有前端的封装，而不是重新实现一套前端。

## 后端分层

后端采用务实的分层结构，而不是严格按框架生成的目录布局。

### 入口 / 应用组装

- `app/main.py` 负责创建 FastAPI 应用、挂载静态文件、暴露 `/health` 与 `/health/ready`、注册中间件并引入各路由。

### API 层

- `app/api/routers/*` 包含 auth、billing、lessons、media、practice、wallet、admin、transcription 等路由处理器。
- 可以看到同时存在扁平路由文件与嵌套路由包，例如 `app/api/routers/auth.py` 与 `app/api/routers/auth/router.py` 并存，`app/api/routers/admin.py` 与 `app/api/routers/admin/router.py` 并存。

### 服务层

- `app/services/*` 包含业务流程与编排逻辑。
- 代表性服务：`lesson_command_service.py`、`lesson_query_service.py`、`lesson_task_manager.py`、`billing.py`、`billing_service.py`、`transcription_service.py`。
- lesson 领域按 command/query 职责拆分，而不是把全部逻辑都放在路由层。

### 仓储 / 持久化层

- `app/repositories/*` 封装数据库读写。
- 模型位于 `app/models/*`。
- 类 Pydantic 的请求/响应 schema 位于 `app/schemas/*`。

### 基础设施 / 适配层

- `app/infra/*` 封装外部提供方与本地运行时工具。
- 例如：`app/infra/asr/dashscope.py`、`app/infra/translation/qwen_mt.py`、`app/infra/media_ffmpeg.py`、`app/infra/runtime_tools.py`。

## 请求与数据流

典型 API 流程：

1. 路由层校验并规范化请求输入。
2. 路由层解析 auth/db 依赖。
3. 服务层执行编排逻辑，并进行计费与任务决策。
4. 仓储/模型层持久化或读取状态。
5. 序列化/schema 层组装响应载荷。

示例：

- Auth：`app/api/routers/auth/router.py` -> `app/security.py` + `app/services.billing_service.get_or_create_wallet_account`
- Lesson 上传：`app/api/routers/lessons/router.py` -> `app/services.lesson_command_service.py` / `app/services.lesson_service.py`
- 就绪检查：`app/main.py` -> DB 检查 + admin 引导初始化 + 媒体/运行时探针

## Web 前端架构

- 应用入口：`frontend/src/main.jsx`
- 根应用：`frontend/src/App.jsx`
- 共享壳层：`frontend/src/app/LearningShell.jsx`
- 共享 API 客户端：`frontend/src/shared/api/client.js`
- 全局状态：`frontend/src/store/`（Zustand slices）
- `frontend/src/features/` 下按功能组织，覆盖 auth、upload、lessons、沉浸式学习、wallet、wordbook 以及多个 admin 工作区

桌面感知行为注入在共享 API 客户端和入口处：

- `frontend/src/main.jsx` 在 `BrowserRouter` 与 `HashRouter` 之间切换
- `frontend/src/shared/api/client.js` 在 Electron 环境下使用 `window.desktopRuntime.requestCloudApi(...)`

## 桌面端架构

Electron 采用标准的 main/preload/renderer 拆分：

- Main 进程：`desktop-client/electron/main.mjs`
- Preload 桥接：`desktop-client/electron/preload.cjs`
- 运行时配置：`desktop-client/electron/runtime-config.mjs`
- Helper/运行时打包逻辑：`desktop-client/electron/helper-runtime.mjs`
- 模型更新逻辑：`desktop-client/electron/model-updater.mjs`

Renderer 使用共享前端构建产物。本地专有能力通过 preload 桥暴露，而不是直接开放 Node 访问。

## 健康与安全闸门

`app/main.py` 不只是一个轻量启动文件，它还会强制执行：

- 生产数据库策略
- 导出确认保护策略
- ffmpeg/ffprobe 与可上传 ASR 的运行时就绪检查
- 数据库未就绪时阻断 API 请求
- 静态 SPA 回退行为
