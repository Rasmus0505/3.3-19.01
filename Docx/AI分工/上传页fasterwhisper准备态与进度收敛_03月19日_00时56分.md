文档类型：任务
创建者：Codex
状态：已完成
完整任务目标：按已确认方案收敛 `/upload` 页模型区与任务进度展示：删除选中 `Faster Whisper Medium` 后出现的二级服务端说明卡，改为模型卡内联显示准备状态与按钮；为 `faster-whisper-medium` 补服务端状态查询与显式准备接口；让识别阶段显示流动计数，不再出现 `1/1` 这类兜底进度。
修改的文件清单（精确路径）：
- Docx/AI分工/上传页fasterwhisper准备态与进度收敛_03月19日_00时56分.md
- frontend/src/features/upload/UploadPanel.jsx
- app/static/index.html
- app/static/assets/*
- app/services/faster_whisper_asr.py
- app/services/lesson_service.py
- app/api/routers/asr_models.py
- app/api/routers/__init__.py
- app/main.py
- app/schemas/common.py
- app/schemas/__init__.py
- tests/test_faster_whisper_asr.py
关联衔接：无
风险：
- `UploadPanel.jsx` 近期已多轮迭代，改成卡片内联后需要避免影响本地 SenseVoice 的准备、上传恢复、停止生成和成功态。
- `faster-whisper-medium` 现有是启动时预拉取+首次调用自动下载，本次新增手动准备接口时不能破坏原有兜底下载行为。
- 识别进度从时间等待态改成分段计数后，需要确保非并行链路也能稳定给出真实计数或安全降级为纯文案。
验证：
- 已运行 `python -m py_compile app\api\routers\asr_models.py app\main.py app\services\faster_whisper_asr.py app\services\lesson_service.py app\schemas\common.py app\schemas\__init__.py` 通过
- 已运行 `pytest tests/test_faster_whisper_asr.py -q`，5 项通过
- 已运行 `pytest tests/test_regression_api.py -q -k "health_endpoint or transcribe_file_endpoint_with_stubbed_service or create_lesson_task_and_poll_success"`，3 项通过
- 已运行 `frontend\npm.cmd run build:app-static` 通过，前端已重新构建并同步到 `app/static`
清理记录：
- 未删除历史任务/衔接文档：本次未获得文件删除确认，按规则保留
结束时间：2026-03-19 01:12:44
