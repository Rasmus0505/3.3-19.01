# 风险点

## 仓库卫生

当前仓库里混入了大量生成物或本地工件：

- `frontend/node_modules/`
- `frontend/dist/` 和 `frontend/dist-admin/`
- `desktop-client/.cache/`
- 本地 SQLite 文件 `app.db`、`app.db-shm`、`app.db-wal`
- `app/`、`tests/`、`migrations/`、`asr-test/` 中的大量 `__pycache__/` 与 `*.pyc`

映射时观察到的大致数量：

- `frontend_node_modules_files=21460`
- `desktop_cache_files=690`
- `frontend_dist_files=27`
- `__pycache__=32`
- `pyc=230`

这些内容会放大 clone 体积、review 噪音以及“陈旧工件影响判断”的风险。

## 源码和生成输出混放

多个目录同时混入手写源码、生成输出和运行时缓存：

- `frontend/` 同时包含源码、构建产物、`node_modules`
- `desktop-client/` 同时包含源码和 `.cache/` helper/runtime/frontend 产物
- `asr-test/` 同时包含脚本、模型文件、benchmark 运行结果和结果归档

这会降低“哪些文件是唯一事实来源”的可读性。

## Router / 模块形态漂移

后端存在平铺 router 文件和分目录 router 包并存的情况，例如：

- `app/api/routers/auth.py` 与 `app/api/routers/auth/router.py`
- `app/api/routers/admin.py` 与 `app/api/routers/admin/router.py`
- `app/api/routers/billing.py` 与 `app/api/routers/billing/router.py`
- `app/api/routers/lessons.py` 与 `app/api/routers/lessons/router.py`

这通常意味着处于重构过渡态，会让新加入的人更难判断真实入口。

## 运行面复杂度

产品表面同时覆盖：

- web app
- admin app
- desktop client
- local helper runtime
- 云端 ASR 路径
- 本地 ASR 路径
- 对迁移敏感的后端就绪检查

表面越多，边界回归风险越高，尤其是 auth/session、媒体处理和打包链路。

## 安全与高敏感能力

应用中存在多个高敏感区域：

- `app/security.py` 中的 JWT 鉴权
- `app/services/admin_bootstrap.py` 中的管理员引导
- `app/core/config.py` 中的导出确认保护
- `app/api/routers/admin_sql_console.py` 及相关管理控制台能力

这些区域一旦出错，影响范围明显大于普通业务功能。

## 自动化覆盖与产品表面的差距

后端自动化测试已经相对丰富，但整个产品表面的广度仍然超过当前自动化可见范围：

- 没看到浏览器驱动型 Web UI 测试套件
- Desktop renderer 的很多保护仍依赖 contract test 和字符串断言
- admin-web 的独立部署路径主要依赖构建/契约检查，而不是完整交互测试

## 部署与迁移风险

`app/main.py` 的 readiness 逻辑依赖表结构完整和生产配置正确。这有利于安全，但也意味着：

- 半迁移状态会直接导致 readiness 失败
- `DATABASE_URL`、`ADMIN_BOOTSTRAP_PASSWORD`、`REDEEM_CODE_EXPORT_CONFIRM_TEXT` 的配置漂移会直接阻断上线
- `AUTO_MIGRATE_ON_START` 的不同取值会显著改变启动路径