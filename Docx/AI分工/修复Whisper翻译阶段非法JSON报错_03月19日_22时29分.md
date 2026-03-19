文档类型：任务
创建者：Codex
状态：已完成
完整任务目标：修复 `faster-whisper-medium` 在课程生成翻译阶段因翻译响应包含非法控制字符而直接报 `INTERNAL_ERROR: 课程生成失败` 的问题；保持 Whisper 原句策略与严格失败语义不变，在后端明确暴露翻译解析错误，并在上传页直接展示失败阶段与精简摘要，便于用户定位问题。
修改的文件清单（精确路径）：
- app/infra/translation_qwen_mt.py
- app/services/lesson_command_service.py
- frontend/src/features/upload/UploadPanel.jsx
- app/static/index.html
- app/static/assets/AdminPage-CGrACkuf.js
- app/static/assets/ImmersiveLessonPage-sq67NpSb.js
- app/static/assets/LearningPage-CQxmj_j4.js
- app/static/assets/LearningShell-Do7p92PY.js
- app/static/assets/LessonList-DnN9E7ib.js
- app/static/assets/MediaCover-QghzLb1y.js
- app/static/assets/RedeemCodePanel-DHCT7vx1.js
- app/static/assets/UploadPanel-DajLrYdy.js
- app/static/assets/index-v8aDi1jD.js
- tests/test_translation_qwen_mt.py
- tests/test_regression_api.py
关联衔接：无
风险：
- 翻译解析错误分类改动会影响现有批量翻译失败分支，需避免误伤正常输出与既有重试逻辑。
- 上传页错误卡已叠加暂停/恢复/重试逻辑，新增摘要展示时要避免覆盖现有按钮行为。
验证：
- `pytest tests/test_translation_qwen_mt.py -q`
- `pytest tests/test_regression_api.py -q -k "translation or lesson_task"`
- `cd frontend && npm run build:app-static`
- 手动检查上传页错误态文案是否能显示失败阶段与摘要
清理记录：未删除任务/衔接文档；`build:app-static` 自动切换了旧的 `app/static/assets/*` 构建产物为当前最新产物。
结束时间：2026-03-19 22:38:36
