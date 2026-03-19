文档类型：任务
创建者：Codex
状态：已完成
完整任务目标：修复 faster-whisper-medium 在课程生成任务中长期停留在 asr_transcribe、进度显示卡在“识别中 13/139”且 overall_percent 长时间不变的问题；同时让约 5 分钟素材更早进入现有后端分段并行链路，并保持分段合并后的词句时间戳单调、不出现首尾漂移。
修改的文件清单（精确路径）：
- Docx/AI分工/修复fasterwhisper假卡死并提速_03月20日_01时41分.md
- app/services/faster_whisper_asr.py
- app/services/lesson_service.py
- tests/test_faster_whisper_asr.py
- tests/test_regression_api.py
关联衔接：无
风险：需要同时兼顾单文件 faster whisper 的持续心跳、CUDA 自动探测失败时的 CPU 回退，以及 5 分钟左右素材进入现有并行切段后的时间戳稳定，避免引入新的漂移或重复句子问题。
验证：
- `python -m py_compile app/services/faster_whisper_asr.py app/services/lesson_service.py tests/test_faster_whisper_asr.py tests/test_regression_api.py`
- `pytest tests/test_faster_whisper_asr.py -q`
- `pytest tests/test_regression_api.py -q tests/test_regression_api.py::test_health_endpoint tests/test_regression_api.py::test_faster_whisper_emits_waiting_progress_before_first_segment tests/test_regression_api.py::test_single_faster_whisper_progress_keeps_waiting_after_segments tests/test_regression_api.py::test_parallel_asr_trigger_by_duration tests/test_regression_api.py::test_faster_whisper_parallel_threshold_converges_to_five_minutes tests/test_regression_api.py::test_split_audio_segments_prefers_silence tests/test_regression_api.py::test_create_lesson_task_and_poll_success`
- `GET /health` 返回 `200`，响应为 `{\"ok\": true, \"service\": \"zeabur3.3-min-asr\", \"ready\": false}`
- 额外说明：`pytest tests/test_regression_api.py -q -k "faster_whisper or lesson_task or parallel_asr or split_audio_segments"` 命中一条存量失败 `test_create_local_asr_lesson_task`，报错为 `BILLING_RATE_NOT_FOUND`，链路是 `local-sensevoice-small` 计费项缺失，与本次 faster whisper 改动无关
清理记录：本次未删除任何任务/衔接文档；当前会话未创建可删除的“已消解衔接 md”，按规则保留。
结束时间：2026-03-20 01:49:19
