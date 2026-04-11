# 任务：UI 打磨与惊艳感

## 你是谁

你是负责全站 UI 打磨的前端开发者。你的任务是让整个产品的视觉和交互达到比赛展示级别的质感，特别是新增的课程播放器和讨论场景。

## 背景

这个英语学习平台有几个核心页面需要打磨：
1. **阅读课程播放器**（刚开发完，功能可用但 UI 粗糙）
2. **AI 讨论场景**（Teacher+Student 聊天气泡，需要动画和质感）
3. **沉浸式听写页**（已有，但可以更好）
4. **整体一致性**（各页面风格统一）

参考项目：`D:\GITHUB\OpenMAIC`，它的 UI 质感是目标方向。

## 要打磨的页面和组件

### 1. 阅读课程播放器 `frontend/src/features/reading/course/`

**当前问题：**
- `CourseProgressBar.jsx` — 进度条太朴素，需要更有设计感
- `CoursePlayer.jsx` — 场景切换没有过渡动画
- 整体没有沉浸感

**要做的：**
- 场景切换加 fade + slide 过渡动画（用 CSS transition 或 framer-motion，项目没有 framer-motion 就用 CSS）
- 进度条步骤之间加连线动画（完成时连线变绿，有流动效果）
- 课程播放器加顶部渐变装饰条（紫色主题色）
- 每个场景的入场加轻微的 scale + opacity 动画

### 2. 讨论气泡 `frontend/src/features/reading/course/DiscussionBubble.jsx`

**当前问题：**
- 气泡样式太平���没有深度感
- 没有入场动画
- Teacher 和 Student 的区分不够明显

**参考 OpenMAIC 的实现（关键样式）：**
```css
/* Teacher 气泡 */
bg-white dark:bg-gray-800 border-gray-100 rounded-2xl rounded-bl-sm shadow-sm
/* Student 气泡 */  
bg-blue-50/95 dark:bg-blue-950/60 border-blue-200/60 rounded-2xl rounded-br-sm
/* User 气泡 */
bg-purple-600/95 text-white rounded-2xl rounded-br-sm shadow-md shadow-purple-300/30
/* 头像 */
absolute -top-2.5 w-6 h-6 rounded-full border-2 shadow-sm
/* 入场动画 */
initial={{ opacity: 0, y: 8 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: -8 }}
transition={{ duration: 0.2, ease: [0.21, 1, 0.36, 1] }}
```

**要做的：**
- 气泡加 `backdrop-blur` 玻璃效果
- 头像改为悬浮在气泡边缘（`absolute -top-2.5 -left-2.5`）
- 消息入场加 CSS animation（slideUp + fadeIn）
- 正在播放的气泡加呼吸光效（`ring-2 ring-primary/30 animate-pulse`）
- Teacher 用蓝色系，Student 用绿色系，区分更鲜明

### 3. 讨论播放器 `frontend/src/features/reading/course/DiscussionPlayer.jsx`

**要做的：**
- 底部控制栏加毛玻璃效果 `backdrop-blur-md`
- 播放按钮加脉冲动画
- 消息计数用 Badge 显示
- 加载音频时显示声波动效（3 个竖条高低交替动画）

### 4. 完成总结页 `frontend/src/features/reading/course/CourseSummary.jsx`

**要做的：**
- Trophy 图标加入场动画（scale from 0 + bounce）
- 统计数字加计数动画（从 0 滚动到目标值）
- 整体加 confetti 效果（轻量 CSS 实现，不用库）
- 背景加微妙的渐变

### 5. 全局样式一致性

**检查并统一：**
- 所有卡片的圆角统一为 `rounded-2xl`（16px）
- 所有按钮 hover 效果一致
- Dark mode 下所有新组件都正常显示
- 间距节奏：section 间 `gap-6`，元素间 `gap-3`

## 关键文件

- `frontend/src/features/reading/course/` — 所有课程组件
- `frontend/src/features/reading/reading.css` — 阅读样式
- `frontend/src/features/immersive/immersive.css` — 听写样式
- `frontend/src/shared/ui/` — 共享 UI 组件
- `D:\GITHUB\OpenMAIC\components\roundtable\index.tsx` — 参考讨论 UI
- `D:\GITHUB\OpenMAIC\app\globals.css` — 参考配色（主色 #722ed1 紫色）

## CSS 动画参考片段

```css
/* 消息入场 */
@keyframes slideUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.discussion-bubble-enter {
  animation: slideUp 0.2s cubic-bezier(0.21, 1, 0.36, 1) forwards;
}

/* 呼吸光效 */
@keyframes breathe {
  0%, 100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.2); }
  50% { box-shadow: 0 0 0 6px rgba(124, 58, 237, 0); }
}
.discussion-bubble--playing {
  animation: breathe 2s ease-in-out infinite;
}

/* Trophy bounce */
@keyframes trophyBounce {
  0% { transform: scale(0); }
  60% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

/* 数字计数 - 用 JS requestAnimationFrame */
/* Confetti - 用 CSS 伪元素 + animation */
```

## 注意事项

- **不要安装新的 npm 包**。用 CSS animation + 原生 JS 实现所有动效。
- **不要改功能逻辑**。只改样式、动画、布局。
- **所有改动都要支持 dark mode**（`dark:` 前缀）。
- 测试 3 个断点：手机（375px）、平板（768px）、桌面（1440px）。
- 参考 OpenMAIC 但不要照搬——我们的主色也是紫色系，但要有自己的风格。

## 验证方式

1. 课程场景切换有平滑过渡
2. 讨论气泡逐条出现时有入场动画
3. 正在播放的气泡有呼吸光效
4. 完成总结页 Trophy 有弹跳入场
5. Dark mode 下所有组件正常
6. 手机端布局不溢出
