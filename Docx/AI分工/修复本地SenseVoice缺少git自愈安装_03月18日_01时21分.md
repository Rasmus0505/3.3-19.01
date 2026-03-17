文档类型：任务
创建者：Codex
状态：已完成
完整任务目标：修复浏览器本地 SenseVoice 运行时缓存加载中由于 Zeabur 当前运行镜像缺少 `git` 导致 `/api/local-asr-assets/*` 返回 502 的问题；改为后端在首次请求时自动检测并安装 `git/git-lfs`，再继续缓存拉取 sherpa-onnx 资产，保持 `/api/lessons/tasks/local-asr` 与 `/api/transcribe/file` 契约不变。
修改的文件清单（精确路径）：
- Docx/AI分工/修复本地SenseVoice缺少git自愈安装_03月18日_01时21分.md
- app/api/routers/local_asr_assets.py
- tests/test_regression_api.py
关联衔接：无
风险：首次请求时如果容器需要运行 `apt-get update && apt-get install git git-lfs`，等待时间会进一步增加；若运行环境无 root 权限或屏蔽 apt 源，仍会失败，但错误信息会更明确。
验证：
- 运行 `python -m py_compile app/api/routers/local_asr_assets.py tests/test_regression_api.py` 通过
- 运行 `pytest tests/test_regression_api.py -q -k "local_asr or local_asr_asset_route or installs_git_when_missing"`，3 项通过
- 线上探测 `https://351636.preview.aliyun-zeabur.cn/api/local-asr-assets/sherpa-onnx-asr.js` 返回 `502`，明确错误为 `LOCAL_ASR_ASSET_FETCH_FAILED: [Errno 2] No such file or directory: 'git'`
清理记录：
- 删除 `Docx/AI分工/修复本地SenseVoice运行时缓存加载_03月18日_00时57分.md`：创建者为 Codex，状态为“已完成”，且无关联“待衔接”文档。
结束时间：2026-03-18 01:29:39
