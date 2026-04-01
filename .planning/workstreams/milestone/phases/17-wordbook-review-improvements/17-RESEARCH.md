# Technical Research: 弹窗沉浸学习实现方案

**Phase:** 生词本复习体验改进 (WORD)
**Date:** 2026-04-01
**Status:** Draft

---

## 1. 背景与目标

### 1.1 需求描述
用户复习单词时，可以点击"查看课程"跳转到来源课程，但不希望：
- 离开复习页面
- 进入沉浸式全屏模式
- 打断复习流程

### 1.2 目标
实现一个**弹窗模式的沉浸学习页面**，在复习流程中快速查看课程语境，不破坏复习流的连续性。

---

## 2. 现状分析

### 2.1 当前沉浸学习页面
- **文件:** `frontend/src/features/immersive/ImmersiveLessonPage.jsx`
- **行数:** 3600+ 行
- **核心功能:**
  - 全屏模式（Web Fullscreen API）
  - 字幕遮挡（Translation Mask）
  - 媒体播放控制
  - 单词收藏
  - 键盘快捷键
  - 句子循环播放

### 2.2 依赖关系
```
ImmersiveLessonPage
├── useImmersiveSessionController (状态机)
├── useSentencePlayback (播放控制)
├── useTypingFeedbackSounds (音效)
├── localMediaStore (本地媒体)
├── learningSettings (用户设置)
└── Fullscreen API (浏览器原生)
```

### 2.3 关键挑战
| 挑战 | 难度 | 说明 |
|------|------|------|
| 全屏 API 依赖 | 高 | 字幕遮挡、键盘事件监听依赖全屏 |
| 状态机耦合 | 中 | ImmersiveSessionController 与页面强耦合 |
| 媒体播放器 | 中 | 需要从当前播放器状态重建 |
| 上下文传递 | 低 | 跳转指定 sentence_index 已有支持 |

---

## 3. 实现方案

### 方案 A: Dialog 包装（推荐）

#### 3.1.1 核心思路
复用现有 `ImmersiveLessonPage` 组件，用 shadcn Dialog 包装，添加 `isCompact` 属性控制布局模式。

#### 3.1.2 实现步骤

**Step 1: 提取 ImmersiveLessonContent**
```jsx
// 新文件: ImmersiveLessonContent.jsx
export function ImmersiveLessonContent({ lessonId, initialSentenceIndex, isCompact }) {
  // 移出全屏相关逻辑，保留核心播放和字幕功能
}
```

**Step 2: 添加 isCompact 参数**
```jsx
function ImmersiveLessonContent({ lessonId, initialSentenceIndex, isCompact = false }) {
  // 弹窗模式: 隐藏全屏按钮、禁用全屏事件监听
  const containerClass = isCompact
    ? "h-[70vh] overflow-hidden"
    : "w-full h-full";

  return (
    <div className={containerClass}>
      {/* 播放器 */}
      {/* 字幕 */}
      {/* 控制栏 */}
    </div>
  );
}
```

**Step 3: 创建弹窗包装器**
```jsx
// 新文件: ImmersiveLessonPopup.jsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui";

export function ImmersiveLessonPopup({ open, onClose, lessonId, sentenceIndex }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] p-0">
        <ImmersiveLessonContent
          lessonId={lessonId}
          initialSentenceIndex={sentenceIndex}
          isCompact={true}
        />
      </DialogContent>
    </Dialog>
  );
}
```

**Step 4: 集成到复习卡片**
```jsx
// WordbookPanel.jsx
const [immersivePopup, setImmersivePopup] = useState({
  open: false,
  lessonId: null,
  sentenceIndex: 0,
});

function handleViewLesson(entry) {
  setImmersivePopup({
    open: true,
    lessonId: entry.source_lesson_id,
    sentenceIndex: entry.latest_sentence_idx,
  });
}

return (
  <>
    {/* 复习界面 */}
    <ImmersiveLessonPopup
      open={immersivePopup.open}
      onClose={() => setImmersivePopup({ open: false, lessonId: null, sentenceIndex: 0 })}
      lessonId={immersivePopup.lessonId}
      sentenceIndex={immersivePopup.sentenceIndex}
    />
  </>
);
```

#### 3.1.3 优点
- 最大程度复用现有代码
- 弹窗与全屏模式共享同一播放器逻辑
- UI 风格一致

#### 3.1.4 缺点
- 需要修改 ImmersiveLessonPage，引入耦合
- 弹窗模式可能需要禁用某些全屏特有功能

#### 3.1.5 工作量估算
| 任务 | 复杂度 | 估算 |
|------|--------|------|
| 提取 ImmersiveLessonContent | 中 | 2h |
| 添加 isCompact 参数 | 低 | 0.5h |
| 创建 ImmersiveLessonPopup | 低 | 1h |
| 集成到 WordbookPanel | 低 | 1h |
| **总计** | - | **4.5h** |

---

### 方案 B: 简化版弹窗播放器

#### 3.2.1 核心思路
不复用 ImmersiveLessonPage，而是创建一个轻量级的课程回看组件，只包含播放和字幕功能。

#### 3.2.2 实现步骤

**Step 1: 创建 LessonPlayerPopup 组件**
```jsx
// 新文件: LessonPlayerPopup.jsx
export function LessonPlayerPopup({ lessonId, sentenceIndex, onClose }) {
  const [lesson, setLesson] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(sentenceIndex);

  // 加载课程数据
  // 播放器控制
  // 字幕显示

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh]">
        <MediaPlayer src={lesson.mediaUrl} />
        <SubtitleDisplay
          sentences={lesson.sentences}
          currentIndex={currentIndex}
        />
        <SimpleControls
          onPrevious={() => setCurrentIndex(i => i - 1)}
          onNext={() => setCurrentIndex(i => i + 1)}
        />
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: API 调用**
```jsx
// 复用现有 GET /api/lessons/{lessonId}
async function loadLesson(lessonId) {
  const resp = await apiCall(`/api/lessons/${lessonId}`);
  return parseResponse(resp);
}
```

#### 3.2.3 优点
- 完全独立，不影响 ImmersiveLessonPage
- 代码量少，测试简单
- 弹窗功能可以单独演进

#### 3.2.4 缺点
- 代码重复（与 ImmersiveLessonPage）
- 功能受限（没有循环播放、遮罩等）
- 后续维护两套播放器

#### 3.2.5 工作量估算
| 任务 | 复杂度 | 估算 |
|------|--------|------|
| 创建 LessonPlayerPopup | 中 | 3h |
| 复用课程数据 API | 低 | 0.5h |
| 集成到 WordbookPanel | 低 | 1h |
| **总计** | - | **4.5h** |

---

### 方案 C: 混合方案（折中）

#### 3.3.1 核心思路
创建弹窗播放器，但核心播放逻辑复用 ImmersiveLessonPage 的 hook。

#### 3.3.2 实现步骤

**Step 1: 提取关键 hooks**
```jsx
// 从 ImmersiveLessonPage 提取
export { useSentencePlayback } from "./useSentencePlayback";
export { useImmersiveSessionController } from "./useImmersiveSessionController";
```

**Step 2: 创建 LessonPlayerPopup**
```jsx
export function LessonPlayerPopup({ lessonId, sentenceIndex, onClose }) {
  const { sentences, currentSentence, play, pause, seek } = useSentencePlayback({
    lessonId,
    initialIndex: sentenceIndex,
  });

  return (
    <Dialog>
      <MediaPlayer playing={isPlaying} onPlay={play} onPause={pause} />
      <SubtitleDisplay sentence={currentSentence} />
      <PlaybackControls onSeek={seek} />
    </Dialog>
  );
}
```

#### 3.3.3 优点
- 复用核心播放逻辑
- 独立 UI 层
- 便于后续扩展

#### 3.3.4 缺点
- 需要重构 ImmersiveLessonPage 以暴露 hooks
- 改动范围中等

#### 3.3.5 工作量估算
| 任务 | 复杂度 | 估算 |
|------|--------|------|
| 重构 ImmersiveLessonPage 暴露 hooks | 中 | 2h |
| 创建 LessonPlayerPopup | 中 | 2h |
| 集成到 WordbookPanel | 低 | 1h |
| **总计** | - | **5h** |

---

## 4. 推荐方案

### 方案 A: Dialog 包装（推荐）

**理由：**
1. 最大程度复用现有代码，减少维护成本
2. 功能一致性：弹窗播放器与全屏播放器行为一致
3. 工作量合理：与方案 B 相当，但代码质量更高
4. 便于扩展：后续弹窗播放器功能增强时，只需修改一处

**实施建议：**
1. 优先尝试方案 A
2. 如果 ImmersiveLessonPage 耦合太重，考虑方案 B
3. 避免方案 C，除非后续有大量复用需求

---

## 5. API 设计

### 5.1 复习时间预告 API（新增）

```
GET /api/wordbook/review-preview/{entry_id}

Response:
{
  "ok": true,
  "entry_id": 123,
  "current_interval": "1天后",
  "grades": [
    { "grade": "again", "interval": "10分钟后", "interval_hours": 0.17 },
    { "grade": "hard", "interval": "4小时后", "interval_hours": 4 },
    { "grade": "good", "interval": "1天后", "interval_hours": 24 },
    { "grade": "easy", "interval": "4天后", "interval_hours": 96 }
  ]
}
```

**实现位置：** `app/api/routers/wordbook.py`

### 5.2 复习结果返回（增强）

```
POST /api/wordbook/{entry_id}/review

Response:
{
  "ok": true,
  "message": "已记录复习结果",
  "entry": { ... },
  "remaining_due": 24,
  "review_result": {
    "previous_interval": "1天后",
    "new_interval": "4天后",
    "interval_change": "+3天",
    "memory_score_change": "+0.16"
  }
}
```

---

## 6. 数据模型

### 6.1 复习进度（前端状态）

```typescript
interface ReviewProgress {
  todayTotal: number;      // 今日总到期数
  todayCompleted: number;  // 今日已完成数
  percent: number;        // 百分比
}
```

### 6.2 复习队列项（增强）

```typescript
interface ReviewQueueItem {
  id: number;
  entryText: string;
  memoryScore: number;
  latestSentenceIdx: number;
  latestSentenceEn: string;
  latestSentenceZh: string;
  sourceLessonId: number;
  sourceLessonTitle: string;
  sourceCount: number;         // 新增：来源记录总数
  nextReviewAt: string;
  reviewCount: number;
  wrongCount: number;
}
```

---

## 7. 风险与缓解

### 7.1 风险：沉浸学习组件耦合

**风险描述：** ImmersiveLessonPage 与全屏模式高度耦合，提取时可能破坏现有功能。

**缓解措施：**
1. 先创建备份分支
2. 逐步提取，每步验证功能
3. 使用 feature flag 控制弹窗模式

### 7.2 风险：弹窗性能问题

**风险描述：** 弹窗内加载视频/音频可能较慢。

**缓解措施：**
1. 弹窗打开时显示 skeleton loading
2. 优先加载字幕，后加载媒体
3. 使用本地缓存（已有 localMediaStore）

### 7.3 风险：复习流被打断

**风险描述：** 用户在弹窗中跳转句子，关闭后不知道当前复习位置。

**缓解措施：**
1. 弹窗内禁止跳转其他句子（只读模式）
2. 或者：记录弹窗前的 queue position，关闭后定位

---

## 8. 测试策略

### 8.1 单元测试
- `wordbook_review_scheduler.py` 间隔计算
- `apply_review_grade` 边界条件

### 8.2 集成测试
- API 端到端测试（review-preview + review）
- 复习流程完整测试

### 8.3 E2E 测试（Playwright）
- 复习流程：加载队列 → 复习 → 反馈显示 → 进入下一张
- 弹窗流程：点击查看课程 → 弹窗打开 → 播放 → 关闭弹窗 → 继续复习
- 进度条更新

---

## 9. 下一步

1. **Phase 17.1:** 实现复习时间预告 API
2. **Phase 17.2:** 实现复习结果增强返回
3. **Phase 17.3:** UI 改造（进度条、按钮预告、反馈）
4. **Phase 17.4:** 弹窗沉浸学习实现

---

*Document version: 1.0*
*Last updated: 2026-04-01*
