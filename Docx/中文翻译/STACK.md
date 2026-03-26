# 技术栈

## 运行层

- 后端：Python 3.11 容器，通过 `scripts/start.sh` 中的 `uvicorn` 运行 `app/main.py` 的 FastAPI。
- 前端：`frontend/` 下 React 18 + Vite 7，搭配 Tailwind CSS 4 与 Radix UI 组件。
- 桌面客户端：`desktop-client/` 下 Electron 35 壳层，承载同一套前端并增加本地 helper/运行时桥接。
- 数据库：SQLAlchemy 2 + `migrations/` 下 Alembic 迁移；生产目标为 PostgreSQL，开发阶段常用 SQLite。

## Python 依赖

`requirements.txt` 中的主要运行时依赖：

- Web/API：`fastapi`、`uvicorn`、`python-multipart`
- 数据：`sqlalchemy`、`psycopg2-binary`、`alembic`
- 认证/安全：`PyJWT`、`passlib[bcrypt]`
- AI/媒体：`dashscope`、`faster-whisper`、`spacy`、`yt-dlp`、`requests`
- 翻译客户端：在 `app/infra/translation_qwen_mt.py` 中使用 `openai` SDK 对接兼容 base URL

`requirements-dev.txt` 中的开发依赖：

- `pytest`、`httpx`、`pyinstaller`

## 前端依赖

`frontend/package.json` 中的关键包：

- `react`、`react-dom`、`react-router-dom`
- UI 基础组件：`@radix-ui/*`、`lucide-react`、`sonner`
- 样式：`tailwindcss`、`@tailwindcss/vite`、`class-variance-authority`、`tailwind-merge`
- 图表/状态：`recharts`、`zustand`

## 桌面端依赖

`desktop-client/package.json` 中的关键包：

- `electron`
- `electron-builder`

桌面打包资源包含：

- `desktop-client/electron/**/*`
- `desktop-client/.cache/frontend-dist/**/*`
- `tools/ffmpeg/bin/*`
- `tools/yt-dlp/yt-dlp.exe`
- `asr-test/models/faster-distil-small.en/*`

## 配置与环境

后端配置集中在 `app/core/config.py`。

代码与 README 暴露的重要环境变量：

- `APP_ENV`、`PORT`、`DATABASE_URL`
- `JWT_SECRET`
- `DASHSCOPE_API_KEY`
- `ADMIN_EMAILS`、`ADMIN_BOOTSTRAP_PASSWORD`
- `REDEEM_CODE_EXPORT_CONFIRM_TEXT`
- `AUTO_MIGRATE_ON_START`
- `PERSISTENT_DATA_DIR`、`ASR_BUNDLE_ROOT_DIR`
- `MT_BASE_URL`、`MT_MODEL`

## 构建与打包

- 根目录 `Dockerfile` 采用多阶段构建：Vite 前端 -> Python 运行时镜像 -> 将构建产物复制到 `app/static/`。
- `admin-web/Dockerfile` 在 nginx 后构建独立的 admin 静态站点。
- `frontend/vite.config.js` 在 web 场景使用 `/static/`，在桌面 renderer 构建场景使用 `./` 作为 base path。
- `desktop-client/scripts/build.mjs` 会以桌面标志重建前端，并把输出复制到 `desktop-client/.cache/frontend-dist/`。
