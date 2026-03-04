# Zeabur + GHCR 稳定发布手册（迁移独立执行）

## 目标

把部署流程固定为：

1. GitHub Actions 构建并推送 GHCR 镜像
2. Zeabur 拉取成品镜像运行
3. 数据库迁移在服务运行后手动执行

这样可避免把迁移写进启动命令导致的启动链路不稳定。

## 前置条件

- GitHub 仓库：`Rasmus0505/3.3-19.01`
- 分支：`main`
- 已存在：
  - `alembic.ini`
  - `migrations/versions/*.py`
  - `Dockerfile` 中包含：
    - `COPY alembic.ini ./`
    - `COPY migrations ./migrations`
    - `CMD ... uvicorn ...`

## A. 触发 GHCR 镜像构建

1. 进入 GitHub 仓库 `Actions` 页面
2. 选择 `Build and Push GHCR Image`
3. 点击 `Run workflow`
4. 等待完成，确认日志出现：
   - `Login GHCR` 成功
   - `Build and Push` 成功
   - 推送标签包含：
     - `ghcr.io/rasmus0505/3.3-19.01:latest`
     - `ghcr.io/rasmus0505/3.3-19.01:sha-xxxx`

如果失败：

- 先修复 GitHub Actions（权限、Dockerfile、构建错误）
- 不要先改 Zeabur

## B. Zeabur 改为拉 GHCR 镜像

1. 打开 Zeabur 服务
2. 部署方式选 `Custom Image`（或 `Image Deploy`）
3. 镜像地址填：
   - 快速验证：`ghcr.io/rasmus0505/3.3-19.01:latest`
   - 生产建议：`ghcr.io/rasmus0505/3.3-19.01:sha-xxxx`（可精确回滚）
4. 环境变量确认：
   - `DATABASE_URL`
   - `DASHSCOPE_API_KEY`
   - `JWT_SECRET`
   - `ADMIN_EMAILS`
   - `DB_INIT_MODE=auto`
   - `MT_BASE_URL`
   - `MT_MODEL`
5. 启动命令留空（使用镜像内默认 CMD）

## C. 独立执行数据库迁移（最稳）

服务状态到 `RUNNING` 后，在 Zeabur Console 运行：

```bash
cd /app
python -m alembic -c alembic.ini upgrade head
python -m alembic -c alembic.ini current
```

预期：

- `upgrade head` 成功
- `current` 显示非空 revision

## D. 发布后验收

1. 健康检查：
   - `GET /health` -> `200`
2. 用户接口（有效用户 token）：
   - `GET /api/wallet/me` -> `200`
3. 管理接口（管理员 token）：
   - `GET /api/admin/billing-rates` -> `200`
4. 容器文件验证（可选）：
   - `ls /app` 应看到 `alembic.ini` 和 `migrations/`

## E. 回滚

1. Zeabur 镜像 tag 从 `latest` 切回上个 `sha-xxxx`
2. 重启服务
3. 如需回滚数据库：

```bash
python -m alembic -c alembic.ini downgrade -1
```

4. 重跑验收步骤

## 常见问题

### 1) `No config file 'alembic.ini' found`

- 原因：镜像里没复制 `alembic.ini`
- 修复：确认 `Dockerfile` 有 `COPY alembic.ini ./`，重建镜像

### 2) `No such revision`

- 原因：`migrations/versions` 没进镜像
- 修复：确认 `Dockerfile` 有 `COPY migrations ./migrations`，重建镜像

### 3) `/api/...` 返回 401

- 401 仅表示认证失败，不代表接口挂掉
- 验收必须用有效 token
