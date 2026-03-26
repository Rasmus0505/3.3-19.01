# 约定

## 后端约定

### 配置优先

- 运行时配置集中在 `app/core/config.py`。
- `_get_env_bool`、`_get_env_int`、`resolve_database_url()` 这类辅助函数被复用，而不是在 router 中到处零散读取环境变量。

### 标准错误载荷

- Router 通常通过 `app/core/errors.py` 中的 `error_response(...)` 返回统一错误结构。
- media 和 billing 错误都有专门的映射辅助函数。
- API 返回显式错误码，例如 `INVALID_MODEL`、`REQUEST_TIMEOUT`、`INVALID_CREDENTIALS`。

### Service / Repository 拆分

- 路由层通常把重业务逻辑交给 service 层，而不是直接在路由函数里完成。
- 读写职责经常被拆分，例如 `lesson_command_service.py` 与 `lesson_query_service.py`。
- `app/repositories/` 中保留数据库访问封装。

### 安全与鉴权

- 密码通过 `app/security.py` 中的 PBKDF2 进行哈希。
- JWT access/refresh token 也在该模块统一创建与校验。
- 管理员权限现在是数据驱动的，依赖 `users.is_admin`，和 README / readiness 检查保持一致。

### 运行时就绪检查

- `app/main.py` 会显式做 readiness 探针，并在数据库未就绪时阻断 `/api/*`。
- `scripts/start.sh` 会打印启动决策，并通过 `AUTO_MIGRATE_ON_START` 控制自动迁移。

## 前端约定

### 按功能组织

- 产品行为主要按功能拆在 `frontend/src/features/` 下。
- 共享抽象集中在 `frontend/src/shared/`、`frontend/src/components/ui/` 和 `frontend/src/store/`。

### Desktop 感知的共享前端

- Web 和 Desktop 使用同一套 renderer 源码。
- `frontend/src/main.jsx` 根据 `VITE_DESKTOP_RENDERER_BUILD` 切换路由模式。
- `frontend/src/shared/api/client.js` 隐藏“当前请求是浏览器 fetch 还是 Electron bridge”这一差异。

### 状态与工具

- Zustand slices 存在于 `frontend/src/store/slices/`。
- 业务格式化与公共工具放在 `frontend/src/shared/lib/` 和 `frontend/src/lib/utils.js`。

## 测试约定

- 测试套件按层次分成 unit、integration、e2e、contracts。
- 测试里经常用 `create_database_engine(...)` + SQLite 临时库做隔离验证。
- Contract tests 会断言桌面打包、前端桥接和关键文件结构等不变量。

## 命名与文件模式

- Python 后端大多使用 snake_case 文件名。
- React 组件大多使用 PascalCase 文件名。
- Electron 主进程/runtime 模块多用 `.mjs`，preload 为兼容性采用 `.cjs`。

## 值得注意的不一致

- `app/api/routers/` 中同时存在平铺版和分目录版模块。
- 前端混用了 `.jsx`、`.js`、`.ts`、`.tsx`。
- 多个目录里提交了生成物，目录内容并不严格等同于“只有手写源码”。