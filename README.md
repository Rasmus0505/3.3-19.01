# Zeabur3.3 Minimal ASR

最小跑通项目：`FastAPI + 上传页面 + qwen3-asr-flash-filetrans`。

## 功能

- `GET /health` 健康检查
- `POST /api/transcribe/file` 上传本地文件转写
- `POST /api/transcribe/bilibili` 输入 B 站公开链接转写
- `GET /` 极简网页测试入口

核心链路：

1. 音频准备（本地上传或 B 站下载后转 wav）
2. `DashScope Files.upload`
3. `Files.get` 拿签名 URL
4. `QwenTranscription.async_call + wait`
5. 下载 `transcription_url` 并返回文本预览

## 目录

```text
zeabur3.3/
  app/
    main.py
    schemas.py
    services/
      media.py
      asr_dashscope.py
    static/
      index.html
  requirements.txt
  Dockerfile
  .dockerignore
  .env.example
```

## 本地运行

### 1) 安装依赖

```powershell
cd D:\GITHUB\英语产品\zeabur3.3
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

确保本机已安装并可执行：

- `ffmpeg -version`
- `yt-dlp --version`

### 2) 配置环境变量

```powershell
$env:DASHSCOPE_API_KEY="你的key"
```

### 3) 启动

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

访问：`http://localhost:8000`

## Zeabur 部署

1. 新建项目并连接仓库。
2. 服务类型选择 Docker（自动识别 `Dockerfile`）。
3. 设置环境变量：
   - `DASHSCOPE_API_KEY`（必填）
   - `PYTHONUNBUFFERED=1`（建议）
4. 健康检查路径：`/health`
5. 部署完成后打开分配域名，访问 `/` 测试上传。

## API 示例

### `GET /health`

```json
{ "ok": true, "service": "zeabur3.3-min-asr" }
```

### `POST /api/transcribe/bilibili`

请求：

```json
{ "url": "https://www.bilibili.com/video/BV1yP4y1n7tB" }
```

成功响应示例：

```json
{
  "ok": true,
  "source_type": "bilibili",
  "model": "qwen3-asr-flash-filetrans",
  "task_id": "xxxx",
  "task_status": "SUCCEEDED",
  "transcription_url": "http://...",
  "preview_text": "...",
  "elapsed_ms": 12345
}
```

失败响应示例：

```json
{
  "ok": false,
  "error_code": "BILIBILI_DOWNLOAD_FAILED",
  "message": "B站音频下载失败",
  "detail": "..."
}
```

## 约束

- 上传大小限制：200MB
- 单次同步请求超时：480 秒
- 不做历史存储与鉴权（仅最小验证）
- 请求结束后临时文件立即删除

