文档类型：任务
创建者：Codex
状态：已完成
完整任务目标：修复浏览器本地 SenseVoice 方案中 worker 直接 `importScripts` 外部 ModelScope 资源失败的问题；改为在 Docker 构建阶段拉取 sherpa-onnx SenseVoice 静态资产并由当前主应用同源提供，保留 `/api/lessons/tasks/local-asr`、`/api/transcribe/file` 契约不变，并验证均衡模式本地模型加载路径可用。
修改的文件清单（精确路径）：
- Docx/AI分工/修复本地SenseVoice同源代理加载_03月18日_00时37分.md
- Dockerfile
- frontend/src/features/upload/UploadPanel.jsx
- frontend/src/features/upload/LocalAsrPreviewCard.jsx
- frontend/src/features/upload/localAsrPreviewWorker.js
关联衔接：无
风险：Docker 构建阶段会额外下载约 240MB 的 SenseVoice 静态资产，首次构建时间和镜像体积会增加；运行时浏览器不再受 `importScripts` 跨域和 HTML 回页影响。
验证：
- 运行 `npm run build`，前端构建通过
- 运行 `pytest tests/test_regression_api.py -q -k local_asr`，1 项通过
清理记录：
- 删除 `Docx/AI分工/浏览器本地SenseVoice替换_03月17日_23时47分.md`：创建者为 Codex，状态为“已完成”，且无关联“待衔接”文档。
结束时间：2026-03-18 00:47:30
