# 测试

## 测试布局

在 `pytest.ini` 中配置：

- `tests/unit`
- `tests/integration`
- `tests/e2e`
- `tests/contracts`
- `tests/fixtures`

Pytest 设置：

- `pythonpath = .`
- 测试文件模式为 `test_*.py`

## 单元测试

单元覆盖包含以下聚焦行为：

- `tests/unit/test_dashscope_upload_router.py`
- `tests/unit/test_desktop_local_asr.py`
- `tests/unit/test_faster_whisper_asr.py`
- `tests/unit/test_security_hardening.py`
- `tests/unit/test_spa_route_fallback.py`
- `tests/unit/test_start_script_smoke.py`
- `tests/unit/test_translation_qwen_mt.py`

这些测试大量使用 monkeypatch 与本地 SQLite/TestClient。

## 集成测试

集成覆盖包括：

- admin 引导初始化与 admin 控制台 API
- lesson 任务恢复与回归流程
- 生产迁移脚本行为
- lesson/practice/wordbook API 路由

代表文件：

- `tests/integration/test_regression_api.py`
- `tests/integration/test_run_prod_migration.py`
- `tests/integration/api/test_lessons_api.py`

## 端到端测试

`tests/e2e/test_e2e_key_flows.py` 覆盖了真实流程，例如：

- auth 注册/登录
- lesson 创建
- practice/progress 更新
- wordbook 收集与状态变更
- admin 钱包调整流程

该 e2e 层仍在进程内使用 FastAPI `TestClient`，并非浏览器驱动。

## 契约测试

该仓库的一个显著优势是针对文件级集成假设的契约测试。

代表性检查：

- `tests/contracts/test_desktop_runtime_contract.py`
- `tests/contracts/test_desktop_installer_contract.py`
- `tests/contracts/test_dependency_manifest_contract.py`
- `tests/contracts/test_build_context_contract.py`

这些测试会断言关键字符串、文件路径、打包假设以及 renderer/main 进程 hook 保持一致。

## Fixtures 与助手

可复用初始化模块位于：

- `tests/fixtures/auth.py`
- `tests/fixtures/billing.py`
- `tests/fixtures/db.py`
- `tests/fixtures/lessons.py`
- `tests/conftest.py`

## 覆盖观察

较强区域：

- 后端 API 与服务工作流
- 桌面运行时打包契约
- 启动与迁移行为

从当前检查看较弱/可见度较低区域：

- React UI 未观察到浏览器自动化测试套件
- `frontend/src/` 未观察到专门的前端单元测试运行体系（除一个功能局部测试文件外）
- admin web 的 nginx 镜像路径主要通过打包/构建假设验证，而不是 UI 交互测试
