# AGENTS.md — 给自动化助手 / 协作者的仓库说明

本文档描述本仓库的运行上下文与数据库事实。**请勿在仓库中提交数据库密码、SecretKey 等密钥**；使用 Zeabur / 部署平台的环境变量或本地 `.env`（且 `.env` 应被忽略）。

---

## 数据库（生产 / 预览环境 — Zeabur PostgreSQL）

### 连接方式说明

| 场景 | 主机 | 端口 | 说明 |
|------|------|------|------|
| **应用容器内**（推荐） | Zeabur 提供的 `${CONTAINER_HOSTNAME}` 或服务名 | `5432` | 与 `DATABASE_URL` 一致，集群内直连 |
| **本机 / 外网运维**（NodePort） | `47.108.142.28`（示例，以控制台为准） | `30835`（示例） | 映射到容器内 `TCP 5432`；IP 与 NodePort 可能随集群调整而变化，以 Zeabur「网络 / 域名」面板为准 |

- **数据库名**：`zeabur`
- **业务 Schema**：`app`（SQLAlchemy `APP_SCHEMA`）
- **管理用户**（示例）：`root`（具体以控制台为准）

### 已核实状态（通过 `connect_postgresql.py` + 公网 NodePort 探测）

以下信息在某次连接中读取，**部署变更后可能不同**，以实际查询为准：

- **PostgreSQL 版本**：18.x（Debian 镜像）
- **Schema**：`app`、`public` 等
- **`app` 下业务表数量**：24（含 `users`、`lessons`、`lesson_sentences`、`soe_results` 等）
- **`app.soe_results`**：存在；列含 `id`、`user_id`、`lesson_id`、`sentence_id`、`ref_text`、`user_text`、各评分字段、`voice_id`、`raw_response_json`、`created_at`；外键指向 `users` / `lessons` / `lesson_sentences`；当前数据行数探测时为 **0**
- **`app.alembic_version`**：探测时版本号为 **`20260404_0035`**

### 口语评测（SOE）相关

- 后端路由：`POST /api/soe/assess` 等（见 `app/api/routers/soe.py`）。
- 持久化表：`app.soe_results`（模型 `app/models/soe_result.py`）。
- 若接口 500 且与 DB 相关：先确认**当前环境**的 `DATABASE_URL` 指向的数据库中是否已有该表，以及迁移是否已执行到与代码一致的头版本。

### 本地诊断脚本

- 路径：`connect_postgresql.py`
- **必须**通过环境变量提供密码（或完整 `DATABASE_URL`），例如 PowerShell：

```powershell
$env:POSTGRES_HOST = "47.108.142.28"   # 外网时用 NodePort 对应 IP；容器内用服务名
$env:POSTGRES_PORT = "30835"           # 外网 NodePort；直连 PG 时一般为 5432
$env:POSTGRES_USER = "root"
$env:POSTGRES_DB = "zeabur"
$env:POSTGRES_PASSWORD = "<从 Zeabur 控制台复制，勿写入仓库>"
python connect_postgresql.py
```

或使用：

```powershell
$env:DATABASE_URL = "postgresql://user:pass@host:port/zeabur"
python connect_postgresql.py
```

---

## 安全提示

- 曾在聊天中粘贴过的数据库密码、云 API 密钥：**建议在控制台轮换**，并只保存在平台密钥管理中。
- 本文件**不包含**任何明文密码或 SecretKey。

---

## 相关文件

- Alembic：`migrations/versions/`（含 `soe_results` 等迁移）
- 可选手工 SQL 参考：`migrations/versions/20260404_0034_add_soe_results_postgresql.sql`（执行前请确认环境与 schema 一致）
