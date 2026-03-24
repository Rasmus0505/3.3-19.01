# 文档索引

本文档记录本次重构交付的所有文档。

## 项目概述

English Sentence Spelling Trainer（Bottle）是一款英语跟读练习应用，支持 Web（Zeabur）和桌面端（Electron）。

## 目录结构

| 路径 | 说明 |
|------|------|
| `app/` | FastAPI 后端源码 |
| `frontend/src/` | Vite + React 前端源码 |
| `tests/` | pytest 测试（unit / integration / contracts / e2e） |
| `Docx/` | 产品规划、协作流程文档 |
| `Dockerfile` | 多阶段容器构建 |
| `.env.example` | 环境变量模板 |
| `CHANGELOG.md` | 版本变更记录 |

## 后端架构

- **API 层**：`app/api/routers/` — 13 个路由模块，统一前缀 `/api/v1/`
- **业务层**：`app/services/` — 课程、练习、计费、ASR 等核心服务
- **数据访问层**：`app/repositories/` — Repository 模式封装
- **基础设施层**：`app/infra/` — ASR / Translation / Media 等抽象接口
- **Schema 层**：`app/schemas/` — Pydantic 请求/响应模型

## 前端架构

- **共享类型**：`frontend/src/shared/api/` — 前后端共用 API 类型
- **状态管理**：`frontend/src/store/` — Zustand Store 按域拆分 Slice
- **Feature 模块**：`frontend/src/features/` — 业务功能按域内聚

## 环境配置

详见 `.env.example`，关键变量：

- `DATABASE_URL` — PostgreSQL 连接
- `DASHSCOPE_API_KEY` — 通义千问 ASR API Key
- `FASTER_WHISPER_MODEL_DIR` — 本地 Whisper 模型路径

## 测试

```bash
# 单元测试
pytest tests/unit/ --collect-only

# 集成测试
pytest tests/integration/ --collect-only

# 契约测试
pytest tests/contracts/ --collect-only

# E2E 测试
pytest tests/e2e/ --collect-only
```
