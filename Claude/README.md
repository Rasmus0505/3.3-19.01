# 并行开发任务分配

## 项目概述

英语学习平台，技术栈：Python FastAPI + React (Vite) + PostgreSQL

**核心理念**：听力板块负责 **听+说**，阅读板块负责 **读+写**，各自专职不越界。

## 当前任务列表

| 文件 | 负责 Claude | 核心内容 | 状态 |
|------|------------|----------|------|
| `TASK-1-听力课程闭环.md` | Claude A | 听写后追加词汇/测验/跟读/总结 | ⚠️ 被 TASK-4 取代 |
| `TASK-2-AI学习数据看板.md` | Claude B | 数据看板 + AI 教练 | 可并行 |
| `TASK-3-UI打磨与惊艳感.md` | Claude C | 动画/样式/质感 | 建议最后做 |
| **`TASK-4-听力板块改造-听说.md`** | **Claude D** | **右上 i+1 辅助 + 右下 AI 对话 + SOE 口语评测** | **新增，优先** |
| **`TASK-5-阅读板块改造-读写.md`** | **Claude E** | **删越界功能 + 去 TTS + 新增写作练习** | **新增，优先** |

## 优先级建议

```
第一轮（并行）：TASK-4（听力改造） + TASK-5（阅读改造） + TASK-2（数据看板）
第二轮：TASK-3（UI 打磨）— 等前面完成后统一打磨
TASK-1 已被 TASK-4 包含，不需要单独做
```

## 依赖关系

```
TASK-4（听力改造） ──── 独立
TASK-5（阅读改造） ──── 独立
TASK-2（数据看板） ──── 独立（但需要 TASK-4/5 产生学习数据后效果最好）
TASK-3（UI 打磨） ──── 依赖 TASK-4/5 完成
```

## 冲突风险

以下文件可能被多个任务修改：
- `app/main.py` — TASK-2/4/5 都会注册新路由
- `app/api/routers/llm.py` — TASK-5 会注册 writing_router
- `frontend/src/app/learning-shell/panelRoutes.js` — TASK-2 新增 dashboard
- `frontend/src/app/learning-shell/LearningShellSidebar.jsx` — TASK-2 新增入口
- `frontend/src/app/learning-shell/LearningShellPanelContent.jsx` — TASK-2 新增面板

**建议**：各 Claude 完成后立即 push，后面的 Claude 开始前先 `git pull`。

## 共同注意事项

1. **不要安装新的 npm 包**——用项目已有依赖
2. **UI 组件库**：`frontend/src/shared/ui/` 有 shadcn/ui 组件
3. **LLM 调用**：参照 `app/api/routers/llm_quiz.py` 的模式
4. **TTS**：只有听力板块可以用 `POST /api/tts/synthesize`
5. **SOE 口语评测**：只有听力板块可以用 `POST /api/soe/assess`
6. **样式**：Tailwind CSS，支持 dark mode（`dark:` 前缀）
7. **每次完成一个功能点就 commit + push**
8. **CLAUDE.md** 在项目根目录，里面有编码规范
