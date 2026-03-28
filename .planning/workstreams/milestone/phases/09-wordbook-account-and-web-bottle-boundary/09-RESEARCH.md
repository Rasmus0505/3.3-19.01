# Phase 9: 生词本、账号与网页模型边界 - Research

**Researched:** 2026-03-28
**Domain:** FastAPI + SQLAlchemy 账号身份扩展、React 学习壳个人中心重组、现有生词本升级为复习入口、Bottle 网页端命名收口
**Confidence:** HIGH

## Summary

Phase 9 不是要在现有产品旁边再长出三套新系统，而是把已经存在的三条链路收口成更完整的产品面：

1. **账号身份链路**：当前后端只有 `email / password / is_admin`，前端认证态也只缓存 `id / email / is_admin`；这意味着“唯一用户名”“当前用户读取”“个人中心改名”必须从数据库、schema、router、serializer 和 auth store 一起推进，而不是只在注册表单里加一个输入框。
2. **生词本链路**：当前 `WordbookEntry` 已经保存最新语境、来源课程和来源次数，收词入口也已经从沉浸学习里接好；真正缺的是“复习状态字段 + 到期队列 + 复习动作 + 复习 UI”，而不是新的收词系统。
3. **网页端 Bottle 边界链路**：Phase 7 已经把 `Bottle 1.0 / Bottle 2.0` 的边界和 CTA 锁定；Phase 9 的任务是把上传页和模型元数据里还残留的 `本机识别 / 云端识别` 旧词彻底清掉，并继续守住网页端不可执行 Bottle 1.0 的边界。

代码证据非常集中：`app/models/user.py` 还没有用户名字段；`app/api/routers/auth.py` 只有 `register / login / refresh / logout / desktop-token-login`；`tests/contracts/test_auth_contract.py` 却已经在尝试访问 `/api/auth/me`，说明当前用户读取接口既是 Phase 9 scope，也是在补现有 contract 缺口。另一方面，`app/models/lesson.py` 里的 `WordbookEntry` 已经有 `latest_sentence_en / zh` 和 `source_links`，但 `app/schemas/wordbook.py`、`app/services/wordbook_service.py` 和 `frontend/src/features/wordbook/WordbookPanel.jsx` 还没有任何“复习时间 / 复习次数 / 错题次数 / 记忆率 / 到期队列”的结构。最后，`frontend/src/features/upload/UploadPanel.jsx` 仍然直接展示 `本机识别 / 云端识别`，而 `asrModels.js` / `asr_model_registry.py` 已经部分转向 `Bottle 1.0 / Bottle 2.0`，说明这一块是明确的文案裂缝修复。

**Primary recommendation:** 按 roadmap 的四条计划项拆 Phase 9，并把依赖收口成三层：
- Wave 1 先并行完成 **09-01 后端身份接口**、**09-03 生词本复习后端+前端**、**09-04 Bottle 命名收口**。
- Wave 2 再做 **09-02 前端认证卡片 + 个人中心 + 兑换码入口迁移**，因为它依赖 09-01 暴露的新 auth/current-user API。
- 生词本复习不要直接引入完整可配置 FSRS UI；应把算法封装在服务层，先落业务字段和“保守动态调度 + `0.85` 目标记忆率 + 四档反馈”合同。

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** 生词本顶部必须提供独立的“开始复习”入口，显示当前到期数量，并进入专门复习流。
- **D-02:** 生词本列表默认主信息只展示：最新中英语境、下次复习时间、复习次数、记忆率百分比。
- **D-03:** 生词本列表默认不展示“单词 / 短语”标签。
- **D-04:** `source_count` 与 `wrong_count` 仍保留为可见数据，但降到次级信息。
- **D-05:** 不采用手写固定阶梯作为主调度规则，而采用保守版动态复习调度。
- **D-06:** 动态调度默认目标记忆率为 `0.85`。
- **D-07:** 复习反馈使用四档中文按钮：`重来 / 很吃力 / 想起来了 / 很轻松`。
- **D-08:** 默认展示预测记忆率百分比；达到或超过 `0.85` 时显示 `已掌握`。
- **D-09:** 用户名是唯一身份标识，但不是登录凭证，应保留更自由的昵称风格。
- **D-10:** 登录后提供独立个人中心页面/路由。
- **D-11:** 个人中心放在学习侧边栏最上方。
- **D-12:** 兑换码充值并入个人中心；删除独立“兑换码充值”页面和侧边栏入口。
- **D-13:** 登录 / 注册继续共用同一张认证卡片，但改成显式页签；注册页签额外展示用户名字段。
- **D-14:** 后端必须提供“当前用户读取”能力，并把用户名纳入当前用户返回结构。
- **D-15:** 网页端用户面前只保留 `Bottle 1.0 / Bottle 2.0` 作为主命名。
- **D-16:** `本机识别 / 云端识别` 不仅不能做主标题，也不要再作为副文案继续出现在用户可见表面。
- **D-17:** Bottle 1.0 仍保持“网页可解释、可引导下载桌面端、但不可执行”的边界。

### the agent's Discretion
- 动态复习调度的具体实现方式，只要保持“保守动态调度 + `0.85` 目标记忆率”
- 记忆率百分比的具体 UI 表达
- 用户名精确规范化策略和冲突文案
- 个人中心具体排版
- Bottle 补充说明文案，只要不再暴露旧词

### Deferred Ideas (OUT OF SCOPE)
- 用户名登录
- 高级可调 SRS / FSRS 参数界面
- 标签体系、弱项专项训练、多模式复习
- 重新开放网页端 Bottle 1.0 执行能力
</user_constraints>

---

## External Product / Scheduling Findings

### Finding 1: 现代间隔复习的主流方向是动态调度，不是公共固定阶梯
- Anki 官方在 FSRS 文档里明确把调度目标描述为“让记忆率接近设定的 desired retention”，默认值就是 `0.90`，而不是鼓励所有卡片走统一 `1 天 / 3 天 / 7 天`。
- 这对 Phase 9 的意义是：用户锁定的 `0.85` 目标记忆率完全合理，而且应该被实现为一个**算法参数**，不是一段写死的文案。

### Finding 2: 两档反馈太粗，四档更接近当前成熟调度语义
- FSRS 生态和 Anki 常见交互使用 `Again / Hard / Good / Easy` 四档。
- 用户提出“两档太少”，最终锁定 `重来 / 很吃力 / 想起来了 / 很轻松`，这个方向和主流产品一致。
- `WBK-04` 里写的 `again / good` 可以通过“四档里保留 again 和 good 等价语义”继续满足，不需要退回两档。

### Finding 3: 当前阶段更适合“算法封装 + 业务字段落地”，而不是引入完整外部调度产品壳
- MaiMemo 2025 公开实验显示，离线更强的更新记忆模型不一定在线上真实使用指标里更优。
- 对这个 brownfield 项目来说，更稳的策略是：
  - 先在服务层封装一个可演进的调度器
  - 先把 `next_review_at / review_count / wrong_count / memory_score` 这些业务字段打通
  - 后续如果要换更完整调度器，只动服务层和少量状态字段，而不是推翻 UI 与 API 合同

### Sources
- [Anki Manual - FSRS](https://docs.ankiweb.net/deck-options#fsrs)
- [FSRS Algorithm Wiki](https://raw.githubusercontent.com/wiki/open-spaced-repetition/awesome-fsrs/The-Algorithm.md)
- [py-fsrs](https://github.com/open-spaced-repetition/py-fsrs)
- [MaiMemo 2025 Experiment](https://memodocs.maimemo.com/docs/2025_experiment)

---

## Standard Stack

### Core
| Library / Module | Version / Source | Purpose | Why it matters here |
|------------------|------------------|---------|----------------------|
| FastAPI + SQLAlchemy + Alembic | repo baseline | 用户、认证、生词本、迁移 | Phase 9 的用户名与复习字段都要走数据库与 API 正规演进 |
| React 18 + Vite + React Router 7 | `frontend/package.json` | 学习壳、认证卡片、侧边栏、上传页 | 个人中心和 Bottle 文案收口都落在共享前端里 |
| Zustand auth slice | `frontend/src/store/slices/authSlice.ts` | 当前用户持久化 | 目前只缓存 `id / email / is_admin`，必须扩充到 username |
| Existing Wordbook stack | `wordbook.py` service/repo/panel | 现有收词链路 | 已有语境与 source count，可在其上增量升级 |
| Existing upload model metadata | `UploadPanel.jsx` / `asrModels.js` / `asr_model_registry.py` | Bottle 命名和 CTA 逻辑 | Phase 9 只需继续收口用户可见文案，不重写上传流 |

### Supporting
| Tool / Pattern | Purpose | When to use |
|----------------|---------|-------------|
| `pytest` | 后端 contract / integration | 覆盖 username/current-user、wordbook review API |
| `npm --prefix frontend run build` | 前端编译完整性检查 | 每次改认证卡片、侧边栏、WordbookPanel、UploadPanel 后 |
| `npm --prefix frontend run build:app-static` | 同步并验证 `app/static` | 09-04 收尾时必须执行 |
| `tests/contracts/test_auth_contract.py` | 认证 contract 基线 | `/api/auth/me` 与 UserResponse 扩充后应继续通过 |
| `tests/integration/api/test_wordbook_api.py` | 生词本 API 基线 | 复习字段、队列和 review action 的首选集成测试入口 |

No new frontend framework is required for Phase 9.

---

## Architecture Patterns

### Pattern 1: 用户名采用“显示值 + 规范化唯一键”而不是只存一个裸字符串

当前 `User` 只有 `email / password_hash / is_admin / last_login_at`。如果直接只加一个 `username` 并对用户可见值做唯一索引，会把“显示昵称”和“唯一比较逻辑”绑死。更稳的方案是：

- `username`：用户看到的显示值
- `username_normalized`：服务层规范化后的唯一比较键

服务层统一负责：
- trim 外层空白
- collapse 连续空白
- Unicode NFKC normalize
- casefold

这样可以满足“昵称风格更自由”，同时保证唯一性与后续改名逻辑可控。

### Pattern 2: `/api/auth/me` 应成为前端认证态恢复和个人中心的 canonical source

当前前端 `authSlice.ts` 是从 localStorage 读 `id / email / is_admin` 拼出 `currentUser`，这不适合扩展出 username 和改名后的状态同步。Phase 9 最自然的结构是：

- 注册 / 登录成功响应继续返回完整 `user`
- 新增 `GET /api/auth/me`
- 新增 `PATCH /api/auth/profile` 或等价“改名接口”
- 前端 auth slice 在登录后和恢复 session 时使用这个 canonical payload

这也能顺手填掉 `tests/contracts/test_auth_contract.py` 已经在期待 `/api/auth/me` 的现有裂缝。

### Pattern 3: 生词本复习应直接扩展 `WordbookEntry`，不需要新建独立 review table

现有 `WordbookEntry` 已经是每个用户每个词条的 canonical record，`WordbookEntrySource` 已记录来源句与来源课次。Phase 9 最稳的最小升级路径是直接在 `WordbookEntry` 追加：

- `next_review_at`
- `last_reviewed_at`
- `review_count`
- `wrong_count`
- `memory_score`

并把当前 `status` 从“主要靠手动切换”改为“由 `memory_score >= 0.85` 自动映射到 mastered / active”。这样：
- 列表页还能复用当前 `status` 过滤逻辑
- due queue 只需要 query `next_review_at <= now`
- API 和 UI 都不需要第二套词条身份

### Pattern 4: 复习调度算法要封装成服务层模块，不把公式散落在 router / panel

不管最终采用多接近 FSRS 的内部规则，Phase 9 都不该把“重来 / 很吃力 / 想起来了 / 很轻松”到下一次复习时间的映射写在 router 或 React 组件里。最佳结构是新增一个独立服务模块，例如：

- `app/services/wordbook_review_scheduler.py`

由它负责：
- 初始化新词条的复习状态
- 接收 review grade 更新 `memory_score / wrong_count / review_count / next_review_at`
- 输出列表展示所需的百分比与 mastered 标记

这样后续更换算法只改一层。

### Pattern 5: 个人中心适合新 panel，不适合挤进 auth modal 或管理台

当前学习壳已经是 panel-based：
- `history`
- `wordbook`
- `upload`
- `redeem`

用户要求“个人中心放侧边栏最上方，并把兑换码充值并进去”，这最适合新增 `account` panel：
- 在 `LearningShellSidebar.jsx` 中把 `account` 放在 `history` 前
- 在 `LearningShellPanelContent.jsx` 中新增 `AccountPanel`
- `RedeemCodePanel` 作为子区块被 AccountPanel 复用
- 删除独立 `redeem` panel

这比另起独立路由或散落按钮更契合当前学习壳模式。

### Pattern 6: Bottle 命名收口要同时改“硬编码 UI”与“元数据来源”

`UploadPanel.jsx` 里还有硬编码 `本机识别 / 云端识别`；`asrModels.js` 和 `asr_model_registry.py` 则已经部分是 `Bottle 2.0`。要彻底达成“旧词连副文案都不保留”的要求，必须同步改三层：

- 上传页模型卡与桌面引导文案
- 前端 fallback model metadata
- 后端模型 descriptor / runtime note

只改其中一层，旧词仍可能从 API 或 fallback 文案漏出来。

---

## Key File Findings

### `app/models/user.py`
- 只有 `email / password_hash / is_admin / created_at / last_login_at`
- 没有用户名字段，也没有 profile/update 相关 metadata

### `app/api/routers/auth.py`
- 只有 `POST /register`、`POST /login`、`POST /refresh`、`POST /logout`、`POST /desktop-token-login`
- 注册仍使用 `AuthRequest(email, password)`，没有 username
- 没有 `GET /me` 或 profile patch

### `tests/contracts/test_auth_contract.py`
- 已经尝试 `GET /api/auth/me`
- 当前 router 里没有对应接口，说明 Phase 9 增加当前用户读取属于“补现有 contract 缺口”

### `frontend/src/store/slices/authSlice.ts`
- `normalizeStoredUser()` 只接受 `id / email / is_admin`
- localStorage 读取也只恢复这三项
- 一旦 username 成为产品主身份，auth store 必须扩容

### `frontend/src/features/auth/shared/SharedAuthPanel.tsx`
- 现在是“同一张卡片 + 登录按钮 + 注册按钮”
- 没有页签、没有 username 输入、没有注册/登录字段分离
- 结构足够集中，适合增量重构成 tabbed auth surface

### `frontend/src/app/learning-shell/LearningShellSidebar.jsx`
- 当前 panel 顺序是 `history -> wordbook -> upload -> redeem`
- `兑换码充值` 仍作为独立 panel 出现
- 没有个人中心入口

### `frontend/src/app/learning-shell/LearningShellPanelContent.jsx`
- 独立挂载了 `WordbookPanel`、`UploadPanel`、`RedeemCodePanel`
- 删除 `redeem` 并加入 `account` 的改动面非常清晰

### `app/models/lesson.py` + `app/services/wordbook_service.py`
- `WordbookEntry` 目前只有：
  - entry text / normalized text / type / status
  - latest sentence / latest lesson / latest collected time
- `WordbookEntrySource` 已经保存来源句和重复收录时间
- 当前 service 只有 collect/list/update status/delete，没有任何 review queue 或 review grade

### `frontend/src/features/wordbook/WordbookPanel.jsx`
- 当前展示：最新中英语境、来源课程、收录记录、最近收录
- 当前操作：标记掌握 / 恢复生词 / 删除
- 没有 due review 入口，没有 review flow，没有 memory score 展示

### `frontend/src/features/upload/UploadPanel.jsx`
- 仍然直接包含 `本机识别`、`云端识别`
- 桌面端引导 dialog 文字仍以旧词和“云端识别”叙述为主

### `frontend/src/shared/lib/asrModels.js` + `app/services/asr_model_registry.py`
- 两边都已经有 `Bottle 2.0` / `Bottle 1.0` 主显示名
- 但 subtitle / note 仍偏技术化，且前端硬编码 UI 没完全跟上

---

## Anti-Patterns to Avoid

- **不要把用户名改造做成“前端字段先上，后端之后再补”。** 这会让 auth state、current user 和 rename 行为立刻失真。
- **不要新建第二张“wordbook_reviews” 主表来复制词条身份。** 现有 `WordbookEntry` 已是 canonical record。
- **不要把 due queue 实现成纯前端筛选。** 需要后端 query `next_review_at <= now`，否则排序、一致性和未来分页都会混乱。
- **不要保留手动“标记掌握”作为主交互。** 用户已经锁定“以记忆率为主的掌握表达”，`status` 只能退居内部实现。
- **不要只改 UploadPanel 的标题。** 旧词会从 metadata 或 dialog 文案继续漏出来。
- **不要忘记 `app/static` 同步。** Phase 9 的 09-04 属于网页端表面交付。

---

## Common Pitfalls

### Pitfall 1: username 唯一性只靠数据库裸唯一索引
**What goes wrong:** `Alice` / `alice` / 全角半角变体 / 连续空白昵称产生意外重复或用户不可理解的冲突。  
**How to avoid:** 引入统一 normalization helper，并把唯一性绑定到 `username_normalized`。

### Pitfall 2: current user API 只在登录成功时返回，刷新或改名后状态漂移
**What goes wrong:** 用户改名后，侧边栏和 localStorage 仍显示旧名字。  
**How to avoid:** 让 `/api/auth/me` 成为前端 canonical hydration source，并在 rename 成功后统一刷新 auth store。

### Pitfall 3: 复习算法直接塞进 router
**What goes wrong:** later tuning 时要同时改 router、service、panel，行为不可测。  
**How to avoid:** 把调度封装成 scheduler service，router 只收 grade 并返回 payload。

### Pitfall 4: 记忆率达到阈值时 UI 切成“已掌握”，但后端 status 没同步
**What goes wrong:** 列表筛选、统计、mastered 视图和 UI 呈现不一致。  
**How to avoid:** `memory_score >= 0.85` 时服务层同步更新 `status = mastered`，低于阈值回落时回到 `active`。

### Pitfall 5: 兑换码入口被搬到个人中心，但旧 panel 仍残留
**What goes wrong:** 用户可以从两个入口访问同一功能，信息架构继续分裂。  
**How to avoid:** 删除 `redeem` panel 注册和侧边栏 item，只在 AccountPanel 中复用 `RedeemCodePanel`。

### Pitfall 6: 上传页标题改成 Bottle 命名，但 subtitle/note 仍暴露旧词
**What goes wrong:** 用户仍然看见“本机识别 / 云端识别”副文案，违背 context。  
**How to avoid:** contract test 直接断言 UploadPanel 和 model metadata 中不再出现这两个旧词。

---

## Code Examples

### Current auth contract gap

`tests/contracts/test_auth_contract.py` 已在尝试读取当前用户：

```py
response = authenticated_client.get("/api/auth/me")
```

但 `app/api/routers/auth.py` 目前还没有这个 route。  
这说明 09-01 补 `GET /api/auth/me` 既是 roadmap scope，也是现有 contract 缺口修复。

### Current wordbook model is already a good canonical anchor

`WordbookEntry` 已经有：

```py
entry_text
normalized_text
status
latest_sentence_en
latest_sentence_zh
latest_collected_at
```

因此 Phase 9 最优路径是继续往这张表加 review metadata，而不是复制身份到新表。

### Current sidebar still exposes standalone redeem

`LearningShellSidebar.jsx` 目前有：

```jsx
{
  key: "redeem",
  title: "兑换码充值",
  path: "/redeem",
}
```

这正是 09-02 需要删除并并入个人中心的明确入口。

### Current upload surface still leaks old naming

`UploadPanel.jsx` 当前仍包含：

```jsx
title: "本机识别"
title: "云端识别"
```

所以 09-04 不是抽象优化，而是具体字符串清理与元数据对齐。

---

## Validation Architecture

Phase 9 的验证应覆盖四类事实：

1. **身份合同存在**
   - `users` 增加 username 及唯一规范化字段
   - `/api/auth/me` 和 profile rename API 存在
   - `UserResponse` / auth store 已含 username

2. **个人中心取代独立充值入口**
   - 学习侧边栏顶部有 account panel
   - `redeem` panel 注册被删除
   - AccountPanel 内复用兑换码充值能力

3. **生词本复习链路存在**
   - `WordbookEntry` 有 review metadata
   - due queue API 可返回到期项
   - review action API 能根据四档 grade 更新 `next_review_at`
   - WordbookPanel 显示 `开始复习`、`下次复习时间`、`记忆率`

4. **网页端旧词彻底移除**
   - UploadPanel 用户可见文本不再出现 `本机识别 / 云端识别`
   - model metadata 用户面向字段也不再暴露旧词
   - `npm --prefix frontend run build:app-static` 通过

---

## Sources

### Primary (HIGH confidence)
- `.planning/workstreams/milestone/phases/09-wordbook-account-and-web-bottle-boundary/09-CONTEXT.md`
- `.planning/workstreams/milestone/ROADMAP.md`
- `.planning/workstreams/milestone/REQUIREMENTS.md`
- `app/models/user.py`
- `app/schemas/auth.py`
- `app/api/routers/auth.py`
- `app/api/serializers.py`
- `frontend/src/features/auth/shared/SharedAuthPanel.tsx`
- `frontend/src/features/auth/components/AuthPanel.jsx`
- `frontend/src/store/slices/authSlice.ts`
- `frontend/src/app/learning-shell/LearningShellSidebar.jsx`
- `frontend/src/app/learning-shell/LearningShellPanelContent.jsx`
- `app/models/lesson.py`
- `app/schemas/wordbook.py`
- `app/api/routers/wordbook.py`
- `app/services/wordbook_service.py`
- `app/repositories/wordbook.py`
- `frontend/src/features/wordbook/WordbookPanel.jsx`
- `frontend/src/features/upload/UploadPanel.jsx`
- `frontend/src/shared/lib/asrModels.js`
- `app/services/asr_model_registry.py`
- `tests/contracts/test_auth_contract.py`
- `tests/integration/api/test_wordbook_api.py`

### Secondary (MEDIUM confidence)
- [Anki Manual - FSRS](https://docs.ankiweb.net/deck-options#fsrs)
- [FSRS Algorithm Wiki](https://raw.githubusercontent.com/wiki/open-spaced-repetition/awesome-fsrs/The-Algorithm.md)
- [py-fsrs](https://github.com/open-spaced-repetition/py-fsrs)
- [MaiMemo 2025 Experiment](https://memodocs.maimemo.com/docs/2025_experiment)
- `frontend/package.json`
- `migrations/versions/20260322_0027_wordbook_storage.py`
- `tests/fixtures/auth.py`

---

## Metadata

**Research scope:**
- Core technology: FastAPI auth/profile APIs, SQLAlchemy wordbook schema evolution, shared React learning shell
- Codebase surface: auth router/store, sidebar/panel shell, wordbook stack, upload naming surface, tests, migrations
- Risks explored: username uniqueness normalization, auth-state drift after rename, overbuilding a new SRS system, old Bottle naming leakage

**Confidence breakdown:**
- Backend identity API strategy: HIGH
- Wordbook schema and queue strategy: HIGH
- Account center integration strategy: HIGH
- Bottle naming cleanup strategy: HIGH

**Research date:** 2026-03-28
**Valid until:** 2026-04-27

---

*Phase: 09-wordbook-account-and-web-bottle-boundary*
*Research completed: 2026-03-28*
*Ready for planning: yes*
