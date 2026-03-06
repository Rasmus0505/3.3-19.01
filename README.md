# English Sentence Spelling Trainer (Zeabur MVP)

本项目是一个部署在 Zeabur 上的英语句级拼写练习 MVP：

1. 上传音视频素材
2. 调用 DashScope 做 ASR
3. 自动按句切分、翻译中文
4. 登录后同步学习进度与钱包余额
5. 提供管理员计费与兑换码后台

## 技术栈

- Backend：FastAPI + SQLAlchemy + Alembic
- Frontend：React + Tailwind
- Database：Postgres（业务表固定在 `app` schema）
- Runtime：Dockerfile + Zeabur GitHub 直构

## 核心接口

- 保持不变：
  - `POST /api/transcribe/file`
  - `GET /health`
- 新增就绪探针：
  - `GET /health/ready`

`/health` 只表示 Web 进程还活着。  
`/health/ready` 用来判断数据库与业务表是否就绪；数据库异常时会返回 `503`。

## 必要环境变量

- `DATABASE_URL`：Zeabur Postgres 连接串，不需要再手工拼 `search_path`
- `DASHSCOPE_API_KEY`：ASR/翻译使用
- `JWT_SECRET`：登录鉴权签名
- `ADMIN_EMAILS`：管理员邮箱白名单，多个用逗号分隔

## 常用可选环境变量

- `AUTO_MIGRATE_ON_START=true`
- `DB_INIT_MODE=auto`
- `ALEMBIC_CONFIG=alembic.ini`
- `TMP_WORK_DIR=/tmp/zeabur3.3`
- `MT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`
- `MT_MODEL=qwen-mt-plus`
- `APP_TIMEZONE=Asia/Shanghai`

## 数据库约定

- 生产环境只走 Alembic 迁移，不再依赖 `search_path`
- ORM 与迁移统一显式使用 `app` schema
- 默认计费费率通过迁移写入，不再依赖应用启动时 seed
- 本地 SQLite 仍可用 `DB_INIT_MODE=auto` 走 `create_all`

## 本地开发

```powershell
cd D:\GITHUB\英语产品\3.3-19.01
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

本地 SQLite 快速运行：

```powershell
$env:DATABASE_URL="sqlite:///./app.db"
$env:DB_INIT_MODE="auto"
$env:JWT_SECRET="change-me"
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

本地 Postgres 迁移运行：

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/app_test"
$env:JWT_SECRET="change-me"
python -m alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Zeabur 部署（推荐）

首轮恢复只部署两个服务：

1. `web`
2. `postgresql`

不要把 `metabase` 放进第一次恢复上线。

### 1）在 Zeabur 连接 GitHub 仓库

- 选择当前仓库
- 构建方式使用仓库根目录 `Dockerfile`
- 启动命令使用镜像内默认入口 `scripts/start.sh`
- 仓库内保留的 GHCR workflow 现在仅作手动回退，不再是默认发布链路

### 2）在 Zeabur 新建 Postgres 服务

- 使用 Zeabur 的 Postgres 模板
- 新库保持为空库即可
- 把连接串填到 `web` 服务的 `DATABASE_URL`

### 3）给 `web` 服务填写环境变量

至少填写：

- `DATABASE_URL`
- `DASHSCOPE_API_KEY`
- `JWT_SECRET`
- `ADMIN_EMAILS`

建议同时保留：

- `AUTO_MIGRATE_ON_START=true`
- `TMP_WORK_DIR=/tmp/zeabur3.3`
- `MT_BASE_URL`
- `MT_MODEL`

### 4）部署后如何验证

先验证 liveness：

```bash
GET /health
```

预期：`200`，返回 `ok=true`

再验证 readiness：

```bash
GET /health/ready
```

预期：`200`，返回 `ok=true`

最后验证业务：

1. 注册/登录成功
2. `GET /api/wallet/me` 返回 `200`
3. `GET /api/admin/billing-rates` 返回 `200`
4. 上传文件调用 `POST /api/transcribe/file` 成功

## Zeabur AI 可直接使用的提示词

```text
请帮我在 Zeabur 上部署这个 GitHub 仓库，按仓库根目录 Dockerfile 构建。
本次先只部署两个服务：web 和 postgresql，不要先部署 Metabase。
请提醒我填写这 4 个环境变量：DATABASE_URL、DASHSCOPE_API_KEY、JWT_SECRET、ADMIN_EMAILS。
web 服务启动后，请依次验证：
1. GET /health 返回 200
2. GET /health/ready 返回 200
3. POST /api/transcribe/file 上传一个媒体文件能成功
如果 /health 正常但 /health/ready 不正常，请优先检查数据库连接和迁移日志。
```

## 可选第二阶段

当 `web + postgresql` 稳定后，再接回：

- `metabase`

接回后只同步 `app` schema，避免系统表和业务表混在一起。

## 回归验证

- SQLite 快速回归：`pytest -q`
- Postgres 启动冒烟：`pytest -q tests/test_start_script_smoke.py`

## 常见排查

- `/health` 正常但 `/health/ready` 返回 `503`
  - 先看 `DATABASE_URL`
  - 再看 Alembic 迁移日志
- `POST /api/transcribe/file` 失败
  - 先看 `DASHSCOPE_API_KEY`
  - 再看 ffmpeg/libopus 是否可用
- 首次部署后 502
  - 先确认 Zeabur 是否真的使用了仓库 `Dockerfile`
  - 再确认 `web` 与 `postgresql` 是否已经绑定在同一个项目内
