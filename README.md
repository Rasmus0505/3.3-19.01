# English Sentence Spelling Trainer (Zeabur MVP)

本项目是 Zeabur 托管部署的英语句级拼写练习 MVP：

1. 上传音视频素材  
2. 自动 ASR（带时间戳）+ 逐句翻译中文  
3. 句级播放 + 逐词拼写检查（严格+轻微容错）  
4. 登录后同步学习进度（Postgres）

## 技术栈

- Backend: FastAPI + SQLAlchemy
- Frontend: React + Tailwind + shadcn-style components
- ASR: DashScope (`paraformer-v2` / `qwen3-asr-flash-filetrans`)
- MT: Qwen-MT (`qwen-mt-plus`, OpenAI-compatible)
- Storage: Postgres + 本地文件（课程音频片段）

## 主要接口

- 认证
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`
- 课程
  - `POST /api/lessons` (form-data: `video_file`, `asr_model`)
  - `GET /api/lessons`
  - `GET /api/lessons/{lesson_id}`
- 练习
  - `POST /api/lessons/{lesson_id}/check`
  - `POST /api/lessons/{lesson_id}/progress`
  - `GET /api/lessons/{lesson_id}/progress`
  - `GET /api/lessons/{lesson_id}/sentences/{idx}/audio`
- 保留原能力
  - `POST /api/transcribe/file`
  - `GET /health`

## 必要环境变量

- `DASHSCOPE_API_KEY` (必填)
- `DATABASE_URL` (建议 Zeabur Postgres 连接串)
- `JWT_SECRET` (必填，生产必须替换)
- `TMP_WORK_DIR` (可选，默认 `/tmp/zeabur3.3`)
- `MT_BASE_URL` (可选，默认北京: `https://dashscope.aliyuncs.com/compatible-mode/v1`)
- `MT_MODEL` (可选，默认 `qwen-mt-plus`)

## 本地开发

```powershell
cd D:\GITHUB\英语产品\3.3-19.01
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

后端：

```powershell
$env:DASHSCOPE_API_KEY="sk-xxx"
$env:DATABASE_URL="sqlite:///./app.db"
$env:JWT_SECRET="change-me"
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

前端：

```powershell
cd frontend
npm ci
npm run dev
```

## Zeabur 部署

1. 连接 GitHub 仓库，使用 Docker 部署（已配置多阶段构建）
2. 新增 Postgres 服务，并把连接串写入 `DATABASE_URL`
3. 配置 `DASHSCOPE_API_KEY` 与 `JWT_SECRET`
4. 健康检查路径使用 `/health`

## 说明

- 切句逻辑直接使用 ASR 返回 `sentences`，避免时间戳错位。
- 翻译失败不阻断课程生成；失败句翻译为空字符串。
- 请求结束后会清理临时目录。
