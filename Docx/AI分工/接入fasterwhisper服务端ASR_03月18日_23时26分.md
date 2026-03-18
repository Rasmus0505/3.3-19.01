文档类型：任务
创建者：Codex
状态：已完成
完整任务目标：把 `pengzhendong/faster-whisper-medium` 作为服务端 ASR 接入当前项目，使上传页高速模式可选用该模型；在 Zeabur 首次部署后自动将模型下载到持久目录 `/data/modelscope_whisper/faster-whisper-medium`，从而做到推送 GitHub 后重部署即可使用。
修改的文件清单（精确路径）：
- Docx/AI分工/接入fasterwhisper服务端ASR_03月18日_23时26分.md
- app/core/config.py
- app/main.py
- app/infra/asr_dashscope.py
- app/services/faster_whisper_asr.py
- app/services/billing.py
- app/api/serializers.py
- app/static/index.html
- frontend/src/features/upload/UploadPanel.jsx
- requirements.txt
- README.md
- .env.example
- ops/zeabur-minimal-deploy.md
- zeabur-template.yaml
- tests/test_faster_whisper_asr.py
关联衔接：无
风险：
- `faster-whisper-medium` 体积约 1.4GB，Zeabur 首次部署会有明显下载耗时。
- CPU 容器上推理速度与内存占用需控制，需优先使用适合 CPU 的 `compute_type`。
- 上传页当前只有“均衡/高速”两档，新增高速模型选择时要避免影响现有 SenseVoice 本地流程。
验证：
- `pytest tests/test_faster_whisper_asr.py -q` 通过（3 项）
- `python -m py_compile app\core\config.py app\main.py app\infra\asr_dashscope.py app\services\faster_whisper_asr.py app\services\billing.py app\api\serializers.py` 通过
- `npm.cmd run build:app-static` 通过，前端已重新构建并同步到 `app/static`
- `python - <<...>>` smoke test 通过，已能成功实例化 `WhisperModel` 并读取 `D:\3.3-19.01\modelscope_whisper\faster-whisper-medium`
- `pytest tests/test_spa_route_fallback.py -q` 通过（3 项）
清理记录：
- 未删除历史任务/衔接文档：未获得额外文档删除确认，按规则保留
结束时间：2026-03-19 00:21:39
