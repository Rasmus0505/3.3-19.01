# Requirements: Bottle English Learning

**Defined:** 2026-04-02
**Core Value:** Users can turn real English media into usable learning lessons quickly, without needing technical setup or pushing heavy processing onto your server.

## v2.3 Requirements

Requirements for v2.3 milestone. Each maps to roadmap phases.

### Immersive Learning Bug Fixes

- [x] **IMMERSE-01**: 点击固定按钮或调节倍速时，已输入的句子内容不被清空，且不触发自动重播 — `SET_PLAYBACK_RATE`/`SET_LOOP_ENABLED` 事件处理器不改变 `sentenceTypingDone`/`sentencePlaybackDone` 状态；验证：输入 3 个词后切换倍速，输入内容保持可见
- [x] **IMMERSE-02**: 点击"上一句"右侧小喇叭按钮时，只有在音频实际播放成功后才显示 playing 状态；音频不可用时显示明确的错误提示而非静默失败 — `requestPlayPreviousSentence` 先 `await playSentence`，检查 `result.ok` 后才 dispatch `PLAYBACK_STARTED`；`previousSentence.audio_url` 不存在时降级到主视频 seek 模式
- [x] **IMMERSE-03**: 沉浸式学习答题框中，AI/提示生成的内容以黄色背景显示，用户手打的内容以绿色背景显示 — 在 `ImmersiveLessonPage` 中添加 `answerBoxMode` 本地状态，reducer action 驱动颜色切换；颜色值：黄色 `#FEF3C7`，绿色 `#D1FAE5`
- [x] **IMMERSE-04**: 全面排查沉浸式学习中所有可能导致已输入句子被清空或触发自动重播的操作场景，确保仅在合理场景下（如进入下一句、上一句、手动重播）才触发状态重置 — 逐个审查 `requestNavigateSentence`、`requestReplay`、`SET_PLAYBACK_RATE`、`SET_LOOP_ENABLED`、`handleSentencePassed` 等事件路径，补充缺失的 guard 逻辑

### Wordbook Enhancements

- [ ] **WB-01**: 生词本每个词条卡片的翻译文字显示在该词条正上方，采用独立的视觉区块（背景色区分），而非内嵌在正文行内；卡片整体高度保持一致（使用 `min-h` 或固定高度容器），不受翻译文字长度影响 — 布局：翻译文字区块 → 分隔线 → 单词/短语 + 发音按钮 → 例句；卡片最小高度 `min-h-[4rem]`，超出部分 `text-overflow: ellipsis`
- [ ] **WB-02**: 生词本每个词条支持点击播放该单词/短语的发音 — 主要方案：浏览器 Web Speech API（`window.speechSynthesis.speak()`，lang='en-US'），无额外 API 成本；备选方案：使用该词所在句子的 sentence-level `audio_url` 作为发音来源；按钮显示加载中状态；发音不可用时显示错误提示而非静默失败

### Upload Import UX Optimization

- [ ] **UPLOAD-01**: 素材上传页默认选中"链接"Tab（`defaultTab='link'`），而非文件上传 Tab
- [ ] **UPLOAD-02**: 素材上传页链接 Tab 区域精简文案 — 移除"支持常见公开视频链接：YouTube、B站..."等冗余说明段落；将"支持常见公开视频链接：YouTube、B站、常见播客页面、公开视频直链"作为输入框内的半透明 placeholder 文案；导入成功后自动用 yt-dlp 获取的视频标题填入标题输入框；底部说明仅保留"无法链接转视频时可改用 SnapAny"，其中"SnapAny"保持为可点击外链
- [ ] **UPLOAD-03**: 素材上传页快捷键配置从两行改为一行紧凑布局，每个配置项宽度收缩（不再占据整行宽度），使整个配置区域在一屏内可见
- [ ] **UPLOAD-04**: 加入生词本成功后的 toast 提示文字与按钮水平对齐，视觉上不生硬

### Import Config Modal & Video Content Extraction

- [ ] **UPLOAD-05**: 点击"导入并开始生成"后弹出 GenerationConfigModal 配置弹窗，弹窗保留链接粘贴后已自动填入的标题（用户修改过则以修改后的为准） — modal 通过 props 接收 `titleInput`，confirm handler 返回 `{ title, config }` 而非直接修改 panel state；auto-fill title 与用户编辑 title 的状态流不断裂
- [ ] **UPLOAD-06**: GenerationConfigModal 包含功能开关选项（具体开关待最终确认，至少包含）：是否翻译（默认 ON）、是否自动提取词汇到生词本（默认 OFF）— Toggle Switch 组件，按钮即时响应无需确认
- [ ] **UPLOAD-07**: GenerationConfigModal 提供生成方式二选一：English Materials（结构化课程，含字幕、翻译、练习）和 Video Content Extraction（纯视频内容提取，提取后保存为独立记录类型） — Radio 或 Segmented Control，首选 English Materials
- [ ] **UPLOAD-08**: 选择 Video Content Extraction 后，弹窗下方展开单独配置区域：段落粒度 / 句子粒度（默认段落）、是否显示时间戳（默认 OFF） — 条件渲染，选择 English Materials 时隐藏
- [ ] **UPLOAD-09**: 历史记录列表中，English Materials 记录和 Video Content Extraction 记录有明确的视觉区分：Lesson 记录显示蓝色 badge（"课程"），Transcript 记录显示琥珀色 badge（"内容提取"），支持按类型过滤
- [ ] **UPLOAD-10**: 桌面客户端记住链接导入视频的原始 URL，存入 lesson 记录的 `source_url` 字段；恢复视频时若检测到该 lesson 有对应的 source URL，提供"按链接恢复"选项

### Translation Mask & Caption Recovery

- [ ] **MASK-01**: 新视频加载时，字幕遮挡板位置恢复到屏幕正中（而非延续上一视频的位置）；遮挡板启用/关闭状态记忆（跨视频保持），遮挡板位置不记忆 — mask rect 以 normalized ratio（0-1）存储；新视频检测到 `lesson.id` 变更时强制使用居中默认 rect；旧视频恢复时使用存储的 normalized rect 按当前容器尺寸还原
- [ ] **MASK-02**: 桌面客户端恢复本地视频时，提供"文件恢复"和"链接恢复"两个入口选项；若该视频曾通过链接导入且有 source URL，提供"按链接恢复"直接重新下载视频文件而非使用本地缓存

## Traceability

Which phases cover which requirements.

| Requirement | Phase | Status |
|-------------|-------|--------|
| IMMERSE-01 | Phase 19 | Complete |
| IMMERSE-02 | Phase 19 | Complete |
| IMMERSE-03 | Phase 19 | Complete |
| IMMERSE-04 | Phase 19 | Complete |
| WB-01 | Phase 20 | Pending |
| WB-02 | Phase 20 | Pending |
| UPLOAD-01 | Phase 21 | Pending |
| UPLOAD-02 | Phase 21 | Pending |
| UPLOAD-03 | Phase 21 | Pending |
| UPLOAD-04 | Phase 21 | Pending |
| UPLOAD-05 | Phase 22 | Pending |
| UPLOAD-06 | Phase 22 | Pending |
| UPLOAD-07 | Phase 22 | Pending |
| UPLOAD-08 | Phase 22 | Pending |
| UPLOAD-09 | Phase 22 | Pending |
| UPLOAD-10 | Phase 22 | Pending |
| MASK-01 | Phase 23 | Pending |
| MASK-02 | Phase 23 | Pending |

**Coverage:**
- v2.3 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after v2.3 initial definition*
