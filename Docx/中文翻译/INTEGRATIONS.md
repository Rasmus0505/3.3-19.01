# 集成

## 外部服务

### DashScope

用于云端 ASR 与兼容翻译调用。

相关文件：

- `app/services/asr_dashscope.py`
- `app/infra/asr/dashscope.py`
- `app/api/routers/dashscope_upload.py`
- `app/api/routers/lessons/cloud_transcribe.py`
- `app/infra/translation_qwen_mt.py`
- `README.md`

观察到的集成点：

- 上传/文件转写端点：`POST /api/transcribe/file`
- 在 `app/api/routers/lessons/router.py` 中，基于已保存的 DashScope 文件 ID 的课程生成流程
- 在 `app/infra/translation_qwen_mt.py` 中，通过配置 `MT_BASE_URL` 的 OpenAI SDK 发起翻译请求

### 数据库

应用使用 `app/db/session.py` 中的 SQLAlchemy session，并通过 `migrations/` 进行 Alembic 迁移。

生产路径：

- `README.md`、`scripts/run_prod_migration.py` 与 `app/main.py` 的就绪检查都预期使用 PostgreSQL
- SQLite 仍通过 `resolve_database_url()` 与 `app/db/base.py` 中的 schema 转换助手支持本地/开发/测试场景

### Zeabur

部署与服务假设定义在：

- `Dockerfile`
- `zeabur-template.yaml`
- `README.md`

集成假设：

- `web` 服务端口为 `8080`
- 配套 `postgresql` 服务
- 在 `/data` 挂载持久卷

## 本地系统工具

### ffmpeg / ffprobe

媒体提取与就绪检查依赖 ffmpeg 二进制。

相关文件：

- `app/infra/media_ffmpeg.py`
- `app/services/media.py`
- `app/main.py`
- `tools/ffmpeg/bin/ffmpeg.exe`
- `tools/ffmpeg/bin/ffprobe.exe`

### yt-dlp

本地/公开媒体导入与桌面端打包包含 `yt-dlp`。

相关文件：

- `tools/yt-dlp/yt-dlp.exe`
- `desktop-client/package.json`
- `tests/unit/test_desktop_local_asr.py`

## 桌面运行时桥接

Electron 增加了云端/本地桥接层，而不是在 renderer 里重写业务 API。

相关文件：

- `desktop-client/electron/main.mjs`
- `desktop-client/electron/preload.cjs`
- `frontend/src/shared/api/client.js`
- `frontend/src/hooks/useOfflineMode.js`

桥接职责：

- `window.desktopRuntime.requestCloudApi(...)` 通过 Electron main 进程代理云端 API 请求
- 在桌面用户数据中缓存/恢复认证会话
- 为离线/本地 ASR 任务提供本地 helper 请求
- 检查客户端与本地模型更新

## 静态资源集成

- 根目录 `Dockerfile` 会把 web 构建输出复制到 `app/static/`。
- Admin web 有独立静态构建 `frontend/dist-admin/` 与 `admin-web/` 下 nginx 镜像路径。
- 桌面构建通过复制 `frontend/dist/` 到 `desktop-client/.cache/frontend-dist/` 来复用主前端产物。

## 认证 / 安全集成

- `app/security.py` 中的 JWT 令牌创建与校验
- `app/services/admin_bootstrap.py` 及 admin 路由中的管理员初始化与权限约束
- 基于 `REDEEM_CODE_EXPORT_CONFIRM_TEXT` 的导出保护（`app/core/config.py`）及 `app/main.py` 中的就绪检查
