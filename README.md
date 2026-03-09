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
- `ASR_SEGMENT_TARGET_SECONDS=300`
- `ASR_SEGMENT_SEARCH_WINDOW_SECONDS=45`
- 字幕规则分句与语义分句默认值改为后台“字幕/分句设置”维护，不再新增环境变量

当前英文分句链路已改为：`静音优先切段 -> ASR 词级时间 -> VideoLingo 风格规则分句`。  
本轮不启用 Qwen 语义切句；若词级结果缺失，会降级为 ASR 原始句子。

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
- 当前仓库不再保留 GitHub Actions workflow，部署链路为 Zeabur 直接读取 GitHub 仓库并按 Dockerfile 构建

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
- `ASR_SEGMENT_TARGET_SECONDS=300`
- `ASR_SEGMENT_SEARCH_WINDOW_SECONDS=45`
- 上传页“开启语义分句”默认状态与分句阈值请到后台“字幕/分句设置”中调整

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
请提醒我填写这 6 个环境变量：DATABASE_URL、DASHSCOPE_API_KEY、JWT_SECRET、ADMIN_EMAILS、ASR_SEGMENT_TARGET_SECONDS、ASR_SEGMENT_SEARCH_WINDOW_SECONDS。字幕/分句默认值请到后台“字幕/分句设置”中调整。
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

## MT 计费迁移恢复

如果日志里出现以下任意一种情况，基本可以判断为“数据库迁移卡在半成功状态”：

- `[DEBUG] boot.migrate degraded_start=true`
- `missing business tables: translation_request_logs`
- `billing_rates.partial_schema missing=billing_unit,points_per_1k_tokens`

这时通常不是前端没显示，而是 PostgreSQL 里 `app.billing_model_rates` 还缺 MT 费率列，`app.translation_request_logs` 也还没建好。

### 先在 Zeabur PostgreSQL 控制台手动补库

```sql
CREATE SCHEMA IF NOT EXISTS app;

ALTER TABLE app.billing_model_rates
  ADD COLUMN IF NOT EXISTS parallel_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app.billing_model_rates
  ADD COLUMN IF NOT EXISTS parallel_threshold_seconds INTEGER NOT NULL DEFAULT 600;
ALTER TABLE app.billing_model_rates
  ADD COLUMN IF NOT EXISTS segment_seconds INTEGER NOT NULL DEFAULT 300;
ALTER TABLE app.billing_model_rates
  ADD COLUMN IF NOT EXISTS max_concurrency INTEGER NOT NULL DEFAULT 2;
ALTER TABLE app.billing_model_rates
  ADD COLUMN IF NOT EXISTS points_per_1k_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app.billing_model_rates
  ADD COLUMN IF NOT EXISTS billing_unit VARCHAR(32) NOT NULL DEFAULT 'minute';

ALTER TABLE app.billing_model_rates
  DROP CONSTRAINT IF EXISTS ck_billing_rate_positive;
ALTER TABLE app.billing_model_rates
  DROP CONSTRAINT IF EXISTS ck_billing_rate_token_non_negative;

ALTER TABLE app.billing_model_rates
  ADD CONSTRAINT ck_billing_rate_positive CHECK (points_per_minute >= 0);
ALTER TABLE app.billing_model_rates
  ADD CONSTRAINT ck_billing_rate_token_non_negative CHECK (points_per_1k_tokens >= 0);

ALTER TABLE app.wallet_ledger
  DROP CONSTRAINT IF EXISTS ck_wallet_ledger_event_type;
ALTER TABLE app.wallet_ledger
  ADD CONSTRAINT ck_wallet_ledger_event_type
  CHECK (event_type IN ('reserve','consume','refund','manual_adjust','redeem_code','consume_translate','refund_translate'));

CREATE TABLE IF NOT EXISTS app.translation_request_logs (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  trace_id VARCHAR(64) NOT NULL,
  task_id VARCHAR(128),
  lesson_id INTEGER,
  user_id INTEGER,
  sentence_idx INTEGER NOT NULL,
  attempt_no INTEGER NOT NULL DEFAULT 1,
  provider VARCHAR(64) NOT NULL DEFAULT 'dashscope_compatible',
  model_name VARCHAR(100) NOT NULL,
  base_url VARCHAR(255) NOT NULL,
  input_text_preview VARCHAR(300) NOT NULL DEFAULT '',
  provider_request_id VARCHAR(128),
  status_code INTEGER,
  finish_reason VARCHAR(64),
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  error_code VARCHAR(120),
  error_message TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL,
  CONSTRAINT ck_translation_request_attempt_positive CHECK (attempt_no > 0),
  CONSTRAINT fk_translation_request_logs_lesson
    FOREIGN KEY (lesson_id) REFERENCES app.lessons(id) ON DELETE SET NULL,
  CONSTRAINT fk_translation_request_logs_user
    FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_translation_request_logs_trace_id ON app.translation_request_logs(trace_id);
CREATE INDEX IF NOT EXISTS ix_translation_request_logs_task_id ON app.translation_request_logs(task_id);
CREATE INDEX IF NOT EXISTS ix_translation_request_logs_lesson_id ON app.translation_request_logs(lesson_id);
CREATE INDEX IF NOT EXISTS ix_translation_request_logs_user_id ON app.translation_request_logs(user_id);
CREATE INDEX IF NOT EXISTS ix_translation_request_logs_sentence_idx ON app.translation_request_logs(sentence_idx);
CREATE INDEX IF NOT EXISTS ix_translation_request_logs_provider_request_id ON app.translation_request_logs(provider_request_id);
CREATE INDEX IF NOT EXISTS ix_translation_request_logs_success ON app.translation_request_logs(success);
CREATE INDEX IF NOT EXISTS ix_translation_request_logs_created_at ON app.translation_request_logs(created_at);

UPDATE app.billing_model_rates
SET
  points_per_1k_tokens = COALESCE(points_per_1k_tokens, 0),
  billing_unit = CASE
    WHEN model_name LIKE 'qwen-mt-%' THEN '1k_tokens'
    ELSE 'minute'
  END;

INSERT INTO app.billing_model_rates
  (model_name, points_per_minute, points_per_1k_tokens, billing_unit, is_active,
   parallel_enabled, parallel_threshold_seconds, segment_seconds, max_concurrency, updated_at, updated_by_user_id)
VALUES
  ('qwen-mt-plus', 0, 15, '1k_tokens', TRUE, FALSE, 600, 300, 1, NOW(), NULL),
  ('qwen-mt-flash', 0, 15, '1k_tokens', TRUE, FALSE, 600, 300, 1, NOW(), NULL),
  ('qwen-mt-lite', 0, 15, '1k_tokens', TRUE, FALSE, 600, 300, 1, NOW(), NULL),
  ('qwen-mt-turbo', 0, 15, '1k_tokens', TRUE, FALSE, 600, 300, 1, NOW(), NULL)
ON CONFLICT (model_name) DO NOTHING;
```

### 补库后怎么验证

1. 在 Zeabur 对主应用服务执行一次 `Redeploy`
2. 启动日志里确认出现：
   - `[boot] running alembic upgrade head`
   - `[DEBUG] boot.migrate success`
3. 再看：
   - `GET /health/ready` 返回 `200`
   - 后台登录后，浏览器开发者工具 `Network` 里的 `GET /api/admin/billing-rates` 响应包含：
     - `qwen-mt-plus`
     - `qwen-mt-flash`
     - `qwen-mt-lite`
     - `qwen-mt-turbo`
     - `billing_unit="1k_tokens"`
     - `points_per_1k_tokens=15`

