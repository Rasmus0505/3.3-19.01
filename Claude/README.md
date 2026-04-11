# 并行开发任务分配

## 项目概述

英语学习平台，技术栈：Python FastAPI + React (Vite) + SQLite/PostgreSQL

## 任务列表

| 文件 | 负责 Claude | 核心内容 | 预估工作量 |
|------|------------|----------|-----------|
| `TASK-1-听力课程闭环.md` | Claude A | 沉浸式听写完成后追加词汇/测验/跟读/总结 | 中等 |
| `TASK-2-AI学习数据看板.md` | Claude B | 新建数据看板页 + AI 教练点评 | 较大 |
| `TASK-3-UI打磨与惊艳感.md` | Claude C | 全站动画/样式/质感提升 | 中等 |

## 依赖关系

```
TASK-1（听力闭环） ──── 独立，不依赖其他任务
TASK-2（数据看板） ──── 独立，不依赖其他任务
TASK-3（UI打磨）  ──── 建议在 TASK-1 完成后再做（因为要打磨听力的 UI）
                        但可以先做阅读课程的 UI 打磨
```

**TASK-1 和 TASK-2 完全独立，可以并行。TASK-3 可以同时启动，先做阅读部分。**

## 共同注意事项

1. **不要安装新的 npm 包**——用项目已有依赖
2. **UI 组件库**：`frontend/src/shared/ui/` 里有 shadcn/ui 组件
3. **LLM 调用**：参照 `app/api/routers/llm_quiz.py` 的模式
4. **TTS**：`POST /api/tts/synthesize`
5. **样式**：Tailwind CSS，支持 dark mode（`dark:` 前缀）
6. **每次完成一个功能点就 commit + push**
7. **CLAUDE.md** 在项目根目录，里面有编码规范

## 冲突风险

以下文件可能被多个任务修改，注意协调：
- `frontend/src/app/learning-shell/panelRoutes.js` — TASK-2 会新增 dashboard 面板
- `frontend/src/app/learning-shell/LearningShellSidebar.jsx` — TASK-2 会新增侧边栏入口  
- `frontend/src/app/learning-shell/LearningShellPanelContent.jsx` — TASK-2 会新增面板渲染
- `app/main.py` — TASK-1 和 TASK-2 都可能注册新路由
- `app/models/__init__.py` — TASK-2 可能注册新模型

建议：各 Claude 完成后立即 push，后面的 Claude 开始前先 `git pull`。
