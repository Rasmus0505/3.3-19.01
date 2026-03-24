# 部署检查清单

本文档用于 Zeabur 或自托管部署前的核对，确保服务可正常启动与运行。

---

## 部署前检查

- [ ] **数据库迁移已运行**：首次部署或 schema 变更后需执行 `alembic upgrade head`；或设置 `AUTO_MIGRATE_ON_START=1` 由启动脚本自动执行
- [ ] **环境变量已配置**：至少配置 `DATABASE_URL`、`JWT_SECRET`（生产）、`DASHSCOPE_API_KEY`（使用 ASR/MT 时），参见 [environment-vars.md](./environment-vars.md)
- [ ] **静态资源已构建**：Dockerfile 多阶段构建会执行 `npm run build`，无需手动构建
- [ ] **依赖已安装**：Dockerfile 会执行 `pip install -r requirements.txt` 和 `npm ci`，Zeabur 拉取代码后自动构建

---

## 数据库迁移

### 自动迁移（推荐）

设置环境变量 `AUTO_MIGRATE_ON_START=1`（默认值），应用启动时会自动执行：

```bash
python -m app.db.migration_bootstrap
```

内部会调用 `alembic upgrade head`。

### 手动迁移

若关闭自动迁移（`AUTO_MIGRATE_ON_START=0`），需在部署前手动执行：

```bash
# 确保 DATABASE_URL 已配置
export DATABASE_URL=postgresql://user:password@host:5432/dbname
alembic -c alembic.ini upgrade head
```

### 验证迁移结果

- 访问 `GET /health/ready`，返回 200 表示服务就绪
- 查看 `scripts/start.sh` 日志，确认无 `alembic upgrade head failed` 报错

---

## 环境变量要点

| 变量 | 生产必需 | 说明 |
|------|----------|------|
| DATABASE_URL | 是 | 必须指向 PostgreSQL，不能使用 SQLite |
| JWT_SECRET | 是 | 必须改为强随机密钥 |
| DASHSCOPE_API_KEY | 使用 ASR/MT 时 | DashScope API 密钥 |
| APP_ENV | 建议 | 设为 `prod` 或 `production` |

详见 [environment-vars.md](./environment-vars.md)。

---

## 常见错误排查

### 1. `DATABASE_URL is required in production`

- **原因**：生产环境未配置 `DATABASE_URL` 或使用了 SQLite。
- **处理**：在 Zeabur 中为 web 服务配置 `DATABASE_URL`，指向已创建的 PostgreSQL 实例（如 `@database.DATABASE_URL`）。

### 2. `alembic upgrade head failed`

- **原因**：迁移脚本执行失败，可能是数据库连接失败、权限不足或迁移文件冲突。
- **处理**：检查 `DATABASE_URL` 是否正确，数据库用户是否有建表/改表权限；查看 Alembic 输出的具体错误信息。

### 3. `/health/ready` 返回 503 或非 200

- **原因**：迁移未完成、数据库连接失败或依赖服务不可用。
- **处理**：确认数据库迁移已成功执行，`DATABASE_URL` 可连通；若使用 DashScope，确认 `DASHSCOPE_API_KEY` 有效。

### 4. JWT 相关 401 / 403

- **原因**：`JWT_SECRET` 变更或未配置，导致 Token 校验失败。
- **处理**：生产环境必须设置固定的 `JWT_SECRET`，部署后不应随意修改；修改后所有已有 Token 会失效。

### 5. ASR / 语音识别失败

- **原因**：`DASHSCOPE_API_KEY` 未配置或无效；或 Faster-Whisper 模型路径/配置有误。
- **处理**：配置有效的 DashScope 密钥；若使用本地 Faster-Whisper，确认 `FASTER_WHISPER_MODEL_DIR` 指向正确目录。

### 6. 端口冲突

- **原因**：`PORT` 与容器或平台默认端口不一致。
- **处理**：Zeabur 通常注入 `PORT`，无需手动设置；自托管时确保 `uvicorn` 监听的端口与反向代理一致（默认 8080）。
