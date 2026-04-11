# 任务：阅读板块改造 — 读 + 写

## 你是谁

你是负责改造阅读板块的开发者。目标：让阅读板块专注于**读**和**写**两种能力，删除越界的听力功能，新增写作练习。

## 背景

当前阅读板块功能：
- 粘贴文本 → CEFR 词汇分析 → AI 简化改写 → 阅读包（多个 tab）
- 已有课程模式（Scene 1 阅读 → Scene 2 AI 讨论 → Scene 3 词汇 → Scene 4 测验）

问题：
1. 阅读包里有"生成听写"按钮——这是听力板块的事，**需要删除**
2. 课程模式里 Scene 2 的 AI 讨论用了 TTS 语音播放——这属于"听"，**需要改造**
3. 缺少"写"的功能

## 具体要做的事

### Part 1: 删除越界功能

#### 1.1 删除"生成听写"按钮

**文件 `frontend/src/features/reading/ReadingPackPanel.jsx`：**
- 删除 `onGenerateDictation` prop
- 删除 `dictationLoading` prop
- 删除 NextStepsBar 中"生成听写"按钮

**文件 `frontend/src/features/reading/ReadingPage.jsx`：**
- 删除 `handleGenerateDictation` 函数（约第 418-464 行）
- 删除 `dictationLoading` 状态
- 删除传给 ReadingPackPanel 的 `onGenerateDictation` 和 `dictationLoading` props

#### 1.2 改造 Scene 2 AI 讨论

当前 Scene 2（SceneDiscussion）使用 TTS 播放 AI 对话，属于"听"。

**改造方向**：去掉 TTS 语音播放，改为纯文本展示 + 用户可以**打字回应**（写作练习的入门）。

**文件 `frontend/src/features/reading/course/SceneDiscussion.jsx`：**
- 移除 TTS 播放功能
- 所有讨论消息一次性展示（不需要逐条播放）
- 在讨论末尾加一个写作区：让用户写 1-2 句总结或回应

**文件 `frontend/src/features/reading/course/DiscussionPlayer.jsx`：**
- 移除 TTS 相关逻辑（useDiscussionTTS）
- 简化为纯文本消息列表

**可以��除的文件：**
- `frontend/src/features/reading/course/useDiscussionTTS.js` — 不再需要

### Part 2: 新增"写"功能

在课程模式中新增 **Scene 5: 写作练习**，放在测验之后、总结之前。

流程变为：
```
Scene 1: 阅读 → Scene 2: AI讨论(纯文本) → Scene 3: 词汇 → Scene 4: 测验 → Scene 5: 写作 → 总结
```

#### 写作场景设计

**新建 `frontend/src/features/reading/course/SceneWriting.jsx`**

提供三种写作模式让用户选择：

**模��� A — AI 引导写作**
- AI 给一个 prompt（如"用自己的话总结文章"或"写一段相关观点"）
- 用户写完后提交
- AI 批改：语法纠错、用词改进、i+1 词汇建议
- 返回格式：原文标注错误 + 修改建议 + 总评

**模式 B — 仿写练习**
- AI 把文章中的关键句子拆开，隐藏部分词汇
- 用户填写缺失的词，训练"用 i+1 词汇造句"
- 类似完形填空但是手写

**模式 C — 续写/改写**
- 给出文章的开头或一个段落
- 用户续写下一段
- AI 评价内容连贯性和语言水平

#### 后端新增 `app/api/routers/llm_writing.py`

```
POST /api/llm/writing/generate-prompt
```
请求：`{ "article_text": "...", "target_level": "B1", "mode": "guided|imitation|continuation" }`
返回：`{ "prompt": "...", "reference_sentences": [...] }`

```
POST /api/llm/writing/evaluate
```
请求：`{ "article_text": "...", "user_text": "...", "target_level": "B1", "mode": "guided" }`
返回：
```json
{
  "corrections": [
    {"original": "I goed to school", "corrected": "I went to school", "type": "grammar", "explanation": "..."}
  ],
  "i1_suggestions": [
    {"original_word": "good", "suggested_word": "excellent", "level": "B2", "context": "..."}
  ],
  "overall_score": 75,
  "overall_feedback": "Good effort! Try using more varied vocabulary..."
}
```

注册到 `app/api/routers/llm.py`（和 quiz_router、discussion_router 同级）。

### Part 3: 优化阅读体验（参考 Rewordify）

Rewordify 的核心做法：**把难词直接替换为简单同义词，高亮标注，点击可查看原词和释义**。

当前我们已经有类似功能（mappings 字段记录了替换映射），但展示不够好。

**优化 `frontend/src/features/reading/ReadingPackPanel.jsx` 的 i+1 tab：**

- 替换后的词用特殊样式标注（黄色背景 + 下划线）
- hover 时显示 tooltip：原词 + CEFR 等级 + 释义
- 可以一键切换"显示原文/显示简化版"
- 这个功能现有代码基础已经有了，主要是 UI 体验的优化

## 文件结构

```
新增：
  frontend/src/features/reading/course/SceneWriting.jsx    # 写作场景
  app/api/routers/llm_writing.py                           # 写作 API

修改：
  frontend/src/features/reading/ReadingPage.jsx            # 删除 handleGenerateDictation
  frontend/src/features/reading/ReadingPackPanel.jsx        # 删除"生成听写"按钮
  frontend/src/features/reading/course/CoursePlayer.jsx     # 新增 Scene 5
  frontend/src/features/reading/course/CourseProgressBar.jsx # 5 步进度条
  frontend/src/features/reading/course/SceneDiscussion.jsx  # 去 TTS，加文本互动
  frontend/src/features/reading/course/DiscussionPlayer.jsx # 简化为纯文本
  frontend/src/features/reading/course/CourseSummary.jsx    # 新增写作得分
  frontend/src/features/reading/course/useCourseState.js    # 新增 scene5
  app/api/routers/llm.py                                    # 注册 writing_router

删除：
  frontend/src/features/reading/course/useDiscussionTTS.js  # 不再需要 TTS
```

## 注意事项

- **阅读板块绝对不能有"听"和"说"的功能**——不能播放音频、不能录音、不能调 TTS
- 写作评价用 DeepSeek LLM（参照 `llm_quiz.py` 的调用模式）
- 写作结果不需要持久化到后端（MVP），在 IndexedDB 的 courseData 里存即可
- Scene 2 讨论去掉 TTS 后，仍然保留 Teacher+Student 对话内容，只是变成纯阅读
- 3 种写作模式可以先只做模式 A（AI 引导写作），B 和 C 后续再加

## 验证方式

1. 阅读包页面没有"生成听写"按钮了
2. 课程 Scene 2 是纯文本讨论，没有语音播放
3. 课程有 5 个场景（阅读→讨论→词汇→测验→写作→总结）
4. 写作场景可以输入文本、提交、获得 AI 批改结果
5. 阅读板块没有任何音频播放或录音功能
