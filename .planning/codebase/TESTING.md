# 测试

## 测试布局

`pytest.ini` 中当前配置的测试目录：

- `tests/unit`
- `tests/integration`
- `tests/e2e`
- `tests/contracts`
- `tests/fixtures`

Pytest 基础设置：

- `pythonpath = .`
- 测试文件模式 `test_*.py`

## 单元测试

当前的 unit 层覆盖了很多点状能力，例如：

- `tests/unit/test_dashscope_upload_router.py`
- `tests/unit/test_desktop_local_asr.py`
- `tests/unit/test_faster_whisper_asr.py`
- `tests/unit/test_security_hardening.py`
- `tests/unit/test_spa_route_fallback.py`
- `tests/unit/test_start_script_smoke.py`
- `tests/unit/test_translation_qwen_mt.py`

这一层大量使用 monkeypatch 和本地 SQLite / FastAPI TestClient 做隔离验证。

## 集成测试

integration 层覆盖内容包括：

- admin bootstrap 与 admin console API
- lesson task 恢复与回归流程
- 生产迁移脚本行为
- lessons / practice / wordbook API 路由

代表文件：

- `tests/integration/test_regression_api.py`
- `tests/integration/test_run_prod_migration.py`
- `tests/integration/api/test_lessons_api.py`

## 端到端测试

`tests/e2e/test_e2e_key_flows.py` 会走较完整的业务闭环，例如：

- auth register/login
- lesson creation
- practice/progress 更新
- wordbook 收集和状态流转
- admin wallet 调整流程

不过这个 e2e 仍然是进程内 `FastAPI TestClient` 形态，不是浏览器驱动测试。

## 契约测试

这套仓库的一个明显特点是：对“文件级集成不变量”做了大量 contract 测试。

代表文件：

- `tests/contracts/test_desktop_runtime_contract.py`
- `tests/contracts/test_desktop_installer_contract.py`
- `tests/contracts/test_dependency_manifest_contract.py`
- `tests/contracts/test_build_context_contract.py`

这些测试会锁定关键字符串、文件路径、打包结构以及 renderer/main-process 的桥接契约。

## Fixtures 与辅助层

可复用的测试初始化模块主要位于：

- `tests/fixtures/auth.py`
- `tests/fixtures/billing.py`
- `tests/fixtures/db.py`
- `tests/fixtures/lessons.py`
- `tests/conftest.py`

## 覆盖观察

较强的覆盖面：

- 后端 API 与 service 主流程
- 桌面运行时打包契约
- 启动与迁移行为

相对较弱或不够直接的部分：

- 没看到浏览器驱动的 React UI 自动化
- 前端 `frontend/src/` 的独立单元测试体系不明显，除了一两个局部测试文件
- admin web 独立镜像路径更多靠构建/契约验证，而不是完整交互测试