# English Sentence Spelling Trainer

这是一个部署在 Zeabur 上的英语句子练习应用，当前阶段以“先跑通、再稳定、最后再扩展”为原则。

## 部署原则

- 默认部署路径：`GitHub 仓库 -> Zeabur -> 按仓库根目录 Dockerfile 构建`
- 对外服务端口统一使用 `8080`
- 首轮只部署两个服务：`web` 和 `postgresql`
- 不要求你自己维护 `Nginx`、`PM2` 或 Linux 运维脚本
- 生产环境不要使用 SQLite

核心接口保持不变：

- `POST /api/transcribe/file`
- `GET /health`
- `GET /health/ready`

当前生产支持两条上传转写线路：

- `Bottle 1.0`：服务端本地 `faster-whisper-medium` 模型包
- `Bottle 2.0`：DashScope 云端 `qwen3-asr-flash-filetrans`

`/health` 只表示进程活着。  
`/health/ready` 表示数据库、关键表结构和启动安全策略都已经就绪。

## Zeabur 生产部署

### 1. 创建服务

在 Zeabur 中连接这个 GitHub 仓库，按仓库根目录的 `Dockerfile` 构建。

首轮只需要：

- `web`
- `postgresql`

暂时不要先接 `metabase`。

### 2. 挂载持久卷

给 `web` 服务挂载持久卷到 `/data`。

如果你要启用服务端 `Bottle 1.0`，还需要把模型目录上传到：

- `/data/asr-models/faster-distil-small.en`

`Bottle 2.0` 走 DashScope 云端接口，不需要本地模型目录。

### 3. 必填环境变量

生产环境至少要填写这些变量：

- `APP_ENV=production`
- `PORT=8080`
- `DATABASE_URL=postgresql://...`
- `DASHSCOPE_API_KEY=...`
- `JWT_SECRET=...`
- `ADMIN_EMAILS=admin1@example.com,admin2@example.com`
- `ADMIN_BOOTSTRAP_PASSWORD=一段长度足够、不可猜测的随机短语`
- `REDEEM_CODE_EXPORT_CONFIRM_TEXT=一段长度足够、不可猜测的随机短语`

建议同时保留：

- `AUTO_MIGRATE_ON_START=0`
- `AUTO_MIGRATE_CONTINUE_ON_FAILURE=1`
- `AUTO_MIGRATE_LOCK_TIMEOUT_SECONDS=180`
- `TMP_WORK_DIR=/tmp/zeabur3.3`
- `PERSISTENT_DATA_DIR=/data`
- `ASR_BUNDLE_ROOT_DIR=/data/asr-models`
- `FASTER_WHISPER_MODELSCOPE_MODEL_ID=Systran/faster-distil-whisper-small.en`
- `FASTER_WHISPER_MODEL_DIR=/data/asr-models/faster-distil-small.en`
- `FASTER_WHISPER_PREFETCH_ON_START=0`
- `FASTER_WHISPER_COMPUTE_TYPE=int8`
- `FASTER_WHISPER_CPU_THREADS=4`
- `MT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`
- `MT_MODEL=qwen-mt-flash`
- `ASR_SEGMENT_TARGET_SECONDS=300`
- `ASR_SEGMENT_SEARCH_WINDOW_SECONDS=45`

## 这次安全加固后的管理员模型

- 运行时管理员权限现在依赖数据库里的 `users.is_admin`
- `ADMIN_EMAILS` 只用于首次引导或补齐管理员，不再作为运行时鉴权依据
- 如果配置了 `ADMIN_EMAILS`，首次部署还必须同时配置强 `ADMIN_BOOTSTRAP_PASSWORD`
- 新用户注册默认不是管理员
- 生产环境下，如果 `REDEEM_CODE_EXPORT_CONFIRM_TEXT` 太弱，应用会拒绝启动危险导出能力

## 生产迁移

生产环境默认建议：

- `AUTO_MIGRATE_ON_START=0`
- 在本地或受控机器手动执行迁移
- 迁移完成后再回到 Zeabur 重启 `web`

固定使用：

```bash
python scripts/run_prod_migration.py
```

如果只想检查是否已经到最新 revision：

```bash
python scripts/run_prod_migration.py --check-only
```

脚本优先读取 `PROD_DATABASE_URL`，没有时才回退到 `DATABASE_URL`。

如果 `users.is_admin` 这类新列还没有迁移到位，`/health/ready` 会返回失败。

更多说明见 [migrations/README.md](./migrations/README.md)。

## 部署后怎么验收

按这个顺序检查：

### 1. 进程存活

```text
GET /health
```

预期：

- HTTP 200
- `ok=true`

### 2. 数据库与关键表结构就绪

```text
GET /health/ready
```

预期：

- HTTP 200
- `ok=true`

### 3. 核心业务链路

至少验证：

1. 注册或登录成功
2. `GET /api/wallet/me` 返回 `200`
3. `GET /api/admin/security/status` 返回 `200`
4. 上传一个媒体文件到 `POST /api/transcribe/file` 成功

## 常见排查

### `/health` 正常，但 `/health/ready` 返回 `503`

优先检查：

- `APP_ENV` 是否真的是 `production`
- `DATABASE_URL` 是否指向 PostgreSQL / MySQL，而不是 SQLite
- 是否已经执行了 Alembic 迁移
- `REDEEM_CODE_EXPORT_CONFIRM_TEXT` 是否仍然是弱默认值

### 没有管理员能进后台

优先检查：

- `ADMIN_EMAILS` 是否配置正确
- `ADMIN_BOOTSTRAP_PASSWORD` 是否存在且足够强
- 数据库是否已迁移到包含 `users.is_admin`

### 上传转写失败

优先检查：

- `DASHSCOPE_API_KEY` 是否正确
- 如果启用了 `Bottle 1.0`，`/data/asr-models/faster-distil-small.en` 是否完整
- 服务日志里的具体错误信息

## 本地开发

```powershell
cd D:\3.3-19.01
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
```

其中 `requirements.txt` 只用于 Zeabur 运行时镜像，`requirements-dev.txt` 额外补齐本地测试依赖。

本地 SQLite：

```powershell
$env:APP_ENV="development"
$env:PORT="8080"
$env:DATABASE_URL="sqlite:///./app.db"
$env:JWT_SECRET="change-me"
python -m alembic -c alembic.ini upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

本地 PostgreSQL：

```powershell
$env:APP_ENV="development"
$env:PORT="8080"
$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/app_test"
$env:JWT_SECRET="change-me"
python -m alembic -c alembic.ini upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

## Windows Electron 正式版客户端

桌面客户端现在采用“云端主系统 + 本地轻量助手”的正式版架构：

- Electron 窗口直接加载你配置的云端站点地址
- 账号、鉴权、课程、订单、管理后台等业务数据全部走现有 Zeabur `web`
- 本地 Python 进程只保留健康检查、模型目录、缓存目录、日志目录和本地资源接口
- Zeabur 侧仍然只有 `web` 和 `postgresql`，不新增独立 desktop 服务

### 1. Zeabur 边界不变

- Zeabur 继续只使用仓库根目录 `Dockerfile`
- 网站前端继续通过 `frontend` 构建后同步到 `app/static`
- `desktop-client/` 仍然通过 `.dockerignore` 排除在 Docker / Zeabur 构建上下文之外
- 不要把 Electron 打包脚本接到 Zeabur 构建命令里，也不要为客户端新建单独的 Zeabur 服务

### 2. 首次本地灰度测试

首次准备：

```powershell
cd D:\3.3-19.01
npm --prefix frontend install
npm --prefix frontend run build
npm --prefix frontend run build:app-static
npm --prefix desktop-client install
```

开发态如果要连接指定云端环境，可先写入目标地址：

```powershell
$env:DESKTOP_CLOUD_APP_URL="https://your-web.example.com"
$env:DESKTOP_CLOUD_API_BASE_URL="https://your-web.example.com"
```

然后启动桌面端：

```powershell
cd D:\3.3-19.01
npm --prefix desktop-client run dev
```

启动后 Electron 会在用户目录写出本地配置文件：

- 配置文件：`%APPDATA%\Bottle\desktop-runtime.json`
- 默认保存项：云端站点地址、云端 API 基址、模型目录、缓存目录、日志目录、临时目录
- 这些配置只作用于当前 Windows 客户端，不会写回仓库，也不会改动 Zeabur 环境变量

说明：

- 开发态如果机器上的 Python 3.11 不在默认路径，可先设置 `DESKTOP_PYTHON_EXECUTABLE`
- 本地助手不再创建 `app.db`，也不会自动迁移数据库
- 本地助手不再要求 `ADMIN_EMAILS`、`JWT_SECRET`、`DASHSCOPE_API_KEY` 这类服务端业务变量
- 灰度测试时，桌面端会连接你在配置文件里指定的 Zeabur `web` 域名，网站原有部署拓扑保持不变

### 3. 打包 Windows 客户端

正式打包前，先给安装版写入默认云端目标，并确保当前 Python 环境已经安装 `requirements-dev.txt`（其中包含 PyInstaller，用于生成自带的本地 helper 运行时）：

```powershell
cd D:\3.3-19.01
pip install -r requirements-dev.txt
$env:DESKTOP_CLOUD_APP_URL="https://your-web.example.com/app"
$env:DESKTOP_CLOUD_API_BASE_URL="https://your-web.example.com"
```

然后执行：

```powershell
cd D:\3.3-19.01
npm --prefix desktop-client run build
npm --prefix desktop-client run package:win
```

打包后的行为：

- 默认输出标准 Windows NSIS 安装向导到 `desktop-client/dist`，不再产出 portable 便携版
- 安装向导支持安装目录选择、桌面快捷方式、开始菜单入口，以及安装完成后立即启动
- 安装包会先生成并打入自带的本地 helper 运行时；终端用户安装后不需要再单独安装 Python 3.11
- 默认安装路径为当前用户的 `%LOCALAPPDATA%\Programs\Bottle`
- 安装后的客户端继续读取用户目录里的 `%APPDATA%\Bottle\desktop-runtime.json`，并直接使用打包时写入的云端站点地址打开登录页
- 安装器提供 `Bottle 1.0` 可选预装项，默认勾选：勾选时客户端会直接把安装目录下的 `resources\preinstalled-models\faster-distil-small.en` 识别为已预装；取消勾选时客户端仍可登录，并会显示该本机资源未预装、可后续准备

推荐正式版回归路径：

1. 在 Zeabur 维持现有 `web + postgresql` 不变
2. 在打包机上设置 `DESKTOP_CLOUD_APP_URL` 与 `DESKTOP_CLOUD_API_BASE_URL` 后运行 `npm --prefix desktop-client run package:win`
3. 运行安装器，保留或取消 `Bottle 1.0` 预装勾选项
4. 安装完成后直接启动客户端，验证登录、鉴权、上传转写、课程读写和后台访问都落到同一套 Zeabur `web`

### 4. Zeabur 侧只需要维护什么

正式发布时继续维护现有 `web` 服务环境变量与 PostgreSQL 即可，重点核对：

- `APP_ENV`
- `PORT`
- `DATABASE_URL`
- `DASHSCOPE_API_KEY`
- `JWT_SECRET`
- `ADMIN_EMAILS`
- `ADMIN_BOOTSTRAP_PASSWORD`
- `REDEEM_CODE_EXPORT_CONFIRM_TEXT`
- `AUTO_MIGRATE_ON_START`
- `AUTO_MIGRATE_CONTINUE_ON_FAILURE`
- `AUTO_MIGRATE_LOCK_TIMEOUT_SECONDS`
- `TMP_WORK_DIR`
- `PERSISTENT_DATA_DIR`
- `ASR_BUNDLE_ROOT_DIR`
- `FASTER_WHISPER_MODELSCOPE_MODEL_ID`
- `FASTER_WHISPER_MODEL_DIR`
- `FASTER_WHISPER_PREFETCH_ON_START`
- `FASTER_WHISPER_COMPUTE_TYPE`
- `FASTER_WHISPER_CPU_THREADS`
- `MT_BASE_URL`
- `MT_MODEL`
- `ASR_SEGMENT_TARGET_SECONDS`
- `ASR_SEGMENT_SEARCH_WINDOW_SECONDS`

不需要做的事：

- 不需要新建 Zeabur desktop 服务
- 不需要为客户端额外屏蔽 GitHub 自动部署
- 不需要把客户端域名、模型路径、日志路径写进 Zeabur 环境变量

### 5. 网站继续正常部署

网站部署流程不变：

- 正常提交网站代码
- 由 GitHub 触发 Zeabur 按根目录 `Dockerfile` 重新构建
- 客户端代码即使合并到仓库，只要不修改 Dockerfile 和 Zeabur 构建命令，就不会参与线上部署
## Windows Installer Addendum

This repository now ships the Windows desktop client as a standard `NSIS` installer wizard, not as a portable package.

Build steps:

```powershell
cd D:\3.3-19.01
pip install -r requirements-dev.txt
$env:DESKTOP_CLOUD_APP_URL="https://your-web.example.com/app"
$env:DESKTOP_CLOUD_API_BASE_URL="https://your-web.example.com"
npm --prefix desktop-client run build
npm --prefix desktop-client run package:win
```

Delivery contract:

- `npm --prefix desktop-client run package:win` produces an installer `.exe` in `desktop-client/dist`.
- The installer is an assisted `NSIS` flow with install directory selection, desktop shortcut, start menu entry, and run-after-finish.
- The installer bundles a frozen local helper runtime built with `PyInstaller`. End users do not need to install Python 3.11.
- Default per-user install path: `%LOCALAPPDATA%\Programs\Bottle`
- Default runtime config path: `%APPDATA%\Bottle\desktop-runtime.json`
- Default logs path: `%APPDATA%\Bottle\logs`
- Installer state file: `%LOCALAPPDATA%\Programs\Bottle\resources\desktop-install-state.json`
- Bundled `Bottle 1.0` payload path: `%LOCALAPPDATA%\Programs\Bottle\resources\preinstalled-models\faster-distil-small.en`
- If the `Bottle 1.0` checkbox stays enabled, the desktop client detects the bundled local model as ready on first launch.
- If the checkbox is cleared, install and login still work, and the desktop client shows that `Bottle 1.0` is not preinstalled and can be prepared later.
- Zeabur still keeps only the existing `web` and `postgresql` services. Do not create a separate desktop service.
