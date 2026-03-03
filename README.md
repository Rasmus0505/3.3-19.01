# Zeabur3.3 Minimal ASR (File Only)

最小跑通项目：`FastAPI + 上传页面 + DashScope ASR`。  
本版本仅保留一条链路：上传本地视频/音频文件转写（支持模型切换）。

## 功能

- `GET /health` 健康检查
- `POST /api/transcribe/file` 上传本地文件转写（`model` 可选：`qwen3-asr-flash-filetrans` / `paraformer-v2`）
- `GET /` 极简网页测试入口

核心链路：

1. 接收上传文件
2. `ffmpeg` 提取音轨并转 `16k/mono/opus (libopus)`
3. `DashScope Files.upload`
4. `Files.get` 拿签名 URL
5. 根据模型调用：
   - `qwen3-asr-flash-filetrans` -> `QwenTranscription.async_call + wait`
   - `paraformer-v2` -> `Transcription.async_call + wait`（开启 `timestamp_alignment_enabled=true`）
6. 下载 `transcription_url` 并返回 `preview_text + asr_result_json`

为什么使用 Opus 预处理：

- 音频体积更小，上传到 DashScope 更快
- 在同等带宽下吞吐更高，整体转写等待时间更短
- 保留语音识别所需的单声道和 16k 采样率

## 本地运行

```powershell
cd D:\GITHUB\英语产品\3.3-19.01
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

确保本机已安装并可执行：

- `ffmpeg -version`

配置环境变量：

```powershell
$env:DASHSCOPE_API_KEY="你的key"
```

启动：

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

访问：`http://localhost:8000`

## Zeabur 部署

1. 连接仓库并使用 Docker 部署（自动识别 `Dockerfile`）。
2. 设置环境变量：
   - `DASHSCOPE_API_KEY`（必填）
   - `PYTHONUNBUFFERED=1`（建议）
   - `TMP_WORK_DIR=/tmp/zeabur3.3`（可选）
3. 健康检查路径：`/health`

## 约束

- 上传大小限制：200MB
- 单次同步请求超时：480 秒
- 不做历史存储与鉴权（仅最小验证）
- 请求结束后临时文件立即删除
