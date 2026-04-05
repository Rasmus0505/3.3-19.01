# Phase 29 Research — AI 重写与路由

## 概述

Phase 29 是 v2.5 Milestone 的最后一个 phase，基于 Phase 27-28 的阅读板块核心 UI 和词交互功能，新增 AI 重写、路由增强和全流程 E2E 验证。

---

## 1. 现有架构盘点

### 1.1 后端 LLM 基础设施

**文件**: `app/infra/llm/deepseek.py` + `app/api/routers/llm.py`

- **provider**: `deepseek-v3.2`（阿里 DashScope 兼容 API，`enable_thinking` 可切换）
- **fast 模式**: `deepseek-v3.2-fast`（便宜、快速，`think=False`）
- **thinking 模式**: `deepseek-v3.2`（带推理链，费用更高）
- **token 限制**: `max_tokens=4096`，超时 60s
- **计费**: `points_per_1k_tokens` 体系，已接入 `billing_service`

**现有 endpoint**: `POST /api/llm/generate-reading-material`（从单词列表生成阅读材料）

**不适用于 Phase 29 的原因**: 
- 现有 endpoint 接受 `words: list[dict]` 生成新课，不接受原文重写
- Prompt 是"根据词汇表生成阅读文章"，不是"将文章改写为 i+1 难度"

### 1.2 前端 API 调用模式

**文件**: `frontend/src/shared/api/client.js`

- `apiCall(path, options)` — 带 auth token 的 fetch 封装
- 支持 Desktop Runtime Bridge（CORS 绕过）
- `parseResponse(resp)` — JSON 解析

### 1.3 本地存储

**文件**: `frontend/src/shared/media/localTaskStore.js`

- 使用 **IndexedDB**（DB_NAME=`english_trainer_generation_tasks`）
- version=4，store=`generation_tasks`
- 存储用户生成任务（视频/音频任务数据）

### 1.4 阅读板块现状

**文件**:
- `frontend/src/features/reading/ReadingPage.jsx` — DEMO 文章，词选状态
- `frontend/src/features/reading/ArticlePanel.jsx` — `useRichLayout` 渲染，`onLinesReady` 回调
- `frontend/src/features/reading/WordSidebar.jsx` — 已选词列表
- `frontend/src/app/learning-shell/panelRoutes.js` — `/reading` 路由已注册
- `frontend/src/app/learning-shell/LearningShellSidebar.jsx` — 「阅读」菜单项已添加
- `frontend/src/app/learning-shell/LearningShellPanelContent.jsx` — `ReadingPage` 懒加载

### 1.5 REQ 要求回顾

REQ-READ-05（核心）: "右侧词栏提供「重写全文」操作按钮；阅读区顶部有「原文 / 重写版」切换开关"

REQ-REWRITE-01: "右侧「重写全文」按钮调用 AI 将原文改写为 i+1 难度的简化版本"

REQ-REWRITE-02: "重写结果存储在 IndexedDB（用户本地），服务器仅存储 rewrite_id 和 lesson_id 引用关系；原文和分析数据不离开用户设备"

REQ-REWRITE-04: "阅读区上方有「原文 / 重写版」切换开关，单区域展示，点击丝滑切换，无页面跳转"

---

## 2. 标准技术栈

| 组件 | 技术选型 | 理由 |
|------|---------|------|
| AI 重写后端 | 新增 endpoint `POST /api/llm/rewrite-text` | 复用现有 `call_deepseek`，新建 prompt |
| Prompt 策略 | system: "改写为 CEFR i+1 难度"，user: 原文 | 简单有效，无需微调 |
| 重写版本存储 | **IndexedDB**（本地） | REQ-REWRITE-02 明确要求不离开设备 |
| 存储结构 | `{ id, original_text, rewritten_text, cefr_level, created_at }` | 最小数据，仅元数据引用 |
| 原文/重写切换 | React state `viewMode: "original" \| "rewritten"` | 单区域展示，无页面跳转 |
| 前端路由 | `react-router-dom` `/reading`（已有），`/reading/:id` 扩展 | 路由不变，id 在 IndexedDB 内 |
| UI 反馈 | sonner toast（已有） | 与 Phase 28 一致 |
| Loading 态 | 按钮 loading + inline spinner | 复用现有模式 |

---

## 3. 架构模式

### 3.1 重写 API 流程

```
用户点击「重写全文」
    ↓
前端: POST /api/llm/rewrite-text
  {
    text: "The quick brown fox...",
    target_level: "B1",    // userLevel + 1
    enable_thinking: false // 快速模式
  }
    ↓
后端: call_deepseek(prompt=重写 prompt, enable_thinking=false)
    ↓
返回: { ok, rewritten_text, trace_id, charge_cents }
    ↓
前端: 存储到 IndexedDB
    ↓
UI: 显示重写版内容，切换 viewMode
```

### 3.2 Prompt 设计

```
System: You are an English text simplifier for language learners.
Rewrite the given text at CEFR {target_level} level.
Rules:
- Replace complex vocabulary with simpler CEFR {target_level} equivalents
- Keep sentence structure clear and understandable
- Preserve the original meaning and key information
- Output only the rewritten text, no explanations
- Keep approximately the same length as the original

User: {original_text}
```

### 3.3 IndexedDB 存储

- **DB name**: `reading_rewrites`（与 `localTaskStore` 分离）
- **Store**: `rewrites`
- **数据结构**:
  ```js
  {
    id: crypto.randomUUID(),         // rewrite_id
    lesson_id: null,                 // 阅读无关联课程，null
    original_text: string,
    rewritten_text: string,
    target_level: string,            // e.g., "B1"
    user_level: string,              // e.g., "A2"
    created_at: Date.now(),
  }
  ```
- **索引**: `id`（primary key），`lesson_id`（无索引需求，阅读无 lesson）

### 3.4 原文/重写版切换

在 `ReadingPage.jsx` 新增 state:
```jsx
const [viewMode, setViewMode] = useState("original"); // "original" | "rewritten"
const [rewrittenText, setRewrittenText] = useState(null);
const [rewriteId, setRewriteId] = useState(null);    // IndexedDB id
const [isRewriting, setIsRewriting] = useState(false);
```

文章渲染根据 `viewMode` 切换原文/重写版文本，传入 `ArticlePanel`。

### 3.5 存储位置决策

**为什么不用 localStorage 而用 IndexedDB**:
- 原文可能很长（5000+词），localStorage 限制约 5MB
- IndexedDB 存储无大小限制
- 未来需要存储多篇重写结果（历史记录）
- localTaskStore.js 已建立 IndexedDB 模式，可参考

---

## 4. 不要手写

| 问题 | 正确方案 |
|------|---------|
| LLM API 调用 | 复用 `app/infra/llm/deepseek.py` 的 `call_deepseek` 函数 |
| IndexedDB 操作 | 参考 `localTaskStore.js` 的 `openDB` / `transaction` 模式 |
| API 调用 | 使用 `ReadingPage` 的 `apiCall` prop（已有） |
| 计费 | 后端 endpoint 内调用 `consume_points`（参考 `llm.py` 现有模式） |
| Toast 提示 | 复用 Phase 28 的 `import("sonner")` 动态导入 |

---

## 5. 常见陷阱

### 5.1 重写 API 计费
- 需要在 endpoint 内调用 `consume_points`，与现有 LLM endpoint 一致
- trace_id 需要生成并存入 IndexedDB

### 5.2 超长文本截断
- `max_tokens=4096` 约等于 3000 英文词输出
- 如果原文超过 ~1500 词，需要截断或提示用户
- 可以在前端截断（或后端截断）

### 5.3 IndexedDB 异步
- IndexedDB 操作全部是异步的
- 重写完成后先存 IndexedDB 再更新 UI

### 5.4 切换动画
- 原文→重写版切换时，内容重新触发 Pretext 布局
- 需要保持 articleLines 状态同步更新

---

## 6. 前端路由决策

**REQ-ROUTE-01** (`/reading/:lessonId`): 现有 `/reading` 路由已覆盖，lessonId 对阅读板块无意义（阅读不关联课程）。不需要额外路由参数。

**REQ-ROUTE-02** (`/reading/new`): DEMO 文章作为 new 状态，不需要独立路由。

**结论**: Phase 29 不需要修改路由结构，现有 `/reading` 路由已足够。

---

## 7. Plan 结构建议

| Plan | 内容 |
|------|------|
| Plan 01 | 新增后端 `POST /api/llm/rewrite-text` endpoint，复用 `call_deepseek` |
| Plan 02 | 前端 `useReadingRewrite` hook — IndexedDB 存储 + API 调用 |
| Plan 03 | ReadingPage 整合：原文/重写版切换 UI、Loading 态 |
| Plan 04 | 完善边栏「重写全文」按钮、切换开关 E2E |
| Plan 05 | Build + 总结 + v2.5 Milestone 收尾 |

---

*Phase 29 Research — 2026-04-05*
