# English Sentence Spelling Trainer (Zeabur MVP)

本项目是 Zeabur 托管部署的英语句级拼写练习 MVP：

1. 上传音视频素材
2. 自动 ASR（带时间戳）+ 逐句翻译中文
3. 句级播放 + 逐词拼写检查（严格+轻微容错）
4. 登录后同步学习进度（Postgres）
5. 钱包余额与按模型分钟计费

## 技术栈

- Backend: FastAPI + SQLAlchemy + Alembic
- Frontend: React + Tailwind + shadcn-style components
- ASR: DashScope (`paraformer-v2` / `qwen3-asr-flash-filetrans`)
- MT: Qwen-MT (`qwen-mt-plus`, OpenAI-compatible)
- Storage: Postgres + 本地文件（课程音频片段）

## 目录结构（可持续分层）

```text
app/
  main.py                  # app 装配、生命周期、路由注册
  api/                     # 路由层
  core/                    # 配置、错误映射、日志
  db/                      # 会话、元数据、初始化策略
  domain/                  # 业务规则（纯逻辑）
  infra/                   # 外部系统适配（ASR/MT/ffmpeg）
  models/                  # ORM 模型（按域拆分）
  repositories/            # 数据访问
  schemas/                 # API DTO（按域拆分）
  services/                # 用例编排
frontend/src/
  app/                     # 壳层与入口分发
  pages/                   # 页面入口
  features/                # 业务功能模块
  shared/                  # 公共 API/UI/hook
```

## 主要接口（保持原契约）

- 认证
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`
- 课程
  - `POST /api/lessons` (form-data: `video_file`, `asr_model`)
  - `GET /api/lessons`
  - `GET /api/lessons/{lesson_id}`
- 练习
  - `POST /api/lessons/{lesson_id}/check`
  - `POST /api/lessons/{lesson_id}/progress`
  - `GET /api/lessons/{lesson_id}/progress`
  - `GET /api/lessons/{lesson_id}/sentences/{idx}/audio`
  - `GET /api/lessons/{lesson_id}/media`
- 钱包与计费
  - `GET /api/wallet/me`
  - `GET /api/billing/rates`
- 管理后台（管理员）
  - `GET /api/admin/users`
  - `POST /api/admin/users/{user_id}/wallet-adjust`
  - `GET /api/admin/wallet-logs`
  - `GET /api/admin/billing-rates`
  - `PUT /api/admin/billing-rates/{model_name}`
- 保留原能力
  - `POST /api/transcribe/file`
  - `GET /health`

## 必要环境变量

- `DASHSCOPE_API_KEY` (必填)
- `DATABASE_URL` (建议 Zeabur Postgres 连接串，推荐包含 `search_path=app,public`)
- `DB_INIT_MODE` (`auto`/`create_all`/`skip`，默认 `auto`)
- `JWT_SECRET` (必填，生产必须替换)
- `ADMIN_EMAILS` (可选，管理员邮箱白名单，逗号分隔)
- `TMP_WORK_DIR` (可选，默认 `/tmp/zeabur3.3`)
- `MT_BASE_URL` (可选，默认北京: `https://dashscope.aliyuncs.com/compatible-mode/v1`)
- `MT_MODEL` (可选，默认 `qwen-mt-plus`)

## 本地开发

```powershell
cd D:\GITHUB\英语产品\3.3-19.01
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

后端：

```powershell
$env:DASHSCOPE_API_KEY="sk-xxx"
$env:DATABASE_URL="sqlite:///./app.db"
$env:DB_INIT_MODE="auto"
$env:JWT_SECRET="change-me"
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

前端：

```powershell
cd frontend
npm ci
npm run dev
```

## 数据库迁移（Alembic）

初始化（新环境）：

```bash
alembic upgrade head
```

新增迁移：

```bash
alembic revision -m "add_xxx"
```

回滚一步：

```bash
alembic downgrade -1
```

说明：
- 非 sqlite 环境建议固定使用 Alembic，不依赖 `create_all`。
- sqlite 本地开发默认可通过 `DB_INIT_MODE=auto` 自动建表。

## Zeabur 部署

1. 连接 GitHub 仓库，使用 Docker 部署（单服务）
2. 新增 Postgres 服务并写入 `DATABASE_URL`
3. 配置 `DASHSCOPE_API_KEY`、`JWT_SECRET`、`ADMIN_EMAILS`
4. 发布前在构建命令或启动脚本中执行 `alembic upgrade head`
5. 健康检查路径使用 `/health`

## Metabase schema 约束

目标：Metabase 只同步 `app` schema，避免系统表与业务表混杂。

1. 进入数据库连接 `PG`
2. schema 同步范围仅保留 `app`
3. 执行一次“同步数据库结构 + 重扫字段值”

## 说明

- 切句逻辑直接使用 ASR 返回 `sentences`，避免时间戳错位。
- 翻译失败不阻断课程生成；失败句翻译为空字符串。
- 请求结束后会清理临时目录。
- `/admin` 为后台入口，非管理员会被后端权限拦截。
