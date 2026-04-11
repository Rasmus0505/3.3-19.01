# 任务：AI 学习数据看板

## 你是谁

你是负责"AI 学习数据看板"功能的开发者。你的任务是新建一个独立的数据看板页面，展示用户的学习统计，并用大模型生成个性化学习建议。

## 背景

这是一个英语学习平台，有两个核心学习功能：
- **听力**：上传音频 → 生成听写课程（Lesson）→ 沉浸式听写
- **阅读**：粘贴文本 → AI 简化改写 → 阅读课程

用户参加比赛，需要一个**惊艳的、有亮点的**数据看板。不能只是常见的图表堆砌（热力图+雷达图那种已经审美疲劳了）。

**核心亮点：AI 教练**——用大模型分析学习数据，生成个性化能力诊断和学习建议，像一个真实的英语老师在点评你。

## 目标

在侧边栏新增"学习数据"入口，点击进入全页数据看板：

```
┌─────────────────────────────────────────────────────────┐
│  AI 教练点评（核心亮点）                                    │
│  "Based on your learning patterns, your listening has    │
│   improved significantly... I suggest focusing on..."    │
│  [重新生成建议]                                           │
├─────────────────────┬───────────────────────────────────┤
│  学习热力图          │  能力雷达图                         │
│  (GitHub 风格)      │  (听力/阅读/词汇/语法/口语)         │
├─────────────────────┴───────────────────────────────────┤
│  词汇增长曲线 (CEFR 分层: A1/A2/B1/B2/C1)               │
├─────────────────────────────────────────────────────────┤
│  学习统计卡片                                             │
│  总学习时长 | 连续打卡天数 | 已学课程数 | 掌握词汇量        │
└─────────────────────────────────────────────────────────┘
```

## 关键文件（先读这些）

### 数据来源

**听力数据：**
- `app/models/lesson.py` — `Lesson`（课程）、`LessonSentence`（句子）、`LessonProgress`（学习进度：completed_indexes_json 记录已完成的句子下标）
- `app/api/routers/lessons/router.py` — Lesson CRUD

**阅读数据：**
- `app/models/reading_pack.py` — `ReadingPack`（阅读包，含 flow_status, quiz_json, course_data_json 等）
- `app/api/routers/reading_packs.py` — ReadingPack CRUD

**口语评测数据：**
- `app/models/soe_result.py` — `SOEResult`（口语评测记录：total_score, pronunciation_score, fluency_score 等）
- `app/api/routers/soe.py` — SOE API

**生词本：**
- `app/models/lesson.py` 中的 `WordbookEntry` — 用户收集的生词

**LLM 使用日志：**
- `app/models/llm_usage.py` — `LLMUsageLog`

### 侧边栏注册方式
- `frontend/src/app/learning-shell/panelRoutes.js` — 面板路由定义
- `frontend/src/app/learning-shell/LearningShellSidebar.jsx` — 侧边栏图标和入口
- `frontend/src/app/learning-shell/LearningShellPanelContent.jsx` — 面板内容渲染

### LLM 调用方式
- `app/infra/llm/deepseek.py` — `call_deepseek()` 函数，用 OpenAI SDK 兼容模式调用 DashScope DeepSeek
- `app/api/routers/llm_quiz.py` — 参照这个文件的模式写 LLM 端点（prompt 构建、JSON 解析、计费）

### UI 组件库
- `frontend/src/shared/ui/` — shadcn/ui 组件（Button, Card, Badge, Progress 等）
- `frontend/src/lib/utils.js` — `cn()` className 合并工具

## 具体要做的事

### 1. 后端：新增数据聚合 API

**新建 `app/api/routers/learning_dashboard.py`**

```
GET /api/dashboard/stats
```

返回聚合数据：
```json
{
  "total_lessons": 12,
  "total_reading_packs": 8,
  "total_study_minutes": 480,
  "streak_days": 7,
  "vocabulary_count": 156,
  "vocabulary_by_level": {"A1": 40, "A2": 55, "B1": 38, "B2": 18, "C1": 5},
  "lesson_completion_rate": 0.75,
  "reading_completion_rate": 0.60,
  "avg_soe_score": 72.5,
  "daily_activity": [
    {"date": "2026-04-05", "minutes": 30, "lessons": 1, "readings": 0},
    {"date": "2026-04-06", "minutes": 45, "lessons": 0, "readings": 2}
  ],
  "skill_scores": {
    "listening": 65,
    "reading": 70,
    "vocabulary": 55,
    "grammar": 60,
    "speaking": 45
  }
}
```

数据来源计算逻辑：
- `total_lessons`: `SELECT COUNT(*) FROM lessons WHERE user_id = ?`
- `total_reading_packs`: `SELECT COUNT(*) FROM reading_packs WHERE user_id = ?`
- `vocabulary_count`: `SELECT COUNT(*) FROM wordbook_entries WHERE user_id = ?`
- `avg_soe_score`: `SELECT AVG(total_score) FROM soe_results WHERE user_id = ?`
- `daily_activity`: 按 `created_at` 分组统计（最近 90 天）
- `skill_scores`: 根据各维度数据计算百分制分数（具体算法自行设计，合理即可）

```
POST /api/dashboard/ai-coach
```

请求体：`{ "stats": <上面的 stats 对象> }`

用 DeepSeek 生成个性化教练点评（200-400字），包含：
- 学习习惯分析（连续性、频率）
- 能力强弱项判断
- 具体的下一步建议（比如"建议多做B1级别的阅读"）
- CEFR 等级预测

返回：`{ "ok": true, "coach_text": "..." }`

注册到 `app/main.py`。

### 2. 前端：新增 Dashboard 页面

**新建 `frontend/src/features/dashboard/`**

```
dashboard/
  DashboardPage.jsx          # 主页面
  AICoachCard.jsx            # AI 教练点评卡片（最醒目的位置）
  HeatmapChart.jsx           # 学习热力图（GitHub contribution graph 风格）
  RadarChart.jsx             # 五维能力雷达图
  VocabGrowthChart.jsx       # 词汇增长曲线（CEFR 分层）
  StatsCards.jsx             # 统计卡片栏
  useDashboardData.js        # 数据获取 Hook
```

### 3. 图表实现

**不要引入重型图表库**（echarts 等太大）。推荐方式：
- **热力图**：纯 CSS Grid + 动态颜色，参考 GitHub contribution graph
- **雷达图**：SVG 手绘（5 个顶点的多边形，不超过 100 行代码）
- **词汇增长曲线**：SVG path 手绘，或者用轻量库 `recharts`（项目如果已有就用，没有就用 SVG）

### 4. 侧边栏入口

修改以下文件：
- `frontend/src/app/learning-shell/panelRoutes.js` — 新增 `{ key: "dashboard", title: "学习数据", path: "/dashboard" }`
- `frontend/src/app/learning-shell/LearningShellSidebar.jsx` — 新增 dashboard 入口（图标用 `BarChart3` from lucide-react）
- `frontend/src/app/learning-shell/LearningShellPanelContent.jsx` — 新增 dashboard 面板渲染

### 5. AI 教练的亮点设计

这是和普通数据看板拉开差距的关键：

- **不是静态文本**——有打字机动画效果逐字显示
- **语气像真人教练**——"我注意到你最近听力练习减少了，这可能影响..."
- **给出具体的、可执行的建议**——不是泛泛的"多练习"，而是"试试用B1难度的新闻材料做听写"
- **有"重新生成"按钮**——用户可以多次获取不同角度的建议
- 如果 `explanation_language` 设置为中文就用中文教练，英文就用英文教练

## 注意事项

- 数据看板不需要实时更新，页面加载时请求一次即可
- AI 教练文本可以缓存到 localStorage（key: `ai_coach_v1_{userId}`），避免每次打开都调用 LLM
- 热力图只需最近 90 天的数据
- 雷达图的 5 个维度分数算法不需要很精确，合理即可（MVP）
- **不要安装新的 npm 包**，用 SVG 或已有依赖实现图表

## 验证方式

1. 侧边栏出现"学习数据"入口
2. 点击进入看到完整的数据看板
3. 热力图显示最近的学习活动
4. 雷达图显示五维能力
5. AI 教练点评正常生成，有打字机效果
6. 统计数据与实际学习记录一致
7. 页面加载速度合理（<3s）
