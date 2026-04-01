# Phase 17: wordbook-review-improvements - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning
**Source:** PRD Express Path (UI-SPEC.md + RESEARCH.md + quick task 260401-wck)

<domain>
## Phase Boundary

把生词本从"功能存在"提升到"适合高频复习"，优先解决复习流、掌握度反馈和上下文回看。

</domain>

<decisions>
## Implementation Decisions

### 复习入口
- 直接从首页/导航栏进入"复习"模式，而不是先进入冗杂的列表页
- 今日到期数直接显示在入口位置

### 复习预告
- 用户在点击复习前就能看到各选项的间隔时间（10分钟/4小时/1天/4天）
- API: GET /api/wordbook/review-preview/{entry_id}

### 掌握度反馈
- 每次复习后显示"上次间隔→新间隔"的对比
- 使用进度条显示今日复习进度

### 例句与课程回看
- 在复习卡片中显示当前例句（中英文）
- "播放课程"按钮打开弹窗式沉浸播放器

### 按钮样式
- 复习按钮统一为白色边框样式，不保留黑色高亮

### Claude's Discretion
- 弹窗播放器复用 ImmersiveLessonPage 组件，用 Dialog 包装
- 遗忘曲线调度使用简单倍数规则

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Wordbook
- `frontend/src/features/wordbook/WordbookPanel.jsx` — 复习界面主组件
- `app/api/routers/wordbook.py` — 复习 API 端点
- `app/services/wordbook_service.py` — 复习调度逻辑

### Immersive Learning
- `frontend/src/features/immersive/ImmersiveLessonPage.jsx` — 沉浸学习页面

### UI Spec
- `.planning/workstreams/milestone/phases/17-wordbook-review-improvements/17-UI-SPEC.md` — 视觉规格

</canonical_refs>

<specifics>
## Specific Ideas

1. **进度条**: 复习卡片顶部显示 "3/10" 格式的今日进度
2. **间隔预告**: 四个按钮下方显示预估间隔 "10分钟后/4小时后/1天后/4天后"
3. **复习反馈**: 复习后显示 "+2天" 绿色文字提示
4. **播放器按钮**: "播放课程" 按钮在 source_lesson_id 存在时显示

</specifics>

<deferred>
## Deferred Ideas

- 发音播放 (WORD-07, WORD-08) — 用户说后面专门做
- 批量管理 (WORD-03) — Phase 18
- shadcn 界面重做 (WORD-06) — Phase 18
- 轻提示系统 (HINT-01, HINT-02) — Phase 18

</deferred>

---

*Phase: 17-wordbook-review-improvements*
*Context gathered: 2026-04-01 via UI-SPEC + RESEARCH + quick task*
