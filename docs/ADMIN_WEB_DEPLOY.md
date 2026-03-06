# admin-web 独立后台部署（Zeabur）

本方案将管理员界面拆为独立服务 `admin-web`，不再依赖学习页右上角按钮。

## 服务拆分

- `web`：原有后端 API（`/api/auth/*`、`/api/admin/*`、`/api/transcribe/file` 等）
- `postgresql`：数据库
- `admin-web`：独立管理员前端（本目录 `admin-web/Dockerfile`）

## Zeabur 新建 admin-web 服务

1. 在同一项目中点击“新建服务”。
2. 选择当前 GitHub 仓库。
3. 构建入口指向 `admin-web/Dockerfile`。
4. 添加环境变量：
   - `PORT=8080`
   - `UPSTREAM_API_BASE_URL=https://你的web服务域名`（建议填完整 https 域名）

> 说明：`admin-web` 通过 Nginx 将 `/api/*` 反向代理到 `UPSTREAM_API_BASE_URL`，浏览器侧同域访问，不需要额外 CORS 配置。

## 登录与权限

- 管理员仍走现有登录接口：`/api/auth/login`
- 权限仍由后端 `ADMIN_EMAILS` 判定
- 非管理员账号会被拒绝（403 语义不变）

## 验证步骤

1. 打开 `admin-web` 独立域名，进入 `/admin/users`。
2. 使用 `root@qq.com` 登录（或在 `ADMIN_EMAILS` 白名单中的账号）。
3. 验证 `GET /api/admin/billing-rates` 返回 200。
4. 验证用户、流水、兑换码后台页可正常加载。

## 故障排查

- 后台接口 500：
  - 先检查 `web` 服务数据库迁移是否完成（`app.alembic_version` 应为 `20260306_0006`）
- 后台接口 502/超时：
  - 检查 `UPSTREAM_API_BASE_URL` 是否写成可访问的 `web` 域名
- 登录成功但无权限：
  - 检查 `web` 的 `ADMIN_EMAILS` 是否包含当前邮箱
