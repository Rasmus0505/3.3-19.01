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

## 本次升级包含

- 默认首页改为 `/admin/overview`
- 新增页面：
  - `/admin/translation-logs`
  - `/admin/operation-logs`
  - `/admin/system`
- 字幕设置页新增：
  - 运营模板（稳妥默认 / 长句更积极 / 节省模型调用）
  - 回滚上一版本
  - 恢复当前线上值
- 现有列表页支持 URL 参数记忆，可直接复制筛选后的地址发给同事排查
- 兑换码批量停用、导出、批次复制改为正式弹窗确认，不再使用浏览器原生提示框

## 验证步骤

1. 打开 `admin-web` 独立域名，进入 `/admin/overview`。
2. 使用 `root@qq.com` 登录（或在 `ADMIN_EMAILS` 白名单中的账号）。
3. 验证总览页能看到：
   - 今日新增用户
   - 今日兑换入账
   - 近 24 小时翻译失败
   - 最近批次活动
4. 验证 `GET /api/admin/billing-rates`、`GET /api/admin/overview`、`GET /health/ready` 均返回成功结果。
5. 验证 `/admin/system` 能区分：
   - 服务存活
   - 数据库 ready
   - 后台 API 可达
6. 验证 `/admin/translation-logs`、`/admin/operation-logs` 可正常筛选分页。
7. 验证 `/admin/subtitle-settings` 可正常：
   - 应用模板
   - 保存配置
   - 回滚上一版本
8. 验证兑换码页的“批量停用 / 导出未兑换 CSV / 复制参数”均弹出正式确认框。

## 故障排查

- 后台接口 500：
  - 先检查 `web` 服务数据库迁移是否完成（`app.alembic_version` 应为 `20260306_0006`）
- 后台接口 502/超时：
  - 检查 `UPSTREAM_API_BASE_URL` 是否写成可访问的 `web` 域名
- 登录成功但无权限：
  - 检查 `web` 的 `ADMIN_EMAILS` 是否包含当前邮箱
- 总览页或系统页为空：
  - 先确认 `web` 服务已经部署本次代码，再确认浏览器访问的是新的 `admin-web` 域名而不是旧的内嵌 `/admin`
