# Phase 26 Summary — Pretext 基础设施集成

## 概述

Phase 26 成功将 `@chenglou/pretext` v0.0.4 集成进 frontend，建立了完整的 CEFR-aware 测量管道。所有测量在浏览器端执行，服务器零压力。

---

## 完成的任务

### Task 1: 安装 `@chenglou/pretext` ✅

- `npm install @chenglou/pretext@latest` — v0.0.4 (2026-04-01)
- `npm run build` 通过，无报错
- `package.json` 第15行确认依赖

### Task 2: `usePretext.ts` ✅

- `frontend/src/hooks/usePretext.ts` — 3067 字节
- 封装 `prepare(text, font)` 和 `layout(prepared, maxWidth, lineHeight)`
- 提供便捷方法 `measure()` 和 `relayout()`（仅 relayout 避免重复 prepare）
- 内部使用 `useRef` 持有 `PreparedText` handle

### Task 3: `useRichLayout.ts` ✅

- `frontend/src/hooks/useRichLayout.ts` — 5989 字节
- 封装 `prepareWithSegments` + `layoutWithLines`
- 结合 `VocabAnalyzer.lookupCefrLevelForSurfaceForm()` 为每个词注入 CEFR 元数据
- VocabAnalyzer 单例模式，页面生命周期只 load 一次
- `extractLineSegments()` 将词级标注按 Pretext 行边界切分
- 返回 `{ lines: RichLine[], isReady: boolean, error: string | null, reload }`
- TypeScript 编译通过，`npm run build` 通过

### Task 4: `usePretextCache.ts` ✅

- `frontend/src/hooks/usePretextCache.ts` — 2146 字节
- localStorage 缓存 key 设计：`pt:prepare:v1:{text}:{font}`（短文本）或 `pt:prepare:v1:{base64(text)}:{font}`（长文本）
- API: `get()`, `set()`, `remove()`, `clear()`, `getCacheSize()`
- 写满时静默丢弃，不影响用户正常功能

### Task 5: 性能测试页面 ✅

- `frontend/test/pretext-benchmark.html` — 14902 字节
- 5000 词英文测试文本（40 段真实内容）
- 测量 `prepareWithSegments`（5 次取中位数）和 `layoutWithLines`（10 次取中位数）
- 阈值：prepare < 50ms，layout < 5ms
- Chrome DevTools 中打开此文件即可运行

---

## 关键设计决策

1. **VocabAnalyzer 单例**：避免重复 load（vocab JSON 约 3MB），Promise 缓存保证首次后的调用直接 resolve
2. **`extractLineSegments` 贪婪匹配**：以 line.text 为准匹配 segments，处理标点和非字母词（数字、缩写等）时跳过
3. **localStorage 缓存版本前缀**：`v1` 前缀便于未来 schema 升级时主动失效旧缓存
4. **prepare vs relayout**：Resize 时只用 `relayout()`，避免重复执行 Canvas measureText

---

## Phase 27 入口

Phase 27 将基于 `useRichLayout` hook 构建阅读板块核心 UI（`ReadingPage`、`ArticlePanel`、`WordSidebar`），需要：
- 在 `ReadingPage` 中引入 `useRichLayout`，传入文章文本和内容区宽度
- `RichLine[]` 渲染为 flex 行，每个 `RichSegment` 渲染为带 CEFR 颜色的 `<span>`
- 响应式边栏实现（桌面 280px 固定，移动端底部抽屉）

---

## 交付物清单

| 文件 | 说明 |
|------|------|
| `frontend/src/hooks/usePretext.ts` | Pretext 基础测量 hook |
| `frontend/src/hooks/useRichLayout.ts` | CEFR-aware 行布局 hook |
| `frontend/src/hooks/usePretextCache.ts` | localStorage 缓存策略 |
| `frontend/test/pretext-benchmark.html` | 性能测试页面 |
| `frontend/package.json` | 确认 `@chenglou/pretext@^0.0.4` |

---

*Phase 26 完成: 2026-04-05*
