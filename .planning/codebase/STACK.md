# 技术栈

## 运行时层级

- Backend：Python 3.11 容器，通过 `scripts/start.sh` 启动 `uvicorn`，入口是 `app/main.py`
- Frontend：`frontend/` 中的 React 18 + Vite 7 应用，使用 Tailwind CSS 4 和 Radix UI
- Desktop client：`desktop-client/` 中的 Electron 35，复用同一套前端并增加本地 helper / runtime bridge
- Database：SQLAlchemy 2 + Alembic，生产目标是 PostgreSQL，本地开发常用 SQLite

## Python 依赖

`requirements.txt` 中的运行时核心依赖：

- Web/API：`fastapi`、`uvicorn`、`python-multipart`
- 数据层：`sqlalchemy`、`psycopg2-binary`、`alembic`
- 认证安全：`PyJWT`、`passlib[bcrypt]`
- AI / 媒体：`dashscope`、`faster-whisper`、`spacy`、`yt-dlp`、`requests`
- 翻译客户端：`app/infra/translation_qwen_mt.py` 使用 `openai` SDK 连接兼容式翻译基座

`requirements-dev.txt` 中的开发补充依赖：

- `pytest`、`httpx`、`pyinstaller`

## 前端依赖

`frontend/package.json` 中的重要依赖：

- `react`、`react-dom`、`react-router-dom`
- UI primitives：`@radix-ui/*`、`lucide-react`、`sonner`
- 样式：`tailwindcss`、`@tailwindcss/vite`、`class-variance-authority`、`tailwind-merge`
- 图表与状态：`recharts`、`zustand`

## 桌面端依赖

`desktop-client/package.json` 中的重要依赖：

- `electron`
- `electron-builder`

桌面打包额外资源包含：

- `desktop-client/electron/**/*`
- `desktop-client/.cache/frontend-dist/**/*`
- `tools/ffmpeg/bin/*`
- `tools/yt-dlp/yt-dlp.exe`
- `asr-test/models/faster-distil-small.en/*`

## 配置与环境变量

后端配置集中定义在 `app/core/config.py`。

当前代码和 README 中暴露的重要环境变量：

- `APP_ENV`、`PORT`、`DATABASE_URL`
- `JWT_SECRET`
- `DASHSCOPE_API_KEY`
- `ADMIN_EMAILS`、`ADMIN_BOOTSTRAP_PASSWORD`
- `REDEEM_CODE_EXPORT_CONFIRM_TEXT`
- `AUTO_MIGRATE_ON_START`
- `PERSISTENT_DATA_DIR`、`ASR_BUNDLE_ROOT_DIR`
- `MT_BASE_URL`、`MT_MODEL`

## 构建与打包

- 根 `Dockerfile` 使用多阶段构建：Vite 前端 -> Python 运行时镜像 -> 把构建好的静态资源拷贝进 `app/static/`
- `admin-web/Dockerfile` 会单独构建后台静态页面并交给 nginx
- `frontend/vite.config.js` 对 web 使用 `/static/` base，对 desktop renderer build 使用 `./`
- `desktop-client/scripts/build.mjs` 会使用 desktop 标志重新构建前端，再把输出复制到 `desktop-client/.cache/frontend-dist/`