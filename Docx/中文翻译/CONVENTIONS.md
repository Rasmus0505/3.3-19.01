# 约定

## 后端约定

### 配置优先

- 运行时配置集中在 `app/core/config.py`。
- `_get_env_bool`、`_get_env_int`、`resolve_database_url()` 等环境变量解析助手被复用，而不是在各路由里零散地直接读取环境变量。

### 标准化错误载荷

- 路由通常返回 `app/core/errors.py` 中的 `error_response(...)`。
- 针对媒体与计费错误提供了业务错误映射助手。
- API 响应使用显式错误码，例如 `INVALID_MODEL`、`REQUEST_TIMEOUT`、`INVALID_CREDENTIALS`。

### 服务 / 仓储拆分

- 路由处理器通常调用服务模块，而不是直接内嵌大量业务逻辑。
- 读写职责常被拆分，例如 `lesson_command_service.py` 与 `lesson_query_service.py`。
- `app/repositories/` 下的仓储模块承载可复用的持久化操作。

### 安全与认证

- 密码在 `app/security.py` 中使用 PBKDF2 哈希。
- JWT access/refresh token 也在同一模块中创建。
- 管理员权限通过 `users.is_admin` 做数据驱动，与 README 及就绪检查保持一致。

### 运行就绪检查

- `app/main.py` 使用显式就绪探针，并可在 DB 就绪失败时阻断 `/api/*`。
- `scripts/start.sh` 会记录启动决策，并用 `AUTO_MIGRATE_ON_START` 控制自动迁移闸门。

## 前端约定

### 面向功能的组织方式

- 产品行为按功能分组在 `frontend/src/features/` 下。
- 共享抽象位于 `frontend/src/shared/`、`frontend/src/components/ui/`、`frontend/src/store/`。

### 面向桌面的共享前端

- Web 与桌面端使用同一套 renderer 源码。
- `frontend/src/main.jsx` 根据 `VITE_DESKTOP_RENDERER_BUILD` 选择路由模式。
- `frontend/src/shared/api/client.js` 屏蔽请求到底走浏览器 fetch 还是 Electron 桥。

### 状态与工具

- Zustand slices 存放在 `frontend/src/store/slices/`。
- 格式化与领域工具函数位于 `frontend/src/shared/lib/` 与 `frontend/src/lib/utils.js`。

## 测试约定

- 测试套件有意识地采用分层：unit、integration、e2e、contracts。
- 测试常通过 `create_database_engine(...)` 创建 SQLite 数据库以实现隔离验证。
- 契约测试会断言桌面与前端集成代码中的关键文件级不变量。

## 命名与文件模式

- Python 后端使用 snake_case 文件名。
- React 组件多数使用 PascalCase 文件名。
- Electron 对 main/runtime 模块使用 `.mjs`，对 preload 兼容层使用 `.cjs`。

## 值得注意的不一致点

- `app/api/routers/` 中同时存在扁平与嵌套路由模块形态。
- 前端混用了 JS/TS 文件（`.jsx`、`.js`、`.ts`、`.tsx`）。
- 多个目录把生成制品与源码一起提交，因此目录内容并不严格等于“仅手写源码”。
