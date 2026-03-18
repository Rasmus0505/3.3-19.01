# English Sentence Spelling Trainer

这是一个部署在 Zeabur 上的英语句子练习 MVP。

你只需要做 3 件事：

1. 上传音频或视频
2. 等系统自动转写、翻译并生成课程
3. 登录后继续学习、同步进度和点数

## 先知道这几点

- 部署方式默认是：`GitHub` 仓库 → `Zeabur` 读取代码 → 按根目录 `Dockerfile` 构建
- 不需要自己处理 `Nginx`、`PM2` 或 Linux 运维
- 对外主端口按项目规则统一使用 `8080`
- 现有核心接口保持不变：
  - `POST /api/transcribe/file`
  - `GET /health`
  - `GET /health/ready`

`/health` 只说明服务进程还活着。  
`/health/ready` 用来判断数据库和业务表是否已经准备好。

## 在 Zeabur 上怎么部署

首轮只部署两个服务：

1. `web`
2. `postgresql`

先不要接 `metabase`。

### 第 1 步：连接 GitHub 仓库

- 在 Zeabur 新建服务
- 选择当前 GitHub 仓库
- 构建入口使用仓库根目录 `Dockerfile`
- 启动命令使用镜像内默认入口 `scripts/start.sh`

### 第 2 步：新建 Postgres

- 直接使用 Zeabur 的 Postgres 模板
- 用一个全新的空库
- 把连接串填到 `web` 服务的 `DATABASE_URL`

### 第 3 步：填写环境变量

至少填写这 4 个：

- `DATABASE_URL`
- `DASHSCOPE_API_KEY`
- `JWT_SECRET`
- `ADMIN_EMAILS`

建议同时保留：

- `PORT=8080`
- `TMP_WORK_DIR=/tmp/zeabur3.3`
- `PERSISTENT_DATA_DIR=/data`
- `MT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`
- `MT_MODEL=qwen-mt-flash`
- `ASR_SEGMENT_TARGET_SECONDS=300`
- `ASR_SEGMENT_SEARCH_WINDOW_SECONDS=45`
- `AUTO_MIGRATE_ON_START=1`
- `AUTO_MIGRATE_CONTINUE_ON_FAILURE=1`
- `AUTO_MIGRATE_LOCK_TIMEOUT_SECONDS=180`
- `web` 服务额外挂一个持久卷到 `/data`

分句和翻译批次默认值不建议靠环境变量维护。  
上线后请到后台的“字幕/分句设置”里调整。

### 第 4 步：先执行手动迁移

- 在 `web` 服务的终端里执行：

```text
python -m alembic -c alembic.ini upgrade head
```

- `scripts/start.sh` 默认会在启动前自动执行这条 Alembic 迁移命令
- PostgreSQL 默认会先拿 advisory lock，避免多实例重复跑迁移
- 自动迁移失败时会保留完整报错，应用仍会启动，但 `/health/ready` 会继续返回 `503`
- 如需临时改回手动迁移，建议设置 `AUTO_MIGRATE_ON_START=0`
- 启动链路同时兼容 `AUTO_MIGRATE_ON_START=false/no/off`，但在 Zeabur 里优先使用明确字符串 `0` / `1`

- 如果 Zeabur AI 可以代执行，直接让它在 `web` 服务里执行这条命令
- 迁移失败时保留完整报错，不要忽略
- 迁移成功后，对 `web` 点一次 `Redeploy` 或 `Restart`

## 部署后怎么验证

按这个顺序检查：

### 1）先看服务是否活着

```text
GET /health
```

预期：返回 `200`，且 `ok=true`

### 2）再看数据库是否就绪

```text
GET /health/ready
```

预期：返回 `200`，且 `ok=true`

### 3）最后验证核心业务

1. 注册或登录成功
2. `GET /api/wallet/me` 返回 `200`
3. `GET /api/admin/billing-rates` 返回 `200`
4. 上传媒体文件到 `POST /api/transcribe/file` 成功

## 出问题先看哪里

- `/health` 正常，但 `/health/ready` 返回 `503`
  - 先检查 `DATABASE_URL`
  - 再确认自动迁移日志是否报错；如果你关闭了自动迁移，再手动执行 `python -m alembic -c alembic.ini upgrade head`
- 管理后台接口返回 `500`
  - 先确认自动迁移或手动迁移是否真的执行成功
  - 再检查数据库连接和权限
- 上传转写失败
  - 先确认 `DASHSCOPE_API_KEY` 已填写
  - 再看服务日志里对应请求的错误信息

## 给 Zeabur AI 的提示词

```text
请帮我在 Zeabur 上部署这个 GitHub 仓库，按仓库根目录 Dockerfile 构建。
本次先只部署两个服务：web 和 postgresql，不要先部署 Metabase。
请提醒我填写这些环境变量：PORT=8080、DATABASE_URL、DASHSCOPE_API_KEY、JWT_SECRET、ADMIN_EMAILS、ASR_SEGMENT_TARGET_SECONDS、ASR_SEGMENT_SEARCH_WINDOW_SECONDS、AUTO_MIGRATE_ON_START=1、AUTO_MIGRATE_CONTINUE_ON_FAILURE=1、AUTO_MIGRATE_LOCK_TIMEOUT_SECONDS=180。
字幕和分句默认值请不要通过环境变量调整，部署完成后提醒我去后台“字幕/分句设置”里修改。
web 服务启动后，请先查看自动迁移日志是否成功；如果失败，请完整返回报错，不要省略。只有在我明确关闭 `AUTO_MIGRATE_ON_START` 时，才改为手动执行 `python -m alembic -c alembic.ini upgrade head`。如果要关闭自动迁移，请把 `AUTO_MIGRATE_ON_START` 明确填成字符串 `0`。
web 服务启动后，请按顺序帮我验证：
1. GET /health 返回 200
2. GET /health/ready 返回 200
3. POST /api/transcribe/file 上传一个媒体文件能成功
如果 /health 正常但 /health/ready 不正常，请优先检查数据库连接和手动迁移日志。
```

## 本地开发

```powershell
cd D:\GITHUB\英语产品\3.3-19.01
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

本地 SQLite 手动迁移运行：

```powershell
$env:PORT="8080"
$env:DATABASE_URL="sqlite:///./app.db"
$env:JWT_SECRET="change-me"
python -m alembic -c alembic.ini upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

本地 Postgres 手动迁移运行：

```powershell
$env:PORT="8080"
$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/app_test"
$env:JWT_SECRET="change-me"
python -m alembic -c alembic.ini upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

## 第二阶段再接什么

等 `web + postgresql` 稳定后，再接：

- `metabase`

接回后只同步业务 `app` schema，避免系统表和业务表混在一起。
