# Model Recovery Deploy Checklist

## 目标

恢复线上三个 ASR 模型的可用性：

- `qwen3-asr-flash-filetrans` / `Qwen ASR Flash`
- `faster-whisper-medium` / `bottle.1.0`
- `sensevoice-small` / `bottle0.1`

## 本次已确认的问题

### 1. Qwen ASR Flash

- 线上真实报错：`403 AccessDenied`
- 关键原因：DashScope API key 被权限策略拦截
- 结论：这是部署配置问题，不是前端问题

### 2. bottle.1.0

- 线上真实报错：`ASR_SENTENCE_MISSING`
- 原始调试数据：`preview_text=""`、`words=[]`、`sentences=[]`
- 关键原因：极短音频首轮被 VAD 过滤为空
- 结论：代码已修，需要重新部署才能生效

### 3. bottle0.1

- 线上真实报错：`funasr import failed: No module named 'torch'`
- 关键原因：线上运行环境缺少 `torch`
- 结论：依赖已补到 `requirements.txt`，需要重新部署才能生效

## 已落地的代码修复

- `app/services/faster_whisper_asr.py`
  - `faster-whisper` 首轮空结果时自动关闭 VAD 重试一次
- `app/infra/asr_dashscope.py`
  - 修复 Qwen 链路乱码错误文案
- `requirements.txt`
  - 增加 `torch==2.10.0`

## 部署前确认

### 1. 确认线上是怎么部署的

优先使用仓库 Dockerfile 直接构建。

如果你当前服务仍然使用预构建镜像：

- `ghcr.io/rasmus0505/3.3-19.01:latest`

那么这次仓库代码修改不会自动生效，你必须满足下面二选一：

- 改成 Zeabur 直接从仓库 Dockerfile 构建
- 或重新构建并推送新的镜像，再让 Zeabur 拉取新镜像

### 2. 确认持久卷

`web` 服务必须挂载持久卷到：

- `/data`

本地模型目录必须存在：

- `/data/asr-models/SenseVoiceSmall`
- `/data/asr-models/faster-distil-small.en`

### 3. 确认环境变量

至少核对这些变量：

- `APP_ENV=production`
- `DATABASE_URL=...`
- `DASHSCOPE_API_KEY=...`
- `JWT_SECRET=...`
- `AUTO_MIGRATE_ON_START=0`
- `PERSISTENT_DATA_DIR=/data`
- `ASR_BUNDLE_ROOT_DIR=/data/asr-models`
- `SENSEVOICE_MODEL_DIR=/data/asr-models/SenseVoiceSmall`
- `FASTER_WHISPER_MODEL_DIR=/data/asr-models/faster-distil-small.en`
- `FASTER_WHISPER_PREFETCH_ON_START=0`
- `FASTER_WHISPER_COMPUTE_TYPE=int8`
- `FASTER_WHISPER_CPU_THREADS=4`

## 三个模型各自需要的恢复条件

### Qwen ASR Flash

必须更换为一个真正可用、没有 file transcription 权限限制的 DashScope key。

最低验收标准：

- 创建 ASR 任务不再返回 `403 AccessDenied`
- 页面错误不再显示 `ASR_TASK_CREATE_FAILED`

### bottle.1.0

重新部署后，让最新的 `faster_whisper_asr.py` 生效。

最低验收标准：

- 对 1 秒测试音频不再直接返回空 `sentences`
- 若首轮 VAD 为空，服务端会自动无 VAD 重试

### bottle0.1

重新部署后，让 `pip install -r requirements.txt` 安装新的 `torch==2.10.0`。

最低验收标准：

- 不再出现 `No module named 'torch'`
- `sensevoice-small` 状态从 runtime error 变为 ready

## 推荐部署顺序

1. 确认 Zeabur 使用的是仓库 Dockerfile 构建，而不是旧镜像
2. 重新部署 `web`
3. 确认新容器安装了 `torch`
4. 确认 `/data/asr-models/...` 两套模型目录还在
5. 替换 `DASHSCOPE_API_KEY`
6. 重启 `web`
7. 再跑三模型实测

## 部署后验收

按下面顺序检查：

1. `GET /health`
2. `GET /health/ready`
3. 登录上传页，测试 `tmp_upload_test.wav`
4. 依次测试：
   - `Qwen ASR Flash`
   - `bottle.1.0`
   - `bottle0.1`

验收目标：

- 至少 `bottle.1.0` 和 `bottle0.1` 不再出现这次的旧错误
- `Qwen ASR Flash` 不再返回 403

## 我这边已经完成的本地验证

- `pytest tests/test_regression_api.py -k 'asr_dashscope or faster_whisper_emits_waiting_progress_before_first_segment or faster_whisper_retries_without_vad_when_first_pass_is_empty or single_faster_whisper_progress_keeps_waiting_after_segments or single_faster_whisper_stall_keeps_waiting_instead_of_failing or asr_model_status_reports_sensevoice_runtime_import_failure'`
- 结果：`5 passed`

- `frontend/npm run build`
- 结果：通过
