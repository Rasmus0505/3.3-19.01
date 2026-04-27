# English Sentence Spelling Trainer

英语句子练习应用，支持两种运行路径：

- 本地一键站点：在本机用 SQLite 和浏览器运行，不依赖线上网站部署。
- Zeabur 生产部署：线上环境继续使用 `web + postgresql`，按根目录 `Dockerfile` 构建。

核心接口：

- `POST /api/transcribe/file`
- `GET /health`
- `GET /health/ready`

当前上传转写线路：

- `Bottle 1.0`：服务端本地 `faster-whisper` 模型包。
- `Bottle 2.0`：DashScope 云端 `qwen3-asr-flash-filetrans`。

`/health` 只表示进程存活；`/health/ready` 表示数据库、关键表结构和启动安全策略就绪。

## 本地一键运行

本地模式会启动一套完整站点：

- 访问地址：`http://127.0.0.1:18080`
- 数据库：`app.local.db`
- 本地数据目录：`.local-data/`
- 前端：构建后同步到 `.local-data/static`，由 FastAPI 同源承载
- AI：不依赖线上网站；如配置 `DASHSCOPE_API_KEY`，仍可调用 DashScope 云端模型

首次准备：

```powershell
cd D:\3.3-19.01
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
npm --prefix frontend install
```

日常启动：

```powershell
.\start-local.bat
```

脚本会自动：

1. 设置本地开发环境变量。
2. 构建前端并同步到 `.local-data/static`。
3. 对 `app.local.db` 执行 Alembic 迁移。
4. 启动 `uvicorn app.main:app --host 127.0.0.1 --port 18080`。
5. 打开浏览器访问本地站点。

如果需要云端 AI 能力，可以在当前 shell 设置：

```powershell
$env:DASHSCOPE_API_KEY="你的 DashScope Key"
.\start-local.bat
```

也可以把本地可用配置写入 `.env.local`。推荐只保留：

```env
DASHSCOPE_API_KEY=你的本地 DashScope Key
MT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
MT_MODEL=qwen-mt-flash
```

如果本地要测试腾讯口语评测，再追加：

```env
APP_TENCENT_SOE_APP_ID=你的腾讯 AppId
APP_TENCENT_SECRET_ID=你的腾讯 SecretId
APP_TENCENT_SECRET_KEY=你的腾讯 SecretKey
```

不要把线上 `DATABASE_URL`、Zeabur 内网 `POSTGRESQL_HOST`、线上 `JWT_SECRET`、`/data` 路径或 `PORT=8080` 放进本地 `.env.local`。本地脚本会强制使用 `app.local.db`、`.local-data/` 和端口 `18080`。

常见问题：

- `frontend\node_modules was not found`：先运行 `npm --prefix frontend install`。
- `Python was not found on PATH`：确认已安装 Python，并激活 `.venv` 后再运行脚本。
- AI 上传、翻译或视觉能力不可用：确认 `DASHSCOPE_API_KEY` 已设置；未设置时本地站点仍可启动，但相关云端能力会受限。

## 本地开发调试

普通本地使用优先运行：

```powershell
.\start-local.bat
```

如果需要 Vite 热更新调试，可以运行：

```powershell
.\preview-local-dev.bat
```

该脚本会：

- 后端：`http://127.0.0.1:18080`
- 前端 dev server：`http://127.0.0.1:5173`
- 数据库：同样使用本地 `app.local.db`

`frontend/vite.config.js` 已将 `/api`、`/health`、`/data` 代理到 `http://127.0.0.1:18080`。

## Zeabur 生产部署

生产部署保持现有路径不变：

- GitHub 仓库连接 Zeabur。
- Zeabur 按仓库根目录 `Dockerfile` 构建。
- 只需要维护 `web` 和 `postgresql` 两个服务。
- 生产环境不要使用 SQLite。

给 `web` 服务挂载持久卷到 `/data`。

如果启用服务端 `Bottle 1.0`，模型目录放到：

```text
/data/asr-models/faster-distil-small.en
```

`Bottle 2.0` 走 DashScope 云端接口，不需要本地模型目录。

生产环境至少配置：

- `APP_ENV=production`
- `PORT=8080`
- `DATABASE_URL=postgresql://...`
- `DASHSCOPE_API_KEY=...`
- `JWT_SECRET=...`
- `ADMIN_EMAILS=admin1@example.com,admin2@example.com`
- `ADMIN_BOOTSTRAP_PASSWORD=一段长度足够、不可猜测的随机短语`
- `REDEEM_CODE_EXPORT_CONFIRM_TEXT=一段长度足够、不可猜测的随机短语`

建议同时保留：

- `AUTO_MIGRATE_ON_START=0`
- `AUTO_MIGRATE_CONTINUE_ON_FAILURE=1`
- `AUTO_MIGRATE_LOCK_TIMEOUT_SECONDS=180`
- `TMP_WORK_DIR=/tmp/zeabur3.3`
- `PERSISTENT_DATA_DIR=/data`
- `ASR_BUNDLE_ROOT_DIR=/data/asr-models`
- `FASTER_WHISPER_MODELSCOPE_MODEL_ID=Systran/faster-distil-whisper-small.en`
- `FASTER_WHISPER_MODEL_DIR=/data/asr-models/faster-distil-small.en`
- `FASTER_WHISPER_PREFETCH_ON_START=0`
- `FASTER_WHISPER_COMPUTE_TYPE=int8`
- `FASTER_WHISPER_CPU_THREADS=4`
- `MT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`
- `MT_MODEL=qwen-mt-flash`
- `QWEN_VISION_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`
- `QWEN_VISION_MODEL=qwen3-vl-flash`
- `ASR_SEGMENT_TARGET_SECONDS=300`
- `ASR_SEGMENT_SEARCH_WINDOW_SECONDS=45`

## 生产迁移

生产环境建议关闭启动时自动迁移：

- `AUTO_MIGRATE_ON_START=0`
- 在本地或受控机器手动执行迁移
- 迁移完成后再重启 Zeabur `web`

执行迁移：

```bash
python scripts/run_prod_migration.py
```

只检查 revision：

```bash
python scripts/run_prod_migration.py --check-only
```

脚本优先读取 `PROD_DATABASE_URL`，没有时回退到 `DATABASE_URL`。

## 管理员和安全模型

- 运行时管理员权限依赖数据库里的 `users.is_admin`。
- `ADMIN_EMAILS` 只用于首次引导或补齐管理员，不再作为运行时鉴权依据。
- 如果配置了 `ADMIN_EMAILS`，首次部署还必须同时配置强 `ADMIN_BOOTSTRAP_PASSWORD`。
- 新用户注册默认不是管理员。
- 生产环境下，如果 `REDEEM_CODE_EXPORT_CONFIRM_TEXT` 太弱，应用会拒绝启动危险导出能力。

## 验收

按顺序检查：

1. `GET /health`
   - 预期：HTTP 200，`ok=true`
2. `GET /health/ready`
   - 预期：HTTP 200，`ok=true`
3. 核心业务链路
   - 注册或登录成功
   - `GET /api/wallet/me` 返回 `200`
   - `GET /api/admin/security/status` 返回 `200`
   - 上传媒体文件到 `POST /api/transcribe/file` 成功

## 常见排查

`/health` 正常，但 `/health/ready` 返回 `503`：

- 检查 `APP_ENV`。
- 生产环境确认 `DATABASE_URL` 指向 PostgreSQL/MySQL，而不是 SQLite。
- 确认 Alembic 迁移已执行。
- 确认 `REDEEM_CODE_EXPORT_CONFIRM_TEXT` 不是弱默认值。

没有管理员能进后台：

- 检查 `ADMIN_EMAILS` 是否配置正确。
- 检查 `ADMIN_BOOTSTRAP_PASSWORD` 是否存在且足够强。
- 检查数据库是否已迁移到包含 `users.is_admin`。

上传转写失败：

- 检查 `DASHSCOPE_API_KEY`。
- 如果启用 `Bottle 1.0`，检查模型目录是否完整。
- 查看服务日志里的具体错误信息。

## Qwen3-VL Flash 基础接入

仓库提供通用图像理解基础能力，默认模型为 `qwen3-vl-flash`。

默认配置：

- `QWEN_VISION_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`
- `QWEN_VISION_MODEL=qwen3-vl-flash`
- `QWEN_VISION_TIMEOUT_SECONDS=45`

本地联通验证：

```powershell
$env:DASHSCOPE_API_KEY="你的 DashScope Key"
python scripts/smoke_test_qwen3_vl_flash.py
```
