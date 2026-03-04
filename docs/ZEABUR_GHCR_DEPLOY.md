# Zeabur + GHCR 稳定发布手册（启动自动迁移）

## 目标

把部署流程固定为：

1. GitHub Actions 构建并推送 GHCR 镜像
2. Zeabur 拉取成品镜像运行
3. 容器启动时自动执行 `alembic upgrade head`
4. 迁移失败则阻断启动（失败阻断策略）

## 前置条件

- GitHub 仓库：`Rasmus0505/3.3-19.01`
- 分支：`main`
- 已存在：
  - `alembic.ini`
  - `migrations/versions/*.py`
  - `scripts/start.sh`
  - `Dockerfile` 中包含：
    - `COPY alembic.ini ./`
    - `COPY migrations ./migrations`
    - `COPY scripts ./scripts`
    - `CMD ["sh", "/app/scripts/start.sh"]`

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

## B. Zeabur 使用 GHCR 镜像

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
   - `AUTO_MIGRATE_ON_START=true`
   - `ALEMBIC_CONFIG=alembic.ini`
5. 启动命令留空（使用镜像内默认 CMD）

## C. 上线前预检（一次）

在当前运行环境先执行：

```bash
cd /app
python -m alembic -c alembic.ini current
```

预期是当前链路的基线版本（当前为 `20260304_0001`）。若不一致，先对齐版本再发布新镜像。

## D. 自动迁移日志预期

发布后检查启动日志，预期顺序：

```text
[boot] running alembic upgrade head
[boot] starting uvicorn
INFO:     Application startup complete.
```

有新迁移时会出现 `Running upgrade ...`；无新迁移则为 no-op。

## E. 发布后验收

1. 健康检查：
   - `GET /health` -> `200`
2. 用户接口（有效用户 token）：
   - `GET /api/wallet/me` -> `200`
3. 管理接口（管理员 token）：
   - `GET /api/admin/billing-rates` -> `200`

## F. 应急与回滚

1. 迁移失败导致启动失败时，临时止血：

```bash
AUTO_MIGRATE_ON_START=false
```

然后重启服务，恢复可用性。

2. 镜像回滚：
   - 从 `latest` 切回上一个稳定 `sha-xxxx`
3. 数据库回滚（仅确认需要时）：

```bash
python -m alembic -c alembic.ini downgrade -1
```

4. 回滚后重跑验收步骤。

## 常见问题

### 1) `No config file 'alembic.ini' found`

- 原因：镜像里没复制 `alembic.ini`
- 修复：确认 `Dockerfile` 有 `COPY alembic.ini ./`，重建镜像

### 2) `No such revision`

- 原因：数据库记录 revision 与代码中的迁移脚本不一致
- 修复：先对齐 `alembic_version`，再执行升级

### 3) `/api/...` 返回 401

- 401 仅表示认证失败，不代表接口挂掉
- 验收必须用有效 token
