文档类型：任务
创建者：Codex
状态：已完成
完整任务目标：
- 用 VideoLingo 风格替换当前英文分句链路（不启用语义切句），将长音频硬切段改为静音优先切段，并基于词级时间统一做规则分句。
修改的文件清单（精确路径）：
- Docx/AI分工/VideoLingo英文分句替换_03月07日_14时27分.md
- app/core/config.py
- app/services/lesson_builder.py
- app/services/lesson_service.py
- requirements.txt
- .env.example
- README.md
- tests/test_regression_api.py
关联衔接：无
风险：
- 需要新增 spaCy 英文依赖与模型加载逻辑，Zeabur 构建时长会增加。
- DashScope 词级返回结构若与预期不一致，需要保留 ASR 原句降级路径。
验证：
- 已执行 `python -m py_compile app/core/config.py app/services/lesson_builder.py app/services/lesson_service.py tests/test_regression_api.py`，通过。
- 已执行 `pytest -q tests/test_regression_api.py -k "build_lesson_sentences or split_audio_segments or parallel_asr_trigger_by_duration or usage_settle or fallback_settle"`，结果：`5 passed`。
- 已执行 `pytest -q tests/test_regression_api.py tests/test_e2e_key_flows.py`，结果：`31 passed`。
清理记录：
- 本次未删除文档文件：当前任务文档仍为本次留痕，且尚无关联“已消解”衔接文档可删。
结束时间：2026-03-07 14:31
