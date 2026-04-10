# Parallel Refactor Workstreams

## Goal
在不改变现有产品行为的前提下，把当前仍然过大的前后端文件继续拆分，支持多个 agent 并行工作，减少写冲突，并为后续功能新增、删除、维护提供稳定边界。

## Current State
- 当前已经完成一轮结构收口：
  - 后端重复 router 已收口到目录版
  - `UploadPanel` 已拆出 `uploadConstants.js`、`uploadRuntime.js`、`uploadHelpers.js`、`uploadTaskViewModel.js`
- 当前仍然明显偏大的核心文件：
  - `frontend/src/features/upload/UploadPanel.jsx` `6721` 行
  - `frontend/src/features/immersive/ImmersiveLessonPage.jsx` `3580` 行
  - `frontend/src/features/lessons/LessonList.jsx` `1535` 行
  - `app/services/lesson_service.py` `3511` 行
  - `app/services/billing.py` `2396` 行
  - `app/services/lesson_task_manager.py` `1733` 行
  - `app/api/routers/admin/router.py` `1708` 行
  - `app/api/routers/llm.py` `1372` 行

## Global Rules
- 所有 agent 都禁止修改这些共享边界文件，除非任务明确写了允许：
  - `app/main.py`
  - `app/api/routers/__init__.py`
  - `tests/contracts/test_architecture_boundaries.py`
- 所有 agent 都必须保持对外接口不变：
  - 不改现有 HTTP path
  - 不改前端页面入口 path
  - 不改组件外部 props 形状，除非任务明确要求
- 所有 agent 都只做“拆分/搬移/收口”，不做“产品逻辑清理”，尤其不主动删除桌面端分支。
- 所有 agent 都不能回滚他人改动；如果发现同文件已有改动，先基于现状继续拆，不重写全文件。
- 所有 agent 完成后都至少跑自己范围内的最小验证。

## Wave 1: Can Run In Parallel Immediately

### Agent A: Upload Workflow Split
- Goal
  - 把 `UploadPanel` 中“副作用流程层”继续从页面容器中拆出。
- Write scope
  - `frontend/src/features/upload/UploadPanel.jsx`
  - `frontend/src/features/upload/` 下新增文件
- Do
  - 抽离上传提交流程
  - 抽离任务恢复与轮询逻辑
  - 优先命名为 `useUploadWorkflow`、`useUploadTaskPolling` 或同等语义模块
  - `UploadPanel` 保留状态装配、事件绑定、UI 渲染
- Do not touch
  - `frontend/src/features/immersive/**`
  - `frontend/src/features/lessons/**`
  - `app/**`
- Acceptance
  - `UploadPanel.jsx` 继续明显缩小
  - `npm --prefix frontend run build` 通过
  - 不删除桌面端相关逻辑，只搬移

### Agent B: Immersive Page Split
- Goal
  - 拆 `ImmersiveLessonPage.jsx`，把页面容器、播放器控制、讲解面板、输入反馈等逻辑拆散。
- Write scope
  - `frontend/src/features/immersive/ImmersiveLessonPage.jsx`
  - `frontend/src/features/immersive/components/**`
  - `frontend/src/features/immersive/hooks/**`
  - `frontend/src/features/immersive/` 下新增文件
- Do
  - 页面容器保留路由参数、顶层状态和子区域装配
  - 把副作用和业务控制继续下沉到 hooks
  - 把展示块拆到 components
- Do not touch
  - `frontend/src/features/upload/**`
  - `frontend/src/features/lessons/**`
  - `app/**`
- Acceptance
  - `ImmersiveLessonPage.jsx` 显著缩小
  - `npm --prefix frontend run build` 通过

### Agent C: LessonList Split
- Goal
  - 把 `LessonList.jsx` 拆成列表容器、操作菜单、卡片展示、批量操作、桌面本地字幕/媒体状态展示等子模块。
- Write scope
  - `frontend/src/features/lessons/LessonList.jsx`
  - `frontend/src/features/lessons/components/**`
  - `frontend/src/features/lessons/` 下新增文件
- Do
  - 保持 `LessonList` 现有对外导出不变
  - 优先拆卡片渲染、批量操作、设置弹窗、桌面恢复入口
- Do not touch
  - `frontend/src/features/upload/**`
  - `frontend/src/features/immersive/**`
  - `frontend/src/app/learning-shell/LearningShellPanelContent.jsx`
- Acceptance
  - `LessonList.jsx` 降到更接近容器组件
  - `npm --prefix frontend run build` 通过

### Agent D: lesson_service Split
- Goal
  - 拆 `lesson_service.py`，把超大服务文件按职责继续往 `app/services/lessons/` 下迁移。
- Write scope
  - `app/services/lesson_service.py`
  - `app/services/lessons/**`
- Do
  - 抽公共纯函数、课程装配函数、转写后处理、讲解生成、持久化编排
  - 新代码优先落在 `app/services/lessons/`，保留 `lesson_service.py` 作为门面或兼容入口
- Do not touch
  - `app/services/billing.py`
  - `app/services/lesson_task_manager.py`
  - `app/api/routers/**`
  - `frontend/**`
- Acceptance
  - `lesson_service.py` 明显变薄
  - `python -m compileall app tests` 通过

### Agent E: billing Split
- Goal
  - 把 `billing.py` 继续拆成更清晰的子模块，减少单文件聚合。
- Write scope
  - `app/services/billing.py`
  - `app/services/billing/**`
- Do
  - 优先拆费率、钱包、兑换码、后台操作日志、定价计算
  - `billing.py` 保留向后兼容门面
- Do not touch
  - `app/services/lesson_service.py`
  - `app/services/lesson_task_manager.py`
  - `app/api/routers/**`
  - `frontend/**`
- Acceptance
  - `billing.py` 显著缩小
  - `python -m compileall app tests` 通过

### Agent F: Admin Router Split
- Goal
  - 把 `app/api/routers/admin/router.py` 再拆成更细的子域文件，但保持当前 router 暴露方式不变。
- Write scope
  - `app/api/routers/admin/router.py`
  - `app/api/routers/admin/` 下新增文件
- Do
  - 按用户、计费、兑换码、安全状态、日志导出等子域拆分
  - `router.py` 仅做组合
- Do not touch
  - `app/main.py`
  - `app/api/routers/__init__.py`
  - `app/services/**`
  - `frontend/**`
- Acceptance
  - `admin/router.py` 只剩组合与少量 glue code
  - `python -m compileall app tests` 通过

### Agent G: LLM Router Split
- Goal
  - 把 `app/api/routers/llm.py` 按能力拆成子模块。
- Write scope
  - `app/api/routers/llm.py`
  - `app/api/routers/llm_*.py` 或新目录模块
- Do
  - 按改写、讲解、日志、计费查询、词汇/阅读相关接口拆分
  - 保持现有 router 暴露方式不变
- Do not touch
  - `app/main.py`
  - `app/api/routers/__init__.py`
  - `frontend/**`
- Acceptance
  - `llm.py` 降到组合层
  - `python -m compileall app tests` 通过

## Wave 2: Run After Wave 1 Returns

### Agent H: lesson_task_manager Split
- Depends on
  - Agent D 最好先完成，避免 lessons 任务编排边界重复调整
- Write scope
  - `app/services/lesson_task_manager.py`
  - `app/services/lessons/**`
- Do
  - 拆任务状态存储、恢复、workspace 持久化、终止/暂停信号处理

### Agent I: Learning Shell Split
- Depends on
  - Agent A、B、C 至少完成一部分
- Write scope
  - `frontend/src/app/learning-shell/LearningShellContainer.jsx`
  - `frontend/src/app/learning-shell/**`
- Do
  - 让 shell 只做布局、路由面板协调、跨 feature 状态传递
  - 不把 upload/immersive/lesson 业务重新拉回 shell

## Recommended Parallel Assignment
- 立即并行：
  - Agent A
  - Agent B
  - Agent C
  - Agent D
  - Agent E
  - Agent F
  - Agent G
- 第二波跟进：
  - Agent H
  - Agent I

## Collision Risks
- Agent A 和 Agent I 不能同时改 `LearningShellContainer.jsx`
- Agent D 和 Agent H 都会碰 lessons service 边界，建议先 D 后 H
- Agent F 和 G 都不要碰 `app/main.py` 或 `app/api/routers/__init__.py`
- Agent B 不要碰当前 immersive 以外的共享 hooks，避免和 Upload/LessonList 冲突

## Minimal Verification Matrix
- 前端 agent：
  - `npm --prefix frontend run build`
- 后端 agent：
  - `python -m compileall app tests`
- 如果 agent 额外新增了边界文件或兼容门面：
  - 补局部结构测试或导入测试

## Definition of Done
- 大文件本身缩小
- 外部接口不变
- 新增模块边界清晰
- 验证命令通过
- 没有把共享入口文件改成冲突热点
