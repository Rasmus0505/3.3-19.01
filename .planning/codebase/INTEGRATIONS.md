# 集成

## 外部服务

### DashScope

用于云端 ASR 以及兼容式翻译调用。

相关文件：

- `app/services/asr_dashscope.py`
- `app/infra/asr/dashscope.py`
- `app/api/routers/dashscope_upload.py`
- `app/api/routers/lessons/cloud_transcribe.py`
- `app/infra/translation_qwen_mt.py`
- `README.md`

当前可观察到的集成点：

- 上传/文件转写接口：`POST /api/transcribe/file`
- lesson 任务从保存好的 DashScope file ID 启动，见 `app/api/routers/lessons/router.py`
- 翻译请求通过 `app/infra/translation_qwen_mt.py` 使用 OpenAI SDK + `MT_BASE_URL` 调用兼容服务

### 数据库

应用通过 `app/db/session.py` 中的 SQLAlchemy session，以及 `migrations/` 下的 Alembic 迁移来管理数据层。

生产路径：

- `README.md`、`scripts/run_prod_migration.py`、`app/main.py` 中都明确预期生产使用 PostgreSQL
- SQLite 仍用于本地开发和测试，由 `resolve_database_url()` 与 `app/db/base.py` 中的 schema helper 支撑

### Zeabur

部署与服务假设定义在：

- `Dockerfile`
- `zeabur-template.yaml`
- `README.md`

当前假设：

- `web` 服务监听 `8080`
- 配套 `postgresql` 服务
- 持久卷挂载到 `/data`

## 本地系统工具

### ffmpeg / ffprobe

媒体抽取和运行时健康检查都依赖 ffmpeg 工具。

相关文件：

- `app/infra/media_ffmpeg.py`
- `app/services/media.py`
- `app/main.py`
- `tools/ffmpeg/bin/ffmpeg.exe`
- `tools/ffmpeg/bin/ffprobe.exe`

### yt-dlp

本地/公开媒体导入和桌面端打包中都包含 `yt-dlp`。

相关文件：

- `tools/yt-dlp/yt-dlp.exe`
- `desktop-client/package.json`
- `tests/unit/test_desktop_local_asr.py`

## 桌面运行时桥接

Electron 没有在 renderer 中重写业务 API，而是通过 bridge 接入云端与本地能力。

相关文件：

- `desktop-client/electron/main.mjs`
- `desktop-client/electron/preload.cjs`
- `frontend/src/shared/api/client.js`
- `frontend/src/hooks/useOfflineMode.js`

桥接职责：

- `window.desktopRuntime.requestCloudApi(...)` 负责把云端 API 请求转发到 Electron main process
- 桌面端 user data 中缓存和恢复认证会话
- 本地 helper 请求，用于离线/本地 ASR 任务
- 客户端和本地模型的更新检查

## 静态资源集成

- Web 构建产物通过根 `Dockerfile` 复制到 `app/static/`
- Admin web 有单独的静态构建产物 `frontend/dist-admin/` 和 `admin-web/` 下的 nginx 路径
- Desktop 构建通过复制 `frontend/dist/` 到 `desktop-client/.cache/frontend-dist/` 来复用主前端

## 认证 / 安全集成

- JWT 创建和验证位于 `app/security.py`
- 管理员 bootstrap 与管理员角色控制位于 `app/services/admin_bootstrap.py` 和相关 admin router
- `REDEEM_CODE_EXPORT_CONFIRM_TEXT` 对应的导出保护位于 `app/core/config.py` 和 `app/main.py` 的 readiness 检查中