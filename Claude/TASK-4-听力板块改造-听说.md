# 任务：听力板块改造 — 听 + 说

## 你是谁

你是负责改造听力板块的开发者。目标：让听力板块专注于**听**和**说**两种能力，新增右下角 AI 对话 + 口语评测功能。

## 背景

当前沉浸式听写页面布局：
- 左上：视频播放器 ✅ 保持不变
- 左下：字幕拼写区 ✅ 保持不变
- 右侧：有解释面板（ExplanationPanel），但不够清晰

用户希望的新布局：
```
┌──────────────────────┬──────────────────────────┐
│                      │  右上：i+1 辅助理解        │
│   视频播放器          │  解释字幕中超纲词汇/语法    │
│   （保持不变）        │  （现有 ExplanationPanel   │
│                      │   改造优化）               │
├──────────────────────┼──────────────────────────┤
│   字幕拼写区          │  右下：AI 对话 + 口语评测  │
│   （保持不变）        │  和 LLM 讨论视频内容       │
│                      │  录音 → SOE 口语评测       │
│                      │  打字也可以                │
└──────────────────────┴──────────────────────────┘
```

## 关键文件（先读这些）

### 前端 - 沉浸式页面
- `frontend/src/features/immersive/ImmersiveLessonPage.jsx` — 主页面
- `frontend/src/features/immersive/ImmersiveLayout.jsx` — 布局组件
- `frontend/src/features/immersive/ExplanationPanel.jsx` — 现有解释面板（右上角基础已有）
- `frontend/src/features/immersive/ExplanationSidebarContent.jsx` — 解释侧边栏内容
- `frontend/src/features/immersive/hooks/useExplanation.js` — 解释逻辑 Hook
- `frontend/src/features/immersive/SOEResultCard.jsx` — 口语评测结果卡片（可复用）
- `frontend/src/features/immersive/immersive.css` — 样式

### 后端 - 已有能力
- `app/api/routers/soe.py` — 口语评测 API（`POST /api/soe/assess`）
- `app/infra/tencent_soe.py` — 腾讯云智灵口语评测
- `app/api/routers/tts.py` — TTS 语音合成（`POST /api/tts/synthesize`）
- `app/api/routers/llm.py` — LLM 调用入口
- `app/infra/llm/deepseek.py` — DeepSeek LLM 调用

### 后端 - Lesson 数据
- `app/models/lesson.py` — Lesson, LessonSentence（sentences 有 text_en, text_zh, cefr_vocab_json 等字段）

## 具体要做的事

### 1. 改造右侧布局为上下两栏

修改 `ImmersiveLayout.jsx`，将右侧分为上下两个面板：
- 上半部分：i+1 辅助理解（现有 ExplanationPanel 的优化版）
- 下半部分：AI 对话面板（新增）

### 2. 右上角：i+1 辅助理解面板（优化现有）

现有 `ExplanationPanel.jsx` 已经有解释功能。优化方向：
- 当用户听写到某一句时，自动显示这句话中 **高于 i+1** 的词汇解释
- 每个难词显示：原词、CEFR 等级标签、中文释义、例句
- 利用 `LessonSentence.cefr_vocab_json` 字段获取词汇等级
- 如果现有 ExplanationPanel 已经做到了这些，只需要确保布局正确

### 3. 右下角：AI 对话面板（核心新增）

**新建 `frontend/src/features/immersive/ChatPanel.jsx`**

功能：
- 用户可以**随时**和 AI 讨论当前视频/听写内容
- 两种输入方式：
  1. **打字**：普通文本输入框
  2. **录音**：点击麦克风 → 录音 → 发送到腾讯云 SOE 口语评测 → 同时获得：
     - ASR 转文字（SOE 返回的 `user_text`）→ 发给 LLM 作为用户消息
     - 口语评测分数（pronunciation_score, fluency_score）→ 在消息旁边显示小卡片

- AI 回复后用 TTS 播放语音（`POST /api/tts/synthesize`）
- 消息气泡样式参考 `frontend/src/features/reading/course/DiscussionBubble.jsx`

**后端新增 `app/api/routers/lesson_chat.py`**

```
POST /api/lesson-chat/message
```

请求体：
```json
{
  "lesson_id": 123,
  "message": "What does 'resilience' mean in this context?",
  "conversation_history": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}
```

System prompt 设计要点：
- 你是英语口语练习伙伴，帮助用户讨论正在学习的听力材料
- 鼓励用户用英语表达，用 i+1 水平回应
- 如果用户用中文问，可以中英混合回答
- 回答简短（2-3 句），像真实对话
- 上下文包含当前 lesson 的句子文本

注册到 `app/main.py`。

### 4. 录音 + SOE 评测流程

录音组件参考已有的 SOE 集成：
- 使用 `MediaRecorder` API 录音
- 录音完成后上传到 `POST /api/soe/assess`
- SOE 返回：`total_score`, `pronunciation_score`, `fluency_score`, `user_text`
- `user_text` 作为用户消息发给 LLM
- 评分结果显示在消息气泡旁边（小标签：`发音 85 | 流畅 72`）

参考 `frontend/src/features/immersive/SOEResultCard.jsx` 的结果展示方式。

## 文件结构

```
新增：
  frontend/src/features/immersive/ChatPanel.jsx        # AI 对话面板
  frontend/src/features/immersive/ChatMessage.jsx       # 消息气泡组件
  frontend/src/features/immersive/VoiceRecorder.jsx     # 录音组件
  frontend/src/features/immersive/useLessonChat.js      # 对话状态 Hook
  app/api/routers/lesson_chat.py                        # 对话 API

修改：
  frontend/src/features/immersive/ImmersiveLayout.jsx   # 右侧改为上下两栏
  frontend/src/features/immersive/ImmersiveLessonPage.jsx # 集成 ChatPanel
  frontend/src/features/immersive/immersive.css         # 布局样式
  app/main.py                                           # 注册 lesson_chat router
```

## 注意事项

- **视频播放器和字幕拼写区完全不动**
- AI 对话**随时可用**，不需要等听写完成
- 录音使用浏览器 `MediaRecorder` API（webm 格式），上传前可能需要转换为 wav/mp3（SOE 支持 webm 就直接传）
- 对话历史不需要持久化，刷新页面清空即可（MVP）
- TTS 播放 AI 回复是可选的，先做文本显示，TTS 作为增强

## 验证方式

1. 打开沉浸式听写页面，右侧分为上下两栏
2. 右上角显示当前句子的超纲词汇解释
3. 右下角可以打字和 AI 聊天
4. 点击麦克风录音，录音完成后显示口语评分 + AI 回复
5. 左侧视频播放和听写功能完全不受影响
