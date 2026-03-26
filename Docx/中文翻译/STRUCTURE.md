# 结构

## 顶层布局

- `app/` - FastAPI 应用代码
- `frontend/` - React/Vite 源码及本地构建制品
- `desktop-client/` - Electron 桌面客户端源码及缓存打包资源
- `migrations/` - Alembic 环境与版本历史
- `tests/` - unit、integration、e2e、contracts、fixtures
- `scripts/` - 迁移、启动、桌面后端、git hook 助手脚本
- `tools/` - 打包的本地可执行文件（`ffmpeg`、`ffprobe`、`yt-dlp`）
- `asr-test/` - 独立本地 ASR 实验区、模型文件、基准脚本、结果归档
- `admin-web/` - 独立的基于 nginx 的 admin 静态镜像路径
- `Docx/` - 协作/任务池文档，不属于运行时代码

## 后端树

关键后端区域：

- `app/main.py` - 应用组装、健康检查端点、静态资源服务、中间件
- `app/core/` - 配置、日志、错误助手、时区助手
- `app/db/` - engine/session/bootstrap/schema 助手
- `app/models/` - users、lessons、billing 的 SQLAlchemy 模型
- `app/api/deps/` - auth/db 依赖
- `app/api/routers/` - 路由处理器与嵌套路由包
- `app/repositories/` - 面向持久化的数据访问
- `app/services/` - 业务逻辑与任务编排
- `app/infra/` - 外部服务与本地工具适配
- `app/domain/` - lesson 与 billing 概念的小型策略/实体模块
- `app/schemas/` - 请求/响应模型

## 前端树

关键前端区域：

- `frontend/src/main.jsx` 与 `frontend/src/main-admin.jsx` - 应用入口
- `frontend/src/app/` - 壳层/启动组合
- `frontend/src/features/` - 产品功能切片
- `frontend/src/shared/` - 共享 API/client/media 助手
- `frontend/src/components/ui/` - 可复用 UI 基元
- `frontend/src/store/` - Zustand store 初始化与 slices
- `frontend/src/pages/` - 页面级组合
- `frontend/src/assets/` - 引导图片与静态资源

仓库中已存在的构建输出目录：

- `frontend/dist/`
- `frontend/dist-admin/`

## 桌面端树

关键桌面区域：

- `desktop-client/electron/` - main/preload/runtime 集成代码
- `desktop-client/scripts/` - 开发/构建/打包脚本
- `desktop-client/build/` - 安装包资源
- `desktop-client/.cache/frontend-dist/` - 缓存的 renderer 构建输出
- `desktop-client/.cache/helper-runtime/` - 缓存的已打包 helper 运行时

## 测试树

- `tests/unit/` - 隔离单元测试
- `tests/integration/` - API/服务集成测试
- `tests/e2e/` - 端到端流程测试
- `tests/contracts/` - 文件内容与打包契约测试
- `tests/fixtures/` - 可复用的 db/auth/billing/lesson 初始化助手

## 迁移树

- `migrations/env.py` - Alembic 环境
- `migrations/versions/*.py` - 观察到 28 个按时间戳命名的版本修订
- `migrations/README.md` - 迁移与生产规则

## 值得注意的混入制品

当前仓库还包含非源码或生成内容：

- `app.db`、`app.db-shm`、`app.db-wal`
- 大量 `__pycache__/` 目录与 `*.pyc` 文件
- `frontend/node_modules/`
- `frontend/dist/` 与 `frontend/dist-admin/`
- `desktop-client/.cache/`
- `asr-test/runs/` 与 `asr-test/results/` 下的 ASR 运行/结果归档

这些制品会显著影响仓库体积与开发者体验。
