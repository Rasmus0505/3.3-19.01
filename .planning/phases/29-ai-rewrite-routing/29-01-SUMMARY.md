# Phase 29 Summary — AI 重写与路由

## 概述

Phase 29 完成了 v2.5 Milestone 的全部工作：
- 新增后端 `POST /api/llm/rewrite-text` endpoint（DeepSeek V3.2 重写 API）
- 前端 `useReadingRewrite` hook（IndexedDB 本地存储 + API 调用）
- 阅读区原文/重写版丝滑切换 UI
- 边栏「重写全文」按钮 + Loading 态

## 完成的任务

### Plan 01 — 后端重写 API endpoint
- 新增 `POST /api/llm/rewrite-text`（`app/api/routers/llm.py`）
- 复用 `call_deepseek`，temperature=0.3 保持一致性
- CEFR target_level 参数校验（A1-C1）
- 输入长度限制（12000 chars / ~3000 tokens）
- 计费和 LLM usage log 记录（category="rewrite"）
- 未登录返回 401

### Plan 02 — 前端 useReadingRewrite hook
- IndexedDB `reading_rewrites` 存储（DB version=1，store `rewrites`）
- `saveRewriteRecord` / `getRewriteRecordById` / `getLatestRewriteRecord` 操作
- `handleRewrite` 自动计算 i+1 目标等级（CEFR_ORDER: A1→A2→B1→B2...）
- `viewMode` 状态管理（"original" | "rewritten"）
- 重写完成后自动切换到重写版视图
- 费用 toast 提示

### Plan 03 — ReadingPage 整合
- 顶部原文/重写版切换开关（pill toggle 样式）
- 重写完成后显示切换开关，未重写时隐藏
- `activeText` 根据 `viewMode` 切换原文/重写版
- Pretext 重新布局渲染

### Plan 04 — 边栏重写按钮 E2E
- 「重写全文」按钮（Sparkles icon，青色配色）
- loading spinner + 禁用态
- 重写中提示文案（"AI 重写中..." + Loader2 spinner）
- 重写后按钮自动消失（onRewrite=null）

## 关键设计决策

1. **本地优先存储**：重写结果存入 IndexedDB，服务器仅存储 rewrite_id（元数据引用），原文不离开用户设备
2. **温度 0.3**：保持重写一致性，避免过度创意输出
3. **自动切换**：重写完成后自动切换到重写版，无需手动操作
4. **i+1 目标等级**：根据用户当前 CEFR 水平自动计算目标等级
5. **快速模式优先**：`enable_thinking=false`，降低费用和延迟

## v2.5 Milestone 完成总结

| Phase | Status | Key Feature |
|-------|--------|------------|
| 26 | ✅ Complete | Pretext 基础设施 — hook 封装、CEFR 分段、缓存 |
| 27 | ✅ Complete | 阅读板块核心 UI — 方案 A 布局、Pretext 渲染、响应式 |
| 28 | ✅ Complete | 词交互与生词本集成 — 选词动画、翻译弹窗、批量加词 |
| 29 | ✅ Complete | AI 重写与路由 — 重写 API、丝滑切换、E2E |

**v2.5 里程碑目标完成度**: 4/4 phases, 16/16 plans

---

## 交付物清单

| 文件 | 说明 |
|------|------|
| `app/api/routers/llm.py` | 新增 `/api/llm/rewrite-text` endpoint |
| `frontend/src/hooks/useReadingRewrite.js` | 重写 hook + IndexedDB 操作 |
| `frontend/src/features/reading/ReadingPage.jsx` | viewMode 切换 UI 整合 |
| `frontend/src/features/reading/WordSidebar.jsx` | 重写按钮 + loading 态 |
| `frontend/src/features/reading/reading.css` | 切换开关 + 重写按钮样式 |
| `.planning/phases/29-ai-rewrite-routing/29-01-RESEARCH.md` | 技术调研 |
| `.planning/phases/29-ai-rewrite-routing/29-01-PLAN.md` | 执行计划 |

---

## Bug 修复

（无）

---

*Phase 29 完成: 2026-04-05*
*v2.5 Milestone shipped: 2026-04-05*
