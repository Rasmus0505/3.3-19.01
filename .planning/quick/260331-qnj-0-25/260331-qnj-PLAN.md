---
phase: quick-qnj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/features/immersive/ImmersiveLessonPage.jsx
  - frontend/src/features/immersive/immersive.css
  - frontend/src/features/lessons/LessonList.jsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "沉浸式句子跳转输入支持清空后重输，未编辑时才回显当前句号"
    - "沉浸式句子跳转输入提交 0 时跳转第一句"
    - "倍速输入框右侧存在内嵌上下调节按钮，步进为 0.25"
    - "学习参数数字输入允许空白草稿态，不在每次按键时被立即 sanitize 回默认值"
  artifacts:
    - path: "frontend/src/features/immersive/ImmersiveLessonPage.jsx"
      contains: "sentenceJumpEditing"
    - path: "frontend/src/features/immersive/ImmersiveLessonPage.jsx"
      contains: "adjustPlaybackRateByStep"
    - path: "frontend/src/features/immersive/immersive.css"
      contains: "immersive-session-rate-stepper"
    - path: "frontend/src/features/lessons/LessonList.jsx"
      contains: "setLearningSettings((current) => ({"
---

<objective>
Improve numeric input ergonomics in immersive learning and learning settings.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Fix sentence jump editing semantics</name>
  <files>frontend/src/features/immersive/ImmersiveLessonPage.jsx</files>
  <action>
    Add an editing-state guard for the sentence jump field so the component only falls back to the current sentence number when the field is not actively being edited. Update commit logic so `0` resolves to sentence index `0`, while negative and non-numeric values still reset to the current sentence.
  </action>
  <verify>
    <automated>Select-String sentenceJumpEditing / commitSentenceJumpValue in ImmersiveLessonPage.jsx</automated>
  </verify>
  <done>Sentence jump field can be cleared and 0 maps to the first sentence</done>
</task>

<task type="auto">
  <name>Task 2: Add inline 0.25x playback stepper</name>
  <files>frontend/src/features/immersive/ImmersiveLessonPage.jsx, frontend/src/features/immersive/immersive.css</files>
  <action>
    Add compact up/down controls embedded on the right side of the playback rate input. Each click should immediately apply a `0.25` delta through the existing playback-rate normalization path without increasing the surrounding control height.
  </action>
  <verify>
    <automated>Select-String playback rate stepper selectors/handlers in JSX and CSS</automated>
  </verify>
  <done>Playback rate input supports inline 0.25-step adjustments</done>
</task>

<task type="auto">
  <name>Task 3: Preserve blank draft state for learning settings number fields</name>
  <files>frontend/src/features/lessons/LessonList.jsx</files>
  <action>
    Stop routing custom numeric-setting edits through the immediate sanitize helper, so empty strings remain in local component state while the user edits. Keep the existing write-to-storage sanitize path unchanged.
  </action>
  <verify>
    <automated>Select-String handleCustomConfigChange and writeLearningSettings in LessonList.jsx</automated>
  </verify>
  <done>Learning settings number fields no longer snap back mid-edit</done>
</task>

</tasks>
