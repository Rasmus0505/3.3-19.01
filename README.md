# English Sentence Spelling Trainer (Zeabur MVP)

本项目是 Zeabur 托管部署的英语句级拼写练习 MVP：

1. 上传音视频素材  
2. 自动 ASR（带时间戳）+ 逐句翻译中文  
3. 句级播放 + 逐词拼写检查（严格+轻微容错）  
4. 登录后同步学习进度（Postgres）

## 技术栈

- Backend: FastAPI + SQLAlchemy
- Frontend: React + Tailwind + shadcn-style components
- ASR: DashScope (`paraformer-v2` / `qwen3-asr-flash-filetrans`)
- MT: Qwen-MT (`qwen-mt-plus`, OpenAI-compatible)
- Storage: Postgres + 本地文件（课程音频片段）

## 主要接口

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
$env:JWT_SECRET="change-me"
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

前端：

```powershell
cd frontend
npm ci
npm run dev
```

## Zeabur 部署

1. 连接 GitHub 仓库，使用 Docker 部署（已配置多阶段构建）
2. 新增 Postgres 服务，并把连接串写入 `DATABASE_URL`
3. 配置 `DASHSCOPE_API_KEY` 与 `JWT_SECRET`
4. 健康检查路径使用 `/health`

## Postgres schema 收敛（Metabase 只显示网站表）

目标：把业务表从 `public` 迁到 `app`，并让 Metabase 只同步 `app` schema。

1. 维护窗口内暂停主应用写入（2-5 分钟）
2. 先做数据库备份
3. 在 Adminer 执行迁移 SQL：`ops/sql/public_to_app_schema.sql`
4. 新增钱包与计费表：`ops/sql/add_wallet_billing_tables.sql`
5. 如需回滚，执行：`ops/sql/app_to_public_schema_rollback.sql`
6. 迁移前后计数核对：
   - 迁移前：`ops/sql/verify_business_tables.sql`
   - 迁移后：`ops/sql/verify_business_tables_app.sql`
7. 更新 Zeabur 的 `DATABASE_URL`，追加 `search_path=app,public`

`DATABASE_URL` 示例（无其他参数）：

```text
postgresql://root:password@postgres-host:5432/zeabur?options=-csearch_path%3Dapp%2Cpublic
```

若原 URL 已有参数，使用 `&options=` 追加：

```text
postgresql://root:password@postgres-host:5432/zeabur?sslmode=require&options=-csearch_path%3Dapp%2Cpublic
```

Metabase 设置：

1. 进入数据库连接 `PG`
2. schema 同步范围仅保留 `app`（移除 `public`）
3. 执行一次“同步数据库结构 + 重扫字段值”

## 说明

- 切句逻辑直接使用 ASR 返回 `sentences`，避免时间戳错位。
- 翻译失败不阻断课程生成；失败句翻译为空字符串。
- 请求结束后会清理临时目录。
- `/admin` 为后台入口，非管理员会被后端权限拦截。
