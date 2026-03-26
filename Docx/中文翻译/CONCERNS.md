# 关注点

## 仓库卫生

当前仓库包含了相当数量的生成内容或机器本地内容：

- 工作树中存在 `frontend/node_modules/`
- 存在 `frontend/dist/` 和 `frontend/dist-admin/`
- 存在 `desktop-client/.cache/`
- 存在本地 SQLite 文件 `app.db`、`app.db-shm`、`app.db-wal`
- 在 `app/`、`tests/`、`migrations/`、`asr-test/` 中存在大量 `__pycache__/` 目录与 `*.pyc` 文件

映射阶段观察到的数量：

- `frontend_node_modules_files=21460`
- `desktop_cache_files=690`
- `frontend_dist_files=27`
- `__pycache__=32`
- `pyc=230`

这会增加克隆体积、评审噪声，以及陈旧制品干扰调试的风险。

## 源码与生成输出混杂

多个目录把手写源码与生成输出或运行时缓存混在一起：

- `frontend/` 同时包含源码、本地构建输出和 `node_modules`
- `desktop-client/` 同时包含源码和 `.cache/` 下 helper/runtime/frontend 制品
- `asr-test/` 同时包含脚本、大模型文件、基准运行结果与归档

这会让人更难判断哪些文件才是权威的源码来源。

## 路由 / 模块形态漂移

后端同时存在传统扁平路由文件与嵌套路由包，例如：

- `app/api/routers/auth.py` 与 `app/api/routers/auth/router.py`
- `app/api/routers/admin.py` 与 `app/api/routers/admin/router.py`
- `app/api/routers/billing.py` 与 `app/api/routers/billing/router.py`
- `app/api/routers/lessons.py` 与 `app/api/routers/lessons/router.py`

这通常意味着重构进行中或兼容层并存，容易让新贡献者困惑。

## 运行复杂度

产品覆盖面包括：

- web 应用
- admin 应用
- 桌面客户端
- 本地 helper 运行时
- 云端 ASR 路径
- 本地 ASR 路径
- 对迁移状态敏感的后端就绪逻辑

这种广度会提高协同成本，并在边界处提升回归风险，尤其是 auth/session、媒体处理与打包环节。

## 安全 / 风险敏感点

应用包含若干高敏感度的运行控制点：

- `app/security.py` 中的 JWT 认证
- `app/services/admin_bootstrap.py` 中的 admin 初始化
- `app/core/config.py` 中的导出确认保护
- `app/api/routers/admin_sql_console.py` 及相关模块中的 SQL/admin 控制台路由

这些区域在生产环境需要额外审查，因为一旦出错，影响面会明显放大。

## 相对产品覆盖面的测试缺口

后端测试较扎实，但 UI/运行时集成覆盖面看起来仍超过现有自动化覆盖：

- 未观察到浏览器驱动的 web UI 测试套件
- 桌面 renderer 行为较依赖契约测试与字符串断言
- admin web 的部署路径与主 Docker 构建路径分离，若缺少常规演练容易产生漂移

## 部署与迁移风险

`app/main.py` 中的就绪逻辑依赖 schema 完整性和严格的生产配置。这对安全有益，但也意味着：

- 迁移不完整的环境会就绪失败
- `DATABASE_URL`、`ADMIN_BOOTSTRAP_PASSWORD` 或 `REDEEM_CODE_EXPORT_CONFIRM_TEXT` 配置漂移会阻断发布
- 启动行为会随 `AUTO_MIGRATE_ON_START` 的不同而显著变化
