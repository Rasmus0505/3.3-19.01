# 结构

## 顶层布局

- `app/` - FastAPI 应用代码
- `frontend/` - React/Vite 源码和本地构建产物
- `desktop-client/` - Electron 桌面客户端源码和缓存构建产物
- `migrations/` - Alembic 环境与 revision 历史
- `tests/` - unit、integration、e2e、contract、fixture
- `scripts/` - 迁移、启动、桌面后端、git hook 等辅助脚本
- `tools/` - 打包使用的本地可执行文件（`ffmpeg`、`ffprobe`、`yt-dlp`）
- `asr-test/` - 独立本地 ASR 实验区、模型文件、benchmark 脚本与结果归档
- `admin-web/` - 独立 nginx 承载的 admin 静态镜像路径
- `Docx/` - 协作/任务池文档，不属于运行时代码

## 后端目录

关键区域包括：

- `app/main.py` - 应用组装、健康检查、静态资源路由、中间件
- `app/core/` - 配置、日志、错误、时区等核心模块
- `app/db/` - engine/session/bootstrap/schema helper
- `app/models/` - SQLAlchemy 模型，如 user、lesson、billing
- `app/api/deps/` - 鉴权/数据库依赖
- `app/api/routers/` - 路由处理器和分目录 router 包
- `app/repositories/` - 持久化导向的数据访问层
- `app/services/` - 业务编排和任务流程
- `app/infra/` - 外部服务和本地工具适配层
- `app/domain/` - lesson / billing 的轻量领域实体与策略
- `app/schemas/` - 请求/响应模型

## 前端目录

关键区域包括：

- `frontend/src/main.jsx` 与 `frontend/src/main-admin.jsx` - 入口文件
- `frontend/src/app/` - shell / bootstrap 组合
- `frontend/src/features/` - 业务功能切片
- `frontend/src/shared/` - 共享 API / media / util
- `frontend/src/components/ui/` - 通用 UI primitives
- `frontend/src/store/` - Zustand store 与 slices
- `frontend/src/pages/` - 页面级组合
- `frontend/src/assets/` - onboarding 图片等静态资源

仓库里已经存在的构建输出目录：

- `frontend/dist/`
- `frontend/dist-admin/`

## 桌面端目录

关键区域包括：

- `desktop-client/electron/` - main/preload/runtime 集成代码
- `desktop-client/scripts/` - dev/build/package 脚本
- `desktop-client/build/` - 安装器资源
- `desktop-client/.cache/frontend-dist/` - 缓存的 renderer 构建产物
- `desktop-client/.cache/helper-runtime/` - 缓存的 helper/runtime 产物

## 测试目录

- `tests/unit/` - 聚焦单模块/单能力的单元测试
- `tests/integration/` - API / service 集成测试
- `tests/e2e/` - 端到端流程测试
- `tests/contracts/` - 文件结构/打包/桥接契约测试
- `tests/fixtures/` - 复用的 db/auth/billing/lesson fixture

## 迁移目录

- `migrations/env.py` - Alembic 环境入口
- `migrations/versions/*.py` - 目前观察到 28 个 revision
- `migrations/README.md` - 迁移和生产规则说明

## 混入的非源码工件

仓库当前还包含不少非源码或生成内容：

- `app.db`、`app.db-shm`、`app.db-wal`
- 许多 `__pycache__/` 目录和 `*.pyc`
- `frontend/node_modules/`
- `frontend/dist/` 和 `frontend/dist-admin/`
- `desktop-client/.cache/`
- `asr-test/runs/` 与 `asr-test/results/` 下的 ASR 运行结果和归档

这些内容会明显影响仓库体积与日常维护体验。