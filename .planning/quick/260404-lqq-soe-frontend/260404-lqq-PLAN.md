---
must_haves:
  - 前端录音组件 AudioRecorder（Web Audio API / MediaRecorder）
  - SOE 评测 API 调用（/api/soe/assess）
  - 跟读 UI 集成到 ImmersiveLessonPage
  - 评测结果展示（总分、发音分、流畅度、完整度）
  - API 端点在 /api/soe/history 可查历史记录
---

# Plan: 口语评测功能快速上线（方案 A）

## 任务边界

在 ImmersiveLessonPage 中添加"跟读练习"功能：用户点击按钮 → 弹出录音框 → 调用腾讯云 SOE API → 显示评测结果卡片。不改变现有课程流程。

## 任务列表

### Task 1: 录音组件 `AudioRecorder`

**文件**: `frontend/src/shared/components/AudioRecorder.jsx`（新建）

**内容**:
- 使用 `MediaRecorder` API 录音（浏览器原生，无依赖）
- 支持 `.webm` 格式输出（浏览器默认，高压缩）
- 暴露 props: `onRecordingComplete(Blob, duration)`, `maxDuration`（秒，默认 30）
- 暴露状态: `idle | recording | processing`
- UI: 跟读按钮 + 录音中红色圆点动画 + 时长显示 + 停止按钮
- 录音结束后触发 `onRecordingComplete`

**验证**: `git diff --stat` 确认文件存在

**完成**: AudioRecorder.jsx 存在，import 无报错

---

### Task 2: SOE API 客户端 `soeApi.ts`

**文件**: `frontend/src/shared/api/soeApi.ts`（新建）

**内容**:
- `assessSentence(client, audioBlob, refText, sentenceId?, lessonId?): Promise<SOEResult>`
  - 使用 `FormData` 封装 multipart 上传
  - 端点: `POST /api/soe/assess`
  - 字段: `audio_file`, `ref_text`, `sentence_id`（可选）, `lesson_id`（可选）
- `getSoeHistory(client, params?): Promise<SOEHistoryItem[]>`
  - 端点: `GET /api/soe/history`

**验证**: 文件存在，函数签名正确

**完成**: soeApi.ts 存在

---

### Task 3: 评测结果展示组件 `SOEResultCard`

**文件**: `frontend/src/features/immersive/SOEResultCard.jsx`（新建）

**内容**:
- 接收 `SOEResult` props，显示：
  - 总分（0-100，大字体）
  - 发音分、流畅度、完整度（三个小圆/条形图）
  - 单词级评测结果（可选，`Words` 字段高亮正确/错误单词）
- 关闭按钮（`onClose`）
- 动画入场（fade + scale）

**验证**: 文件存在

**完成**: SOEResultCard.jsx 存在

---

### Task 4: 集成到 ImmersiveLessonPage

**文件**: `frontend/src/features/immersive/ImmersiveLessonPage.jsx`（修改）

**改动**:
- 引入 `AudioRecorder` 和 `SOEResultCard`
- 在当前句子展示区域（`currentSentenceEn` 附近）添加"跟读"按钮
- 按钮样式与现有按钮风格一致
- 点击后弹出录音状态：显示参考文本 + 录音中
- 录音完成 → 调用 `assessSentence` → 显示 `SOEResultCard`
- 传入 `refText = currentSentence.text_en`, `sentenceId`, `lessonId`

**验证**: 页面能正常加载，`AudioRecorder` 可见

**完成**: ImmersiveLessonPage 有跟读按钮和结果展示

---

### Task 5: API 端点对接验证与自测

- 确认 `.env.example` 中前端 vite 环境变量说明（`VITE_API_BASE_URL`）
- 如有本地后端运行，可手动测试：`POST /api/soe/assess` + `GET /api/soe/history`
- 确认前端 build 无报错（`npm run build` 或 vite build）

**验证**: `cd frontend && npm run build` 成功

**完成**: 前端 build 通过
