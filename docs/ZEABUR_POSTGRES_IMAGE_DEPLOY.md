# PostgreSQL 镜像先放 GitHub(GHCR) 再给 Zeabur 使用

先说最重要的一句：本项目默认是 GitHub + Zeabur 托管部署，不需要自建服务器运维。

## 1. 推荐方案（公开 GHCR 镜像）

目标：把 `docker.io/library/postgres:18` 预先同步到 GHCR，Zeabur 直接拉 GHCR。

### 1.1 在 GitHub 触发镜像同步

工作流：`.github/workflows/postgres-mirror-ghcr.yml`

- 手动触发 `Sync PostgreSQL Mirror to GHCR`
- 输入 `postgres_tag=18`
- 可选勾选 `also_push_dockerhub=true` 作为双仓库备份（需先配 Secrets）

输出镜像：
- `ghcr.io/<你的GitHub用户名>/postgres-mirror:18`
- `ghcr.io/<你的GitHub用户名>/postgres-mirror:latest`

### 1.2 在 Zeabur 使用该镜像

方式 A（模板导入）：填写变量 `APP_POSTGRES_IMAGE`

- 推荐填：`ghcr.io/<你的GitHub用户名>/postgres-mirror:18`

方式 B（已有服务直接改）

- 打开 `postgresql` 服务
- 在镜像配置处改为：`ghcr.io/<你的GitHub用户名>/postgres-mirror:18`

### 1.3 必填服务与环境变量

必须服务：
- `postgresql`
- `web`

数据库服务关键变量：
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `PGDATA`

web 服务关键变量：
- `DATABASE_URL`（建议包含 `?options=-csearch_path%3Dapp%2Cpublic`）
- `DASHSCOPE_API_KEY`
- `JWT_SECRET`
- `ADMIN_EMAILS`

### 1.4 验证

1. `GET /health` 返回 200  
2. 上传文件调用 `POST /api/transcribe/file` 成功

## 2. 私有 GHCR 镜像方案

适用：镜像不能公开。

做法：
1. 保持 GHCR 包为 private
2. 在 Zeabur 的 PostgreSQL 服务中配置镜像拉取凭据（GH 用户名 + PAT）
3. 镜像仍填写：`ghcr.io/<你的GitHub用户名>/postgres-mirror:18`

建议 PAT 权限：
- `read:packages`（拉取）
- 如需推送则加 `write:packages`

## 3. 自定义 PostgreSQL 镜像方案

适用：需要固定扩展或初始化逻辑。

仓库已提供：
- `ops/postgres-custom/Dockerfile`
- `ops/postgres-custom/initdb/000_readme.sql`
- `.github/workflows/postgres-custom-ghcr.yml`

使用步骤：
1. 把初始化 SQL 放到 `ops/postgres-custom/initdb/*.sql`
2. 手动触发 `Build Custom PostgreSQL Image to GHCR`
3. Zeabur `postgresql` 服务镜像改为：
   - `ghcr.io/<你的GitHub用户名>/postgres-custom:pg18-custom`（或你触发时填的 tag）

## 4. 双仓库容灾方案（GHCR 主 + Docker Hub 备）

适用：你希望单仓库异常可快速切换。

仓库已支持：
- 在 `postgres-mirror-ghcr` 工作流勾选 `also_push_dockerhub=true`

先配 GitHub Secrets：
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`
- `DOCKERHUB_IMAGE`（例如 `yourname/postgres-mirror`）

切换策略：
1. 正常用 GHCR：`ghcr.io/<owner>/postgres-mirror:18`
2. GHCR 拉取失败时，改成 Docker Hub：`docker.io/<DOCKERHUB_IMAGE>:18`

## 5. 代理/加速方案（非 MVP 首选）

适用：所在网络长期跨 registry 不稳定。

做法：
1. 先部署镜像代理服务
2. PostgreSQL 镜像改为代理地址
3. 保留 GHCR/Docker Hub 原始镜像作为回退

注意：多一层服务会增加排障复杂度，MVP 阶段优先使用 GHCR 公开镜像或双仓库容灾。

## 6. 可直接发给 Zeabur AI 的提示词

```text
请帮我在当前项目里把 PostgreSQL 服务改为从 GHCR 拉取：
1) 新增/修改 postgresql 服务镜像为 ghcr.io/<我的GitHub用户名>/postgres-mirror:18
2) 保持端口 5432，挂载持久卷，保留 POSTGRES_DB/POSTGRES_USER/POSTGRES_PASSWORD/PGDATA
3) web 服务 DATABASE_URL 继续指向该 PostgreSQL，并保留 search_path=app,public
4) 部署后请给我验证步骤：/health 和 /api/transcribe/file
```
