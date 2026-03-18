文档类型：任务
创建者：Codex
状态：已完成
完整任务目标：彻底移除学习页侧边栏中的独立模型下载页面与现有 Whisper 运行逻辑，使上传素材页当前只保留 SenseVoice 作为可运行 ASR；同时在上传素材页补充 ModelScope Whisper 模型的手动下载说明、建议目录与后续接入前置说明。
修改的文件清单（精确路径）：
- Docx/AI分工/移除独立Whisper页并收敛上传ASR_03月18日_22时41分.md
- .gitignore
- .env.example
- README.md
- app/api/routers/__init__.py
- app/api/routers/local_whisper_assets.py
- app/api/routers/local_whisper_browser_assets.py
- app/api/serializers.py
- app/core/config.py
- app/main.py
- app/static/index.html
- frontend/package-lock.json
- frontend/package.json
- frontend/src/app/learning-shell/LearningShellSidebar.jsx
- frontend/src/app/learning-shell/LearningShellPanelContent.jsx
- frontend/src/app/bootstrap.jsx
- frontend/src/features/upload/UploadPanel.jsx
- frontend/src/features/models/WhisperDownloadPanel.jsx
- frontend/src/features/upload/localWhisperRuntime.js
- frontend/src/shared/media/localWhisperModelManager.js
- tests/test_local_whisper_assets.py
- ops/zeabur-minimal-deploy.md
- zeabur-template.yaml
关联衔接：无
风险：
- 上传页近期已被多次修改，需避免把已有 SenseVoice 下载、目录绑定、进度条逻辑带坏。
- 移除 Whisper 路由后，要同步清理前端入口与文档，否则会留下死链接或失效环境变量。
- 本次只补 Whisper 手动下载说明，不直接恢复 Whisper 识别接入，避免出现“页面可选但不可跑”的假状态。
验证：
- `npm.cmd run build:app-static` 通过，前端已重新构建并同步到 `app/static`
- `python -m py_compile app\main.py app\core\config.py app\api\serializers.py app\api\routers\__init__.py` 通过
- `pytest tests\test_spa_route_fallback.py -q` 通过（3 项）
- `pytest tests\test_regression_api.py -q` 失败，现有失败集中在迁移版本断言、旧账单 schema 兼容、SenseVoice/funasr 依赖与并发 ASR 旧断言，不是本次 Whisper 删除直接引入
- `pytest tests\test_regression_api.py -q -k "spa_shell_pages_disable_html_cache_and_expose_build_marker or transcribe_audio_requires_dashscope_api_key or transcribe_audio_file_polls_until_success"` 中，`spa_shell_pages_disable_html_cache_and_expose_build_marker` 通过；另外 2 项仍因现有 SenseVoice/funasr 与默认模型断言失败
清理记录：
- 未删除历史任务/衔接文档：未获得额外文档删除确认，按规则保留
结束时间：2026-03-18 23:03:55
