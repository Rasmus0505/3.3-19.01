# Zeabur 最小部署指南（GitHub 直构）

这个项目默认走：

- GitHub 仓库
- Zeabur 读取仓库
- Zeabur 按根目录 `Dockerfile` 构建并启动

不需要你自己处理 Nginx、PM2 或 Linux 运维。

## 首轮上线只做两件事

1. 建一个 `postgresql`
2. 建一个 `web`

`metabase` 放到第二阶段再接。

## 你在 Zeabur 里要做什么

### 第一步：连接 GitHub 仓库

- 在 Zeabur 新建服务
- 选择当前 GitHub 仓库
- 构建入口用仓库根目录 `Dockerfile`

### 第二步：新建 Postgres

- 直接选 Zeabur 的 Postgres 服务
- 用一个全新的空数据库

### 第三步：给 web 填环境变量

至少填这 4 个：

- `DATABASE_URL`
- `DASHSCOPE_API_KEY`
- `JWT_SECRET`
- `ADMIN_EMAILS`

建议一并保留：

- `AUTO_MIGRATE_ON_START=true`
- `TMP_WORK_DIR=/tmp/zeabur3.3`
- `MT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`
- `MT_MODEL=qwen-mt-plus`

## 为什么现在不用 `search_path`

这次重构后：

- ORM 已经显式绑定 `app` schema
- Alembic 也显式迁移到 `app` schema

所以 `DATABASE_URL` 直接用普通 Postgres 连接串即可，不需要额外拼 `search_path=app,public`。

## 部署后怎么验证

### 先验证服务活着

- `GET /health`
- 预期：`200`

### 再验证数据库就绪

- `GET /health/ready`
- 预期：`200`

如果这里返回 `503`，优先看：

1. `DATABASE_URL`
2. Alembic 迁移日志
3. Postgres 是否已经 ready

### 最后验证业务

1. 登录成功
2. `GET /api/wallet/me` 返回 `200`
3. `GET /api/admin/billing-rates` 返回 `200`
4. 上传文件到 `POST /api/transcribe/file` 成功

## 可直接发给 Zeabur AI 的提示词

```text
请帮我把这个 GitHub 仓库部署到 Zeabur。
部署方式使用仓库根目录 Dockerfile，不要用 GHCR 镜像。
这次先只创建两个服务：web 和 postgresql，不要先创建 metabase。
请提醒我填写环境变量：DATABASE_URL、DASHSCOPE_API_KEY、JWT_SECRET、ADMIN_EMAILS。
部署完成后，请按顺序帮我验证：
1. GET /health 返回 200
2. GET /health/ready 返回 200
3. POST /api/transcribe/file 上传媒体文件成功
如果 /health 正常但 /health/ready 失败，请优先排查数据库连接与 Alembic 迁移。
```

## 第二阶段再做什么

首轮稳定后，再接：

- `metabase`

接回后只同步 `app` schema。
