文档类型：任务
创建者：Codex
状态：已完成
完整任务目标：修复浏览器本地 SenseVoice 方案在已部署站点中因 `/static/local-asr-assets/*` 缺失导致 worker `importScripts` 404 的问题；改为由主应用在运行时通过同源 `/api/local-asr-assets/*` 路由自动拉取并缓存 sherpa-onnx SenseVoice 资产，保留 `/api/lessons/tasks/local-asr` 与 `/api/transcribe/file` 契约不变。
修改的文件清单（精确路径）：
- Docx/AI分工/修复本地SenseVoice运行时缓存加载_03月18日_00时57分.md
- Dockerfile
- app/api/routers/local_asr_assets.py
- app/api/routers/__init__.py
- app/main.py
- frontend/src/features/upload/UploadPanel.jsx
- frontend/src/features/upload/LocalAsrPreviewCard.jsx
- frontend/src/features/upload/localAsrPreviewWorker.js
- tests/test_regression_api.py
关联衔接：无
风险：首次下载本地模型时，服务端需要在线拉取约 240MB 的 `.data` 资源，首个用户等待时间会变长；但后续同容器命中缓存后不再重复下载。容器重建后需要重新缓存一次。
验证：
- 运行 `python -m py_compile app/api/routers/local_asr_assets.py app/main.py tests/test_regression_api.py` 通过
- 运行 `npm run build`，前端构建通过
- 运行 `pytest tests/test_regression_api.py -q -k "local_asr or local_asr_asset_route"`，2 项通过
- 线上探测 `https://351636.preview.aliyun-zeabur.cn/static/local-asr-assets/sherpa-onnx-asr.js` 返回 `404 Not Found`，已据此确认旧静态打包方案在当前部署中失效
清理记录：
- 删除 `Docx/AI分工/修复本地SenseVoice同源代理加载_03月18日_00时37分.md`：创建者为 Codex，状态为“已完成”，且无关联“待衔接”文档。
- 删除 `Docx/AI分工/修复管理端计费整数校验提示_03月18日_00时39分.md`：创建者为 Codex，状态为“已完成”，且无关联“待衔接”文档。
结束时间：2026-03-18 00:57:30
