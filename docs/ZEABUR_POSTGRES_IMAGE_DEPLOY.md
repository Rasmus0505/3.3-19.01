# 已弃用：GHCR Postgres 镜像部署说明

这份文档对应旧方案：先把数据库镜像同步到 GHCR，再让 Zeabur 拉 GHCR。

当前仓库的推荐方案已经改为：

1. Zeabur 直接连接 GitHub 仓库
2. `web` 服务按仓库根目录 `Dockerfile` 构建
3. `postgresql` 直接使用 Zeabur 自带 Postgres 服务

## 为什么弃用旧方案

- 旧方案增加了额外镜像同步链路
- 排障时很难区分是仓库代码问题、GHCR 问题还是 Zeabur 拉镜像问题
- 当前阶段优先目标是“先稳定上线”，不是镜像分发优化

## 现在请看这些文件

- `README.md`
- `ops/zeabur-minimal-deploy.md`
- `zeabur-template.yaml`

## 仍然需要记住的一点

当前代码已经显式绑定 `app` schema，`DATABASE_URL` 不需要再额外拼 `search_path=app,public`。
