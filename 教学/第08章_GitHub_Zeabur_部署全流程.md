# 第08章：GitHub + Zeabur 部署全流程（小白可执行版）

## 8.1 部署心智模型

本项目默认部署模式：

1. 代码在 GitHub
2. Zeabur 连接仓库
3. Zeabur 按仓库 `Dockerfile` 构建
4. 自动启动 `web` 容器
5. 连接 `postgresql` 服务

你不需要自己维护 Nginx、PM2、Linux 守护进程。

---

## 8.2 第一次上线：只部署两个服务

推荐第一阶段只上：

1. `web`
2. `postgresql`

`metabase` 放到第二阶段，先保证主链路稳定。

---

## 8.3 详细步骤（按顺序）

### 步骤 1：准备 GitHub 仓库

- 确认代码已推送到主分支
- 确认仓库根目录有 `Dockerfile`

### 步骤 2：Zeabur 新建项目并连接仓库

- 在 Zeabur 选择“从 GitHub 导入”
- 选中本仓库
- 构建方式选 `Dockerfile`（仓库根目录）

### 步骤 3：创建 Postgres 服务

- 在同一 Zeabur 项目中创建 `postgresql`
- 等待数据库服务启动成功

### 步骤 4：填写 `web` 环境变量

至少填：

- `DATABASE_URL`
- `DASHSCOPE_API_KEY`
- `JWT_SECRET`
- `ADMIN_EMAILS`

建议加：

- `PORT=8080`
- `TMP_WORK_DIR=/tmp/zeabur3.3`
- `MT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`
- `MT_MODEL=qwen-mt-plus`

### 步骤 5：手动执行迁移

- 在 `web` 服务中执行：

```text
python -m alembic -c alembic.ini upgrade head
```

- 迁移失败时保留完整报错
- 迁移成功后重启 `web`

### 步骤 6：触发部署并看日志

关注三类日志：

1. 构建日志（依赖是否安装成功）
2. 手动迁移日志（迁移是否成功）
3. 运行日志（健康检查是否通过）

---

## 8.4 上线后验证顺序（必须做）

### 验证 1：进程活着

- `GET /health` 返回 `200`

### 验证 2：业务就绪

- `GET /health/ready` 返回 `200`

### 验证 3：核心业务可用

- 登录成功
- 上传文件调用 `POST /api/transcribe/file` 成功

如果只做验证 1，不算上线完成。

---

## 8.5 常见故障与处理

### 故障 1：`/health` 正常，`/health/ready` 失败

优先检查：

1. `DATABASE_URL` 是否正确
2. 手动迁移是否执行成功
3. 数据库服务是否可连接

### 故障 2：上传接口失败

优先检查：

1. `DASHSCOPE_API_KEY` 是否有效
2. `ffmpeg` 是否在镜像内可用
3. 上传文件格式是否异常

### 故障 3：首次上线出现 502

优先检查：

1. 是否真的使用仓库根目录 `Dockerfile`
2. `web` 与 `postgresql` 是否在同一 Zeabur 项目
3. 容器是否监听正确端口

---

## 8.6 可直接发给 Zeabur AI 的提示词

```text
请帮我在 Zeabur 上部署这个 GitHub 仓库，按仓库根目录 Dockerfile 构建。
本次先只部署两个服务：web 和 postgresql，不要部署 metabase。
请提醒我填写环境变量：PORT=8080、DATABASE_URL、DASHSCOPE_API_KEY、JWT_SECRET、ADMIN_EMAILS。
web 服务启动后，请先在 web 服务里执行 `python -m alembic -c alembic.ini upgrade head`，成功后再重启一次 web。
部署后请依次验证：
1) GET /health 返回 200
2) GET /health/ready 返回 200
3) POST /api/transcribe/file 上传媒体文件成功
如果 /health 正常但 /health/ready 失败，请先检查数据库连接和手动迁移日志。
```

---

## 8.7 本章自测

1. 第一次上线为什么建议只上 `web + postgresql`？
2. 为什么 `/health` 通过不代表业务可用？
3. 说出 Zeabur 上最先要填的 4 个环境变量。
