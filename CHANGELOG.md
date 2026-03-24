# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **后端测试扩展** (`tests/`)
  - E2E 端到端测试（`tests/e2e/`），覆盖注册→登录→课程生成→练习完整流程
  - API 契约测试（`tests/contracts/`），验证 lessons / auth 响应 JSON 符合 Pydantic Schema
  - API 集成测试（`tests/integration/api/`），覆盖 lessons / practice / wordbook 三个模块
- **前端 API 共享类型** (`frontend/src/shared/api/`)
  - 统一导出 lessons / auth / wallet / billing 等 API 类型，供前后端复用
- **统一错误处理体系** (`app/core/errors.py`)
  - 标准化 HTTPException 响应结构，统一 error_code / message / detail 字段
- **Infra 基础设施抽象层** (`app/infra/`)
  - ASR / Translation / Media 等基础设施统一抽象，接口化设计
- **Repository 数据访问层** (`app/repositories/`)
  - 分离 SQLAlchemy 直接调用，统一的 Repository 模式

### Changed
- **统一 API 路由结构** — 所有路由前缀符合 `/api/v1/` 规范（13 个路由模块）
- **Zustand Store 拆分** — 按功能域拆分为独立 Slice 文件，提升可维护性
- **前端 Feature 模块内聚化** — Feature 目录按业务域组织，减少跨域依赖
- **管理后台 AdminShell 规范化** — 统一布局组件与路由注册逻辑
- **测试目录结构重组** (`tests/`)
  - `unit/` 单元测试、`integration/` 集成测试、`contracts/` 契约测试、`e2e/` E2E 测试分离
- **Dockerfile 构建产物优化** — 多阶段构建减小镜像体积，`.dockerignore` 排除非必要文件

### Fixed
- **ASR 顶层循环导入** — `app/infra/asr/dashscope.py` / `faster_whisper.py` 改为延迟导入，解决 `app.main` 导入报错
