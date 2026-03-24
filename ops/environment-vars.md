# 环境变量清单

本文档记录项目使用的所有环境变量，按用途与必需程度分组。

---

## 必需变量（生产环境）

| 变量名 | 用途 | 类型 | 默认值 | 必需 |
|--------|------|------|--------|------|
| DATABASE_URL | PostgreSQL 连接串 | str | — | 是（生产） |
| DASHSCOPE_API_KEY | DashScope API 密钥（ASR/MT） | str | — | 是（使用 ASR/MT 时） |
| JWT_SECRET | JWT 签名密钥 | str | dev-only-change-me | 是（生产必须改） |

---

## 必需变量（开发环境）

| 变量名 | 用途 | 类型 | 默认值 | 必需 |
|--------|------|------|--------|------|
| DATABASE_URL | 数据库连接串，可省略用 SQLite | str | sqlite:///./app.db | 否 |
| DASHSCOPE_API_KEY | DashScope 密钥，本地 ASR 时可空 | str | "" | 否 |
| JWT_SECRET | JWT 密钥 | str | dev-only-change-me | 否 |

---

## 可选变量（应用配置）

| 变量名 | 用途 | 类型 | 默认值 | 必需 |
|--------|------|------|--------|------|
| APP_ENV | 运行环境（development/test/prod/production） | str | development | 否 |
| ENVIRONMENT | 同 APP_ENV（备选） | str | — | 否 |
| RUN_ENV | 同 APP_ENV（备选） | str | — | 否 |
| NODE_ENV | 同 APP_ENV（备选） | str | — | 否 |
| APP_TIMEZONE | 应用时区 | str | Asia/Shanghai | 否 |
| PORT | 服务监听端口 | str | 8080 | 否 |
| ALEMBIC_CONFIG | Alembic 配置文件路径 | str | alembic.ini | 否 |

---

## 可选变量（JWT 与认证）

| 变量名 | 用途 | 类型 | 默认值 | 必需 |
|--------|------|------|--------|------|
| ACCESS_TOKEN_EXPIRE_MINUTES | Access Token 过期时间（分钟） | int | 120 | 否 |
| REFRESH_TOKEN_EXPIRE_DAYS | Refresh Token 过期天数 | int | 15 | 否 |

---

## 可选变量（管理后台）

| 变量名 | 用途 | 类型 | 默认值 | 必需 |
|--------|------|------|--------|------|
| ADMIN_BOOTSTRAP_PASSWORD | 首次启动管理员引导密码 | str | "" | 否 |
| ADMIN_EMAILS | 管理员邮箱白名单，逗号分隔 | str | "" | 否 |

---

## 可选变量（ASR 与课程）

| 变量名 | 用途 | 类型 | 默认值 | 必需 |
|--------|------|------|--------|------|
| LESSON_DEFAULT_ASR_MODEL | 默认 ASR 模型 | str | qwen3-asr-flash-filetrans | 否 |
| QWEN_ASR_ENABLED | 是否启用 Qwen ASR | bool | 1 | 否 |
| ASR_SEGMENT_TARGET_SECONDS | ASR 分段时间目标（秒） | int | 300 | 否 |
| ASR_SEGMENT_SEARCH_WINDOW_SECONDS | ASR 分段搜索窗口（秒） | int | 45 | 否 |
| ASR_TASK_POLL_SECONDS | ASR 任务轮询间隔（秒） | int | 2 | 否 |
| LESSON_TASK_MAX_ACTIVE | 课程最大并发任务数 | int | 4 | 否 |
| LESSON_TASK_MAX_QUEUED | 课程最大排队任务数 | int | 8 | 否 |

---

## 可选变量（Faster-Whisper）

| 变量名 | 用途 | 类型 | 默认值 | 必需 |
|--------|------|------|--------|------|
| ASR_BUNDLE_ROOT_DIR | ASR 模型捆绑根目录 | path | ./asr-test/models | 否 |
| FASTER_WHISPER_MODEL_DIR | Faster-Whisper 模型目录 | path | 见下方 | 否 |
| FASTER_WHISPER_MODELSCOPE_MODEL_ID | ModelScope 模型 ID | str | Systran/faster-distil-whisper-small.en | 否 |
| FASTER_WHISPER_PREFETCH_ON_START | 启动时预加载模型 | bool | false | 否 |
| FASTER_WHISPER_COMPUTE_TYPE | 计算类型 | str | int8 | 否 |
| FASTER_WHISPER_CPU_THREADS | CPU 线程数 | int | 4 | 否 |

---

## 可选变量（机器翻译 MT）

| 变量名 | 用途 | 类型 | 默认值 | 必需 |
|--------|------|------|--------|------|
| MT_BASE_URL | MT API 基地址 | str | https://dashscope.aliyuncs.com/compatible-mode/v1 | 否 |
| MT_MODEL | MT 模型名 | str | qwen-mt-flash | 否 |
| MT_TIMEOUT_SECONDS | MT 请求超时（秒） | int | 20 | 否 |
| MT_BATCH_MAX_CHARS | MT 单批最大字符数 | int | 2600 | 否 |
| MT_MIN_REQUEST_INTERVAL_MS | MT 最小请求间隔（毫秒） | int | 600 | 否 |
| MT_RETRY_MAX_ATTEMPTS | MT 重试最大次数 | int | 4 | 否 |

---

## 可选变量（兑换码）

| 变量名 | 用途 | 类型 | 默认值 | 必需 |
|--------|------|------|--------|------|
| REDEEM_CODE_EXPORT_CONFIRM_TEXT | 导出兑换码确认短语 | str | EXPORT | 否 |
| REDEEM_CODE_DEFAULT_VALID_DAYS | 兑换码默认有效天数 | int | 30 | 否 |
| REDEEM_CODE_DEFAULT_DAILY_LIMIT | 兑换码默认每日使用上限 | int | 5 | 否 |

---

## 可选变量（存储与工作目录）

| 变量名 | 用途 | 类型 | 默认值 | 必需 |
|--------|------|------|--------|------|
| TMP_WORK_DIR | 临时工作目录根 | path | /tmp/zeabur3.3 | 否 |
| PERSISTENT_DATA_DIR | 持久化数据目录 | path | /data（Linux）/ temp（Windows） | 否 |

---

## 可选变量（部署与启动）

| 变量名 | 用途 | 类型 | 默认值 | 必需 |
|--------|------|------|--------|------|
| AUTO_MIGRATE_ON_START | 启动时自动迁移数据库 | bool | 1 | 否 |

---

## 桌面/离线环境变量

| 变量名 | 用途 | 类型 | 默认值 | 必需 |
|--------|------|------|--------|------|
| DESKTOP_PREINSTALLED_MODEL_DIR | 预装 ASR 模型目录 | path | "" | 否 |
| DESKTOP_BUNDLED_MODEL_DIR | 捆绑 ASR 模型目录 | path | "" | 否 |
| DESKTOP_INSTALL_STATE_PATH | 安装状态文件路径 | path | "" | 否 |
| DESKTOP_FFMPEG_BIN_DIR | FFmpeg 可执行目录 | path | "" | 否 |
| DESKTOP_YTDLP_PATH | yt-dlp 可执行路径 | path | "" | 否 |

---

## 开发环境变量

- `PYTEST_CURRENT_TEST`：pytest 运行时自动设置，用于识别测试环境
- 开发时可省略 `DATABASE_URL`，使用 `sqlite:///./app.db`
- 开发时可省略 `DASHSCOPE_API_KEY`，仅在使用云端 ASR/MT 时需要

---

## 生产环境变量

生产环境必须配置：

1. **DATABASE_URL**：必须指向 PostgreSQL，不能使用 SQLite
2. **JWT_SECRET**：必须改为强随机密钥
3. **DASHSCOPE_API_KEY**：使用 DashScope ASR/MT 时必需
4. **APP_ENV** 或 **ENVIRONMENT**：建议设为 `prod` 或 `production`
