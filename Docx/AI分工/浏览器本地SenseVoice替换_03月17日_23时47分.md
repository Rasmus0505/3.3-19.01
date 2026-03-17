文档类型：任务
创建者：Codex
状态：已完成
完整任务目标：将当前“均衡模式”的本地 Whisper 下载与识别替换为浏览器端 sherpa-onnx + SenseVoice 方案，继续由用户设备本地下载和本地推理；保留 `/api/lessons/tasks/local-asr` 与 `/api/transcribe/file` 现有契约，支持从官方可访问外部来源下载模型资产，并补充必要回归验证。
修改的文件清单（精确路径）：
- Docx/AI分工/浏览器本地SenseVoice替换_03月17日_23时47分.md
- frontend/src/features/upload/UploadPanel.jsx
- frontend/src/features/upload/LocalAsrPreviewCard.jsx
- frontend/src/features/upload/localAsrPreviewWorker.js
- app/services/billing.py
- app/api/serializers.py
- tests/test_regression_api.py
关联衔接：无
风险：官方外部模型站可达性与跨域策略仍可能影响部分设备的首次下载成功率；本次通过切换到官方 ModelScope 预编译资产降低风险，但不额外引入自建存储兜底。
验证：
- 运行 `npm run build`，前端构建通过
- 运行 `pytest tests/test_regression_api.py -q -k local_asr`，1 项通过
- 运行 `python -m py_compile app/services/billing.py app/api/serializers.py tests/test_regression_api.py` 通过
清理记录：
- 删除 `Docx/AI分工/修复Alembic迁移参数兼容问题_03月17日_22时16分.md`：创建者为 Codex，状态为“已完成”，且无关联“待衔接”文档。
- 删除 `Docx/AI分工/修复后台管理接口500兼容旧库结构_03月17日_22时25分.md`：创建者为 Codex，状态为“已完成”，且无关联“待衔接”文档。
结束时间：2026-03-18 00:28:30
