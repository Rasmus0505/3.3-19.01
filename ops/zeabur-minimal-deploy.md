# Zeabur 最小部署指南

这个项目默认走：

- 代码放在 GitHub
- Zeabur 直接读取仓库
- Zeabur 按根目录 `Dockerfile` 构建并启动

不需要你自己处理 `Nginx`、`PM2` 或 Linux 运维。

## 首轮上线只做两件事

1. 建一个 `postgresql`
2. 建一个 `web`

`metabase` 放到第二阶段再接。

## 你在 Zeabur 里要做什么

### 第一步：连接 GitHub 仓库

- 在 Zeabur 新建服务
- 选择当前 GitHub 仓库
- 构建入口使用仓库根目录 `Dockerfile`
- 启动命令使用镜像默认入口 `scripts/start.sh`

### 第二步：新建 Postgres

- 直接选 Zeabur 的 Postgres 模板
- 用一个新的空数据库
- 把连接串填到 `web` 服务的 `DATABASE_URL`

### 第三步：给 `web` 填环境变量

至少填这 4 个：

- `DATABASE_URL`
- `DASHSCOPE_API_KEY`
- `JWT_SECRET`
- `ADMIN_EMAILS`

建议同时保留：

- `PORT=8080`
- `AUTO_MIGRATE_ON_START=true`
- `ALEMBIC_CONFIG=alembic.ini`
- `DB_INIT_MODE=auto`
- `TMP_WORK_DIR=/tmp/zeabur3.3`
- `MT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`
- `MT_MODEL=qwen-mt-flash`

分句和翻译批次默认值，请到后台“字幕/分句设置”里调整。

## 部署后怎么验证

### 先看服务是否活着

- `GET /health`
- 预期：`200`

### 再看数据库是否就绪

- `GET /health/ready`
- 预期：`200`

如果这里返回 `503`，优先看：

1. `DATABASE_URL`
2. Alembic 迁移日志
3. Postgres 是否已 ready

### 最后验证业务是否跑通

1. 登录成功
2. `GET /api/wallet/me` 返回 `200`
3. `GET /api/admin/billing-rates` 返回 `200`
4. 上传文件到 `POST /api/transcribe/file` 成功

## 常见问题先怎么查

### 管理后台接口返回 `500`

优先判断为“迁移没跑好”，不要先怀疑权限。

按这个顺序查：

1. 确认 `web` 环境变量里有：
   - `AUTO_MIGRATE_ON_START=true`
   - `ALEMBIC_CONFIG=alembic.ini`
   - `DB_INIT_MODE=auto`
2. 在 Zeabur 对 `web` 点一次 `Redeploy`
3. 打开部署日志，确认出现迁移成功相关日志
4. 如果迁移没成功，再检查 `DATABASE_URL` 和数据库权限

### `/health` 正常，但 `/health/ready` 不正常

- 先看数据库连通性
- 再看迁移是否执行
- 最后看业务表是否创建完成

## 可直接发给 Zeabur AI 的提示词

```text
请帮我把这个 GitHub 仓库部署到 Zeabur。
部署方式使用仓库根目录 Dockerfile。
这次先只创建两个服务：web 和 postgresql，不要先创建 metabase。
请提醒我填写这些环境变量：PORT=8080、DATABASE_URL、DASHSCOPE_API_KEY、JWT_SECRET、ADMIN_EMAILS。
并确认 AUTO_MIGRATE_ON_START=true、ALEMBIC_CONFIG=alembic.ini、DB_INIT_MODE=auto。
部署完成后，请按顺序帮我验证：
1. GET /health 返回 200
2. GET /health/ready 返回 200
3. GET /api/admin/billing-rates 返回 200
4. POST /api/transcribe/file 上传媒体文件成功
如果 /health 正常但 /health/ready 不正常，请优先排查数据库连接和迁移日志。
```

## 第二阶段再做什么

首轮稳定后，再接：

- `metabase`

接回后只同步 `app` schema。
