# English Sentence Spelling Trainer

这是一个部署在 Zeabur 上的英语句子练习应用，当前阶段以“先跑通、再稳定、最后再扩展”为原则。

## 部署原则

- 默认部署路径：`GitHub 仓库 -> Zeabur -> 按仓库根目录 Dockerfile 构建`
- 对外服务端口统一使用 `8080`
- 首轮只部署两个服务：`web` 和 `postgresql`
- 不要求你自己维护 `Nginx`、`PM2` 或 Linux 运维脚本
- 生产环境不要使用 SQLite

核心接口保持不变：

- `POST /api/transcribe/file`
- `GET /health`
- `GET /health/ready`

`/health` 只表示进程活着。  
`/health/ready` 表示数据库、关键表结构和启动安全策略都已经就绪。

## Zeabur 生产部署

### 1. 创建服务

在 Zeabur 中连接这个 GitHub 仓库，按仓库根目录的 `Dockerfile` 构建。

首轮只需要：

- `web`
- `postgresql`

暂时不要先接 `metabase`。

### 2. 挂载持久卷

给 `web` 服务挂载持久卷到 `/data`。

如果你要使用固定本地 ASR 模型，还需要把模型目录上传到：

- `/data/asr-models/SenseVoiceSmall`
- `/data/asr-models/faster-distil-small.en`

### 3. 必填环境变量

生产环境至少要填写这些变量：

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
- `SENSEVOICE_MODEL_DIR=/data/asr-models/SenseVoiceSmall`
- `FASTER_WHISPER_MODELSCOPE_MODEL_ID=Systran/faster-distil-whisper-small.en`
- `FASTER_WHISPER_MODEL_DIR=/data/asr-models/faster-distil-small.en`
- `FASTER_WHISPER_PREFETCH_ON_START=0`
- `FASTER_WHISPER_COMPUTE_TYPE=int8`
- `FASTER_WHISPER_CPU_THREADS=4`
- `MT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`
- `MT_MODEL=qwen-mt-flash`
- `ASR_SEGMENT_TARGET_SECONDS=300`
- `ASR_SEGMENT_SEARCH_WINDOW_SECONDS=45`

## 这次安全加固后的管理员模型

- 运行时管理员权限现在依赖数据库里的 `users.is_admin`
- `ADMIN_EMAILS` 只用于首次引导或补齐管理员，不再作为运行时鉴权依据
- 如果配置了 `ADMIN_EMAILS`，首次部署还必须同时配置强 `ADMIN_BOOTSTRAP_PASSWORD`
- 新用户注册默认不是管理员
- 生产环境下，如果 `REDEEM_CODE_EXPORT_CONFIRM_TEXT` 太弱，应用会拒绝启动危险导出能力

## 生产迁移

生产环境默认建议：

- `AUTO_MIGRATE_ON_START=0`
- 在本地或受控机器手动执行迁移
- 迁移完成后再回到 Zeabur 重启 `web`

固定使用：

```bash
python scripts/run_prod_migration.py
```

如果只想检查是否已经到最新 revision：

```bash
python scripts/run_prod_migration.py --check-only
```

脚本优先读取 `PROD_DATABASE_URL`，没有时才回退到 `DATABASE_URL`。

如果 `users.is_admin` 这类新列还没有迁移到位，`/health/ready` 会返回失败。

更多说明见 [migrations/README.md](./migrations/README.md)。

## 部署后怎么验收

按这个顺序检查：

### 1. 进程存活

```text
GET /health
```

预期：

- HTTP 200
- `ok=true`

### 2. 数据库与关键表结构就绪

```text
GET /health/ready
```

预期：

- HTTP 200
- `ok=true`

### 3. 核心业务链路

至少验证：

1. 注册或登录成功
2. `GET /api/wallet/me` 返回 `200`
3. `GET /api/admin/security/status` 返回 `200`
4. 上传一个媒体文件到 `POST /api/transcribe/file` 成功

## 常见排查

### `/health` 正常，但 `/health/ready` 返回 `503`

优先检查：

- `APP_ENV` 是否真的是 `production`
- `DATABASE_URL` 是否指向 PostgreSQL / MySQL，而不是 SQLite
- 是否已经执行了 Alembic 迁移
- `REDEEM_CODE_EXPORT_CONFIRM_TEXT` 是否仍然是弱默认值

### 没有管理员能进后台

优先检查：

- `ADMIN_EMAILS` 是否配置正确
- `ADMIN_BOOTSTRAP_PASSWORD` 是否存在且足够强
- 数据库是否已迁移到包含 `users.is_admin`

### 上传转写失败

优先检查：

- `DASHSCOPE_API_KEY` 是否正确
- `/data/asr-models/...` 模型目录是否完整
- 服务日志里的具体错误信息

## 本地开发

```powershell
cd D:\3.3-19.01
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

本地 SQLite：

```powershell
$env:APP_ENV="development"
$env:PORT="8080"
$env:DATABASE_URL="sqlite:///./app.db"
$env:JWT_SECRET="change-me"
python -m alembic -c alembic.ini upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

本地 PostgreSQL：

```powershell
$env:APP_ENV="development"
$env:PORT="8080"
$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/app_test"
$env:JWT_SECRET="change-me"
python -m alembic -c alembic.ini upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8080
```
