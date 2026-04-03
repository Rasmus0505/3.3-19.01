# Phase 24: CEFR 基础设施与 i 水平设置 - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

用户打开视频时一次性预处理所有字幕词汇，结果缓存到 localStorage；个人中心暴露 CEFR 水平选择器（A1–C2，默认 B1），设置通过 PATCH API 持久化到服务端，同时缓存在本地供离线使用。
</domain>

<decisions>
## Implementation Decisions

### 缓存策略
- **D-01:** localStorage 键使用 `cefr_analysis_v1:{lessonId}` 前缀命名。词汇表（cefr_vocab.json）是 MIT 许可证的 COCA 词表，基本不变动，无需复杂的版本失效机制。简单方案足够。

### 批量分析 UX
- **D-02:** 批量分析静默完成，使用 `setTimeout(0)` 分块执行，不阻塞 UI 线程。
- **D-03:** 视频首次分析完成时显示小 toast 提示"词汇分析完成"，让用户感知功能在工作。无需进度条——99% 的视频在 500ms 内完成。

### API 扩展
- **D-04:** CEFR 水平字段加到现有 `PATCH /api/auth/profile` 接口。Request 加 `cefr_level` 字段，与 `username` 共用同一接口，保持职责集中。无需独立端点。

### 前端持久化
- **D-05:** CEFR 水平在本地用 `authStorage.js` 写 `localStorage`（新增 `USER_CEFR_LEVEL_KEY`），参考现有 `writeStoredUser` / `readStoredUser` 模式。不用 Zustand persist middleware（代码库中没有这个用法）。
- **D-06:** 服务端和本地双写：PATCH API 成功后同步写 localStorage。离线时读 localStorage，服务恢复后自动同步。

### Duolingo 风格中文说明
- **D-07:** 每个等级带一行中文说明（参考标准 CEFR 定义），默认选中 B1。用单选按钮组（Radio Group）展示，等级字母高亮区分。

### Claude's Discretion
- **D-08:** 词汇分析在 ImmersiveLessonPage 组件 mount 时触发（`useEffect`），无需懒加载或用户主动触发。
- **D-09:** 未知词（不在 cefr_vocab.json 中）默认 SUPER 等级，在 Phase 25 的 CEFR 色块展示中使用。
- **D-10:** 个人中心 CEFR 选择器与 Phase 25 的沉浸式色块展示共用同一 `userCefrLevel` 状态来源（authSlice）。
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### API & Backend
- `app/api/routers/auth/router.py` — `PATCH /api/auth/profile` 端点，ProfileUpdateRequest 和 UserResponse schema 定义位置
- `app/schemas/auth.py` — ProfileUpdateRequest、UserResponse 数据模型，cefr_level 字段加在这里

### Frontend Storage
- `app/frontend/src/utils/authStorage.js` — authStorage.js 文件，writeStoredUser / readStoredUser 函数，cefr_level 字段写 localStorage 的位置
- `frontend/src/store/slices/authSlice.ts` — Zustand authSlice，setCurrentUser 和相关 action，cefr_level 的 setCefrLevel action 加在这里

### CEFR Analysis
- `app/frontend/src/utils/vocabAnalyzer.js` — VocabAnalyzer 类，load()、analyzeSentence(text)、analyzeVideo(sentences[], userLevel?)、checkFit(report, userLevel) 方法签名
- `app/data/vocab/cefr_vocab.json` — 词汇表结构：{ words: { word: { rank, level } } }，50k COCA 词频排名，A1–C2 等级阈值在 meta/cefr_thresholds 字段

### Personal Center UI
- `frontend/src/features/account/AccountPanel.jsx` — 个人中心 UI 组件，AccountPanel 组件位置，CEFR 水平选择器加在这里

### Phase 25 Dependency
- `.planning/phases/24-cefr-infra/24-CONTEXT.md`（本文档）— Phase 25 依赖 userCefrLevel 状态，Phase 25 的 vocabAnalyzer 调用依赖 userLevel 参数
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `vocabAnalyzer.js` — 已有 `analyzeVideo(sentences[], userLevel?)` 批量方法，直接复用
- `authStorage.js` — 已有 `writeStoredUser` / `readStoredUser` 模式，扩展加 `USER_CEFR_LEVEL_KEY` 即可
- `AccountPanel.jsx` — 已有用户名编辑 UI 模式，CEFR 选择器复用相同布局

### Established Patterns
- PATCH profile 后端：验证字段类型，写入数据库，返回完整 UserResponse
- 前端状态同步：API 成功后同时写 Zustand store + localStorage
- Toast 提示：项目已有轻提示系统（参考 Phase 18 的 HINT 系统）

### Integration Points
- ImmersiveLessonPage：mount 时调用 vocabAnalyzer，注入 userCefrLevel
- AccountPanel：PATCH profile 成功后同步更新 authSlice
- 离线支持：读取 localStorage 的 cefr_level 作为 fallback
</code_context>

<specifics>
## Specific Ideas

### CEFR 等级中文说明（已确定）
| 等级 | 说明 |
|------|------|
| A1 | 能理解和使用熟悉的日常表达和非常简单的句子 |
| A2 | 能理解最直接相关领域的熟悉事物，能进行简单日常对话 |
| B1 | 在英语国家旅行时能应对大多数情况，能围绕熟悉话题简单连贯地表达（**默认**） |
| B2 | 能与母语者比较流利地互动，能清晰详细地表达观点 |
| C1 | 能有效运用语言，能流畅自如地表达复杂思想 |
| C2 | 毫不费力地进行理解，能非常流利地精确表达 |

### localStorage 键
- CEFR 分析缓存：`cefr_analysis_v1:{lessonId}`
- 用户 CEFR 水平：`BOTTLE_CEFR_LEVEL`（新增键）
</specifics>

<deferred>
## Deferred Ideas

None — all 8 requirements discussed and decided.
</deferred>

---

*Phase: 24-cefr-infra*
*Context gathered: 2026-04-03*
