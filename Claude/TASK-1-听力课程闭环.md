# 任务：听力课程闭环

## 你是谁

你是负责"听力课程闭环"功能的开发者。你的任务是在现有沉浸式听写功能完成后，追加学习环节，让用户有完整的"课程完成"体验。

## 背景

当前听力流程：用户上传音频 → ASR 转录 → 翻译 → 生成 Lesson → 进入沉浸式听写页面（逐句听写）→ 听写完就结束了，没有后续。

用户希望听写完成后，继续进入 **词汇练习 → 理解测验 → 跟读打分 → 完成总结页**，形成课程闭环。

## 目标

在沉浸式听写完成后，新增一个"课后学习"流程：

```
现有：沉浸式听写（逐句听写）→ 结束
改为：沉浸式听写 → [课后学习入口] → 词汇练习 → 理解测验 → 跟读打分 → 完成总结页
```

## 关键文件（先读这些）

### 前端 - 沉浸式听写
- `frontend/src/features/immersive/ImmersiveLessonPage.jsx` — 主页面，你需要在这里加入口
- `frontend/src/features/immersive/TypingPanel.jsx` — 听写面板
- `frontend/src/features/immersive/hooks/` — 状态管理 hooks
- `frontend/src/features/immersive/useImmersiveSessionController.js` — 会话控制器
- `frontend/src/features/immersive/SOEResultCard.jsx` — 已有的口语评测结果卡片（可复用）

### 前端 - 阅读课程（参考实现）
- `frontend/src/features/reading/course/` — 阅读板块刚完成的课程化实现，**你的实现应该参照这个模式**
  - `CoursePlayer.jsx` — 课程播放器（场景路由器）
  - `CourseProgressBar.jsx` — 进度条
  - `SceneVocabPractice.jsx` — 词汇练习场景
  - `SceneQuiz.jsx` — 测验场景
  - `CourseSummary.jsx` — 完成总结页
  - `useCourseState.js` — 课程状态 Hook（IndexedDB 持久化）

### 后端 - Lesson 模型
- `app/models/lesson.py` — Lesson, LessonSentence, LessonProgress 模型
- `app/api/routers/lessons/router.py` — Lesson CRUD API
- `app/api/routers/llm_quiz.py` — Quiz 生成 API（可复用，传入 lesson 的文本）

### 后端 - 口语评测（已集成）
- `app/api/routers/soe.py` — SOE 口语评测 API
- `app/infra/tencent_soe.py` — 腾讯云智灵口语评测基础设施
- `app/services/tencent_soe_service.py` — SOE 服务层

### 后端 - TTS
- `app/api/routers/tts.py` — TTS 合成 API (`POST /api/tts/synthesize`)

## 具体要做的事

### 1. 新建前端目录 `frontend/src/features/immersive/post-lesson/`

参照 `reading/course/` 的结构创建：

```
post-lesson/
  PostLessonPlayer.jsx      # 课后学习主组件
  PostLessonProgressBar.jsx  # 进度条
  SceneVocabReview.jsx       # 词汇复习（从 LessonSentence 提取生词）
  SceneListeningQuiz.jsx     # 听力理解测验
  SceneShadowing.jsx         # 跟读打分（用 TTS 播放句子 + SOE 评分）
  PostLessonSummary.jsx      # 完成总结页
  usePostLessonState.js      # 状态管理 Hook
```

### 2. 各场景详细需求

**SceneVocabReview**：
- 从 Lesson 的 sentences 中提取带 CEFR 标注的词汇（`cefr_vocab_json` 字段）
- 卡片式练习：显示单词，用户标记"已知"或"学习中"
- 参照 `reading/course/SceneVocabPractice.jsx`

**SceneListeningQuiz**：
- 调用 `POST /api/llm/quiz/generate` 生成测验（传入 lesson 的全部句子文本）
- 4-6 道选择题/填空题
- 参照 `reading/course/SceneQuiz.jsx`

**SceneShadowing（跟读打分）**：
- 选 3-5 个关键句子
- 用 `POST /api/tts/synthesize` 播放每个句子的 TTS 音频
- 用户跟读后录音
- 调用 `POST /api/soe/assess`（已有的口语评测端点）获取打分
- 显示发音分数、流畅度分数
- 参照 `SOEResultCard.jsx` 的结果展示

**PostLessonSummary**：
- 显示：听写正确率、词汇复习数量、测验得分、跟读平均分
- "返回首页"按钮

### 3. 入口点

在 `ImmersiveLessonPage.jsx` 中，当用户完成所有句子的听写后，显示一个"开始课后学习"按钮。点击后切换到 `PostLessonPlayer`。

### 4. 数据持久化

用 localStorage 存储课后学习进度（key: `post_lesson_v1_{lessonId}`），参照 `reading/course/useCourseState.js` 的 IndexedDB 模式简化为 localStorage 即可。

## 注意事项

- **不要修改现有听写流程**。只在听写完成后追加入口。
- **跟读打分用 TTS 播放句子**，不用原音频（原音频切片需要后端处理，MVP 先不做）。
- **SOE 已经完整集成**，直接调用 `/api/soe/assess` 即可，不需要重新实现。
- 测验生成复用 `/api/llm/quiz/generate`，只���要把 lesson 文本拼成一个字符串传入。
- 样式参照项目已有的 shadcn/ui 组件（`Button`, `Card`, `Badge`, `Progress`），位于 `frontend/src/shared/ui/`。

## 验证方式

1. 完成一个听力课程的听写
2. 出现"开始课后学习"入口
3. 依次完成词汇→测验→跟读 3 个场景
4. 跟读打分正常显示分数
5. 完成总结页展示所有统计
6. 现有沉浸式听写功能不受影响
