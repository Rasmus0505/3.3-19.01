# Unlock — English Learning

## What This Is

Unlock (formerly Bottle) is an English learning product built around the “Unlock Anything” principle: users bring any English material — video, audio, text, PDF, webpage, subtitles, or even a photo of a textbook — and the platform transforms it into personalized i+1 learning content through AI-powered processing. The product follows Krashen's Comprehensible Input hypothesis, using CEFR-based vocabulary analysis to ensure learners always work at their optimal difficulty level.

The product is intentionally split by runtime capability: the desktop client is the full-power experience, while the web app provides the strongest browser-safe subset. The platform should stay easy for non-technical learners while keeping heavy media work off your server whenever possible.

## Core Value

Users can unlock any English material into personalized i+1 learning packs — reading, vocabulary, comprehension, and dictation — without needing technical setup, powered by AI across the full pipeline.

## Current Milestone: v3.0 — Unlock Anything

**Goal:** 产品从 Bottle 改名为 Unlock，实现”任意材料输入 -> AI 全链路处理 -> 完整学习包 + 成长可视化”的闭环体验，同时打造比赛级 demo 展示效果。

**Target features:**
1. **品牌升级** — 产品从 Bottle 改名为 Unlock，更新前端品牌、标题、Logo 等全部用户可见表面
2. **多模态材料输入** — 支持网页链接抓取、PDF 导入、字幕文件（.srt/.vtt）导入、图片 OCR 四种新输入源进入阅读/学习流程
3. **完整学习包** — 从阅读包扩展为完整学习包：i+1 阅读包 + LLM 生成理解测验（选择/填空/排序）+ 词汇卡片（i+1 词汇提取 + 例句 + AI 场景图）+ 听写课程生成
4. **阅读包完善** — 词汇解释面板、历史回看与难度徽章、生词本收词、下一步学习动作，融入学习包体系
5. **学习仪表盘** — CEFR 等级进度条与词汇量增长曲线、每日学习热力图（GitHub 风格）、”已解锁 X 篇材料，掌握 Y 个新词”核心统计

## Current State

<details>
<summary>v2.6 清洗 CEFR 词典数据源 归档摘要 (2026-04-06 shipped) — 点击展开</summary>

**v2.6 shipped on 2026-04-06.** 2 phases, 2 plans, 14/14 requirements complete:
- Phase 30: CEFR 词表权威修正 — fix_cefr_levels.py 执行，6,596 词等级修正（84.4%），`_vocab_version: "fixed-v1"` 生成
- Phase 31: 前后端适配验证 — vocabAnalyzer、computeCefrClassName 完全向后兼容，无代码修改

**Level distribution shift:** A1/A2/B1/B2 大幅增加，C1/C2/SUPER 相应减少，CEFR 分析精度提升。

See `.planning/milestones/v2.6-ROADMAP.md` for full phase details.
See `.planning/milestones/v2.6-REQUIREMENTS.md` for archived requirements.

</details>

<details>
<summary>v2.5 阅读板块 + Pretext CEFR 排版 归档摘要 (2026-04-05 shipped) — 点击展开</summary>

**v2.5 shipped on 2026-04-05.** 4 phases, 10 plans completed:
- Phase 26: Pretext 基础设施集成 — hook 封装、CEFR 分段合并、5000+词性能验证
- Phase 27: 阅读板块核心 UI — 方案 A 布局、Pretext 驱动渲染、响应式断点
- Phase 28: 词交互与生词本集成 — 词点击选入、多选 UI、批量加入生词本
- Phase 29: AI 重写与路由 — 重写 API、丝滑切换、IndexedDB 存储

See `.planning/milestones/v2.5-ROADMAP.md` for full phase details.
See `.planning/milestones/v2.5-REQUIREMENTS.md` for archived requirements.

</details>

<details>
<summary>v2.4 归档摘要 (2026-04-04 shipped) — 点击展开</summary>

**v2.4 shipped on 2026-04-04.** 2 phases, 8 plans, 18/18 requirements complete:
- Phase 24: CEFR 基础设施 — 后端字段、Zustand 持久化、个人中心选择器、vocabAnalyzer 集成
- Phase 25: CEFR 沉浸式展示 — CSS 基础、答题框下划线、生词本色块+动画、历史列表徽章

See `.planning/milestones/v2.4-ROADMAP.md` for full phase details.
See `.planning/milestones/v2.4-REQUIREMENTS.md` for archived requirements.

</details>

## Requirements

### Validated

- ✓ User can register and log in with email/password — existing
- ✓ User can hold balance / redeem codes / consume points — existing
- ✓ User can generate lessons from uploaded media through cloud ASR paths — existing
- ✓ Web and desktop now share a stable Bottle 2.0 direct-upload generation path — validated in Phase 01
- ✓ Product now exposes explicit desktop guidance instead of server fallback for Bottle 2.0 edge cases — validated in Phase 01
- ✓ Bottle 2.0 direct-upload now self-heals once on DashScope `FILE_403_FORBIDDEN` failures and surfaces exhausted retries as a dedicated cloud file-access failure — validated in Phase 01.1
- ✓ User can enter lesson-based learning and spelling practice flows — existing
- ✓ Admin can inspect health, pricing, and operational controls — existing
- ✓ Desktop client, local helper, and local ASR bundle flows already exist in the codebase — existing
- ✓ Desktop client exposes the complete product capability set, including Bottle 1.0 local generation, Bottle 2.0 cloud generation, and link-to-video generation — validated in Phase 02
- ✓ Non-technical learners can complete generation without manual ffmpeg/model/key steps — validated in Phase 02
- ✓ Desktop helper auto-starts on Electron launch; users never perceive helper, model, or ASR source — validated in Phase 02
- ✓ Generated lessons from Bottle 1.0 and Bottle 2.0 become consistent learning artifacts — validated in Phase 3
- ✓ Users can enter spelling/lesson practice from generated content regardless of generation source — validated in Phase 3
- ✓ Desktop users can import media from supported links through local tooling — validated in Phase 4
- ✓ Admin shell restructured: user-first workflow with billing nested under users workspace, dedicated troubleshooting route — validated in Phase 5
- ✓ Billing editor is pricing-only: runtime tuning controls removed; admin and public billing APIs aligned — validated in Phase 5
- ✓ Admin troubleshooting center exposes Bottle 1.0 and Bottle 2.0 runtime readiness alongside system health and logs — validated in Phase 5
- ✓ Getting Started guide removed from web app: no dead onboarding overlay or orphaned auth exemptions — validated in Phase 6
- ✓ Billing UX improved: insufficient balance shows "充值后生成" recovery button; estimate display simplified — validated in Phase 6
- ✓ Bottle 1.0 / Bottle 2.0 benchmark, naming, CTA, and monetization contract is now fixed in reusable Phase 7 specs — validated in Phase 7
- ✓ Web-facing Bottle boundary now has a canonical rule set: Bottle 2.0 is the default web path, Bottle 1.0 is visible but desktop-only, and balance recovery stays on recharge — validated in Phase 7
- ✓ Learning experience is now stable for repeated sentence listening, fixed speed switching, and immersive shortcut/fullscreen/mask combinations — validated in Phase 8
- ✓ Wordbook now supports due review, review progress, and context-rich revision instead of only passive collection — validated in Phase 09
- ✓ Account onboarding now uses unique usernames while login remains email-first and low risk — validated in Phase 09
- ✓ Web upload/account surface now keeps Bottle 1.0 desktop-only while presenting Bottle 2.0 as the web-first path with Bottle-only naming — validated in Phase 09
- ✓ Admin operators now work in a Chinese-first, yuan-first backend with clearer model naming and cleaner information architecture — validated in Phase 10
- ✓ Pricing, recharge, and desktop download paths now use the finalized upload-surface copy, recharge recovery, desktop guidance, and static-web verification flow — validated in Phase 11
- ✓ Desktop public-link import is now productized as a formal Memo-style workflow with explicit public-link promise, failure boundary, and release checklist — validated in Phase 07.1
- ✓ Bottle 1.0 + link-import desktopSourcePath bug fixed: IPC serialization no longer strips the Object.defineProperty field — validated in Phase 11-04
- ✓ Bottle 2.0 + link-import thumbnail bug fixed: yt-dlp thumbnail flows through poll response into lesson cover_data_url with file-extraction fallback — validated in Phase 11-04
- ✓ Desktop stable-only release channel established with signed NSIS installer — validated in Phase 13
- ✓ Desktop delta update system productized for both program and ASR model/resources — validated in Phase 14
- ✓ Desktop runtime security boundaries hardened: 31 preload methods audited, renderer sandbox enforced, openExternalUrl whitelist active — validated in Phase 15
- ✓ Announcement system fully operational: CRUD, changelog/banner/modal delivery, admin management UI — validated in Phase 16
- ✓ Wordbook review UX overhauled: due queue, mastery feedback, forgetting curve scheduling, batch ops, translation dialog — validated in Phase 17
- ✓ Lightweight hint system applied across key buttons and ambiguous actions — validated in Phase 18
- ✓ Immersive learning bug fixes: input-preserving rate/loop toggle, prev sentence TTS fallback, answer box color differentiation — validated in Phase 19
- ✓ Wordbook entry enhancements: independent translation block above each entry, Web Speech API pronunciation button — validated in Phase 20
- ✓ Material import UX: default link tab, simplified copy, auto-fill title, shortcut two-row layout — validated in Phase 21
- ✓ Subtitle mask position reset (centered on new video, enabled state persists across videos) and link restore enhancement — validated in Phase 23
- ✓ CEFR infrastructure: backend cefr_level field (DB + PATCH API), frontend Zustand state + localStorage persistence, AccountPanel CEFR level selector (A1-C2 RadioGroup), vocabAnalyzer integration with localStorage cache and setTimeout(0) chunking — validated in Phase 24
- ✓ CEFR immersive display: CEFR underlines on answer box word slots, wordbook CEFR color bands, scale + border flash animation, history list CEFR distribution badges — validated in Phase 25
- ✓ CEFR vocabulary cleaned with authoritative CEFR-J levels: 6,596 words corrected (84.4%), 798 SUPER→valid upgrades, `_vocab_version: "fixed-v1"` prevents silent fallback — validated in Phase 30
- ✓ CEFR vocabulary frontend compatibility: vocabAnalyzer loads fixed vocab, computeCefrClassName correct for all levels, backward compatible with no code changes — validated in Phase 31

### Active

<!-- v3.0 — Unlock Anything -->
- [ ] 产品从 Bottle 改名为 Unlock，前端品牌、标题、Logo 等全部用户可见表面更新
- [ ] 用户可通过网页链接、PDF、字幕文件、图片 OCR 四种新输入源进入阅读/学习流程
- [ ] 用户可从学习包获得 LLM 生成的理解测验（选择/填空/排序题）
- [ ] 用户可获得 i+1 词汇卡片，含例句和 AI 生成场景图
- [ ] 用户可从阅读包直接生成听写课程
- [ ] 用户可在阅读包内查看词汇解释面板、从中收词到生词本
- [ ] 用户可在历史中回看阅读包，带难度徽章和生成状态
- [ ] 用户可在学习仪表盘查看 CEFR 进度、词汇增长、学习热力图和解锁统计

### Out of Scope

- User-provided ASR API key configuration — platform-managed billing and keys keep the experience simple
- Full browser parity for local tooling features — browser/runtime constraints are acceptable where local tooling is required
- Making the server the primary media processing worker — this conflicts with cost and capacity limits
- Introducing subscriptions or membership bundles — this milestone focuses on per-use conversion improvements first
- Letting web users actually execute Bottle 1.0 — Bottle 1.0 remains desktop-only by product boundary
- Replacing email login with username login — higher auth churn risk than this milestone needs

## Context

- Existing brownfield codebase already contains FastAPI backend, React/Vite web app, Electron desktop client, billing/redeem flows, admin surfaces, lesson generation, and learning flows.
- Desktop capability already includes local helper patterns, local ASR model management, bundled ffmpeg/yt-dlp resources, and URL import building blocks.
- Web and desktop already share a large part of the frontend and product model, which should be preserved rather than split into separate products.
- Current product direction is not to rebuild from scratch, but to sharpen product boundaries, stabilize generation flows, reduce server load, and improve the learner experience.
- Market reference pass for this milestone is based on official materials checked on 2026-03-28 from LingQ, Migaku, FluentU, and Glossika. Shared patterns: sentence-centric repetition, one-click vocabulary capture, due-review loops, strong scenario-based plan positioning, and premium upsell through convenience rather than raw feature count.
- v2.2 completed desktop publishing pipeline, announcement system, and wordbook review UX overhaul. v2.3 focuses on bug fixes and UX polish in learning and import flows.
- Rewordify.com核心参考（2026-04-06调研）：分级难度系统（6级）+ 多显示模式（原文/重写并排、点击原词对照、词汇列表面板）+ 颜色高亮替代下划线（黄/紫、绿/浅红、蓝/橙）。内置50,000+简化词数据库。与本产品差异：CEFR词汇表（fixed-v1）可精准识别i+1词汇，比频率统计更可靠。
- OpenMAIC 本地参考（2026-04-10梳理）：最值得复用的是“输入材料 -> 分阶段生成 -> 资产化结果”的比赛展示方式，包括诊断前置、阶段可视化、生成中间态和历史资产卡片；不复用其多智能体课堂范围。
- Immersive learning already uses a reducer-driven state machine with explicit loop/rate/display contracts (Phase 8) — bug fixes in this milestone should not regress that architecture.
- Wordbook already supports word-level translation field and pronunciation button — v2.3 extends these to display in the wordbook panel above each entry.
- Upload surface already has link/file tabs — v2.3 changes the default tab and redesigns the link-import flow with a configuration modal.

## Constraints

- **Server Capacity**: Avoid heavy server-side media conversion and long-running ASR workloads — server performance is limited.
- **Local-First Processing**: 所有 CEFR 分析、Pretext 测量、AI 重写结果缓存均在用户本地（浏览器 localStorage + IndexedDB）执行，不上传原文到服务器。服务器仅负责存储最小必要数据（重写结果 id + 引用关系）。
- **User Simplicity**: Learners should not need to understand API keys, model setup, ffmpeg, or yt-dlp.
- **Runtime Split**: Desktop must be the complete experience; web should provide only what browsers can reliably support.
- **Web Delivery Contract**: 凡涉及网页端前端行为或路由的改动，完成标准必须包含同步并验证 `app/static`；仅修改 `frontend/src` 不视为网页端已完成。
- **Billing**: Bottle 1.0 and Bottle 2.0 are both paid capabilities with prices managed in admin tooling.
- **Brownfield Preservation**: Existing auth, wallet, admin, lesson, and desktop foundations should be optimized, not discarded.
- **Auth Risk Control**: Username can expand identity and profile UX, but email/password remains the only login path.
- **Desktop Security Boundary**: "避免核心代码泄露" means raising extraction and reuse cost for packaged desktop logic and assets, not claiming perfect anti-reverse-engineering guarantees.
- **Update Reliability**: Desktop update flows must fail safely and explain recovery clearly; a broken updater is worse than a manual reinstall path.
- **Immersive Architecture**: Immersive state machine contract from Phase 8 must be preserved — bug fixes should not remove reducer structure or re-introduce ad-hoc state transitions.
- **Wordbook Backward Compatibility**: Wordbook review flow, due queue, and mastery scheduling from Phase 17 must be preserved — enhancements should layer on top, not replace.

## Milestone: v2.8 Summary

**Shipped:** 2026-04-10 (partial — Phase 37 merged into v3.0)
**Phases:** Phase 35, 36 (completed); Phase 37 requirements merged into v3.0
**Key outcomes:**
- Material diagnostic card: pre-generation CEFR analysis with difficulty estimation and i+1 word counts
- Pipeline orchestrator: staged generation flow with visible progress (parse → judge → plan → rewrite → assemble)
- Reading pack asset: persistent pack with original/i+1/comparison views, IndexedDB storage, session recovery
- Phase 37 (learning handoff) requirements carried forward to v3.0 milestone

## Milestone: v2.7 Summary

**Shipped:** 2026-04-06
**Phases:** Phase 32, 33, 34
**Key outcomes:**
- Rewrite persistence: IndexedDB stores original text, rewritten text, mappings, and per-article view mode
- Rewrite UI enhancement: yellow highlight blocks replaced underlines for rewritten spans, with hover/tooltips and selection overlay support
- Prompt optimization: structured simplify endpoints and token-estimate banner reduced the "one click rewrite" blind spot, but the overall experience is still a rewrite tool rather than a full reading-generation workflow

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Desktop client is the primary product surface for full generation capabilities | Desktop can safely host local models, ffmpeg, yt-dlp, and local helper workflows | ✅ Validated in Phase 02 |
| Web app centers on Bottle 2.0 cloud generation | Browser users still need a useful path, but browser-local heavy tooling is not reliable enough | ✅ Validated in Phase 01 & 02 |
| Platform manages ASR keys instead of end users | Learners are non-technical and should pay with points/redeem codes rather than configure secrets | ✅ Validated |
| Server should stay light and avoid becoming the media processing bottleneck | Cost and infrastructure limits make centralized heavy processing a bad default | ✅ Validated in Phase 01 & 01.1 |
| Generated media should become lesson/practice artifacts regardless of generation path | Users care about learning outcomes, not the underlying ASR route | ✅ Validated in Phase 3 |
| v2.1 should benchmark market patterns before inventing new learning/admin flows | The user explicitly wants product references first, not isolated local redesign | ✅ Validated in Phase 7 |
| Username is a unique profile identity, not a login credential | This improves onboarding and management without expanding auth risk | ✅ Validated in Phase 9 |
| Web may explain Bottle 1.0 but may not execute it | This preserves the desktop-only boundary while still creating a conversion path | ✅ Locked in Phase 7 |
| Admin monetary UI should standardize on yuan | Mixed cents/points language increases operator confusion | ✅ Validated in Phase 10 |
| Monetization improvements stay inside pay-per-use copy and CTA work, not subscriptions | Competitor benchmarks favor clearer scenario guidance over more package complexity for this milestone | ✅ Locked in Phase 7 |
| Immersive playback state should be reducer-driven with explicit loop/rate/display contracts | The existing page had too many overlapping state transitions for replay, navigation, fullscreen, and mask controls | ✅ Validated in Phase 8 |
| Final conversion landing should use exact model-card and blocked-state copy instead of adding new marketing layers | The final upload-surface pass had to follow the locked context precisely, including recharge, desktop, and complex-media wording | ✅ Validated in Phase 11 |
| Desktop public-link import is a formal product capability with explicit support boundary | Public links are the primary onboarding path; helper/yt-dlp internals stay behind the scenes | ✅ Validated in Phase 07.1 |
| Object.defineProperty fields do not survive Electron IPC serialization — always use plain data fields | The desktopSourcePath field was silently dropped causing link-import failures | ✅ Validated in Phase 11-04 |
| Desktop stable-only channel with signed installer for v2.2 release | A/B or dev channels introduce user confusion for a learning product; stable-only simplifies support | ✅ Validated in Phase 13 |
| Announcement system delivers changelog/banner/modal from admin CRUD | Operators need a way to communicate updates to learners without app store dependencies | ✅ Validated in Phase 16 |
| Wordbook review uses spaced-repetition scheduling with again/good grading | Simple again/good with calculated next-review matches learner expectations without complexity of full SM-2 | ✅ Validated in Phase 17 |
| Immersive answer box uses yellow for AI/hint content, green for user-typed content | Color differentiation helps learners see what they typed vs. what was suggested | ✅ Validated in Phase 19 |
| autoAdvanceGuard: postAnswerReplayState !== "idle" blocks sentence advance during typing | Prevents unintended replay when switching rate/loop mid-typing | ✅ Validated in Phase 19 |
| TTS three-tier fallback: clip → Web Speech API (en-US) → error message | Graceful degradation when previous sentence audio unavailable | ✅ Validated in Phase 19 |
| Wordbook translation block: bg-muted/20, independent visual area above each entry | Clean separation without changing card layout or height | ✅ Validated in Phase 20 |
| Wordbook pronunciation: Web Speech API (en-US), spinner while speaking, error icon 2s auto-recover | Zero-cost, browser-native, fails gracefully | ✅ Validated in Phase 20 |
| Upload default tab: DESKTOP_UPLOAD_SOURCE_MODE_LINK | Link import is the common path; file upload is secondary | ✅ Validated in Phase 21 |
| Subtitle mask: prevLessonIdRef forces center on new lessonId | Ensures mask position never persists across different videos | ✅ Validated in Phase 23 |
| Subtitle mask: enabled state persists via localStorage | Verified existing code implements D-03 (enabled persistence) | ✅ Validated in Phase 23 |
| Link restore: source_url check + hasLessonMedia cache check before download | Prevents unnecessary re-download if media already cached locally | ✅ Validated in Phase 23 |
| CEFR level stored in `cefr_level` column (users table, default "B1") | Single source of truth for user's CEFR level, survives logout/login | ✅ Validated in Phase 24 |
| PATCH /api/auth/profile handles `cefr_level` field | Keeps CEFR update in same endpoint as username update | ✅ Validated in Phase 24 |
| `USER_CEFR_LEVEL_KEY = "BOTTLE_CEFR_LEVEL"` in localStorage | Local persistence of CEFR level, works offline | ✅ Validated in Phase 24 |
| PATCH API + localStorage dual-write on CEFR level change | Server-first with local fallback; syncs on next online session | ✅ Validated in Phase 24 |
| Unknown words (not in cefr_vocab.json) tagged as "SUPER" level | Ensures unknown words always appear as hard regardless of user level | ✅ Validated in Phase 24 |
| `cefr_analysis_v1:{lessonId}` as localStorage cache key | Simple versioned key, sufficient for MIT-licensed COCA vocab | ✅ Validated in Phase 24 |
| SUPER-level words always render as above-i+1 (red), never i+1 | SUPER is beyond all standard CEFR levels per Phase 24 context | ✅ Validated in Phase 25 |
| `computeCefrClassName` treats null/undefined as `cefr-mastered` (gray) | Words not in vocab table appear gray, not red — explicit user requirement | ✅ Fixed in Phase 25 |
| Above-i+1 color: `oklch(0.58 0.24 25)` — distinctly red, not orange | Visual correction after user feedback | ✅ Fixed in Phase 25 |
| Wordbook success animation: scale (200ms) + green border flash (350ms) | Scale distinguishes "added to wordbook" from CEFR difficulty color | ✅ Validated in Phase 25 |
| `mergeLessonCardMeta` via Zustand `getState()` (factory-pattern slice) | Workaround for lessonSlice factory; matches ImmersiveLessonPage pattern | ✅ Validated in Phase 25 |
| CEFR 词表用 CEFR-J Vocabulary Profile 替换 rank-based 等级 | 官方权威词表覆盖约 14% 词汇，84.4% 匹配词等级被修正，准确性显著提升 | ✅ Validated in Phase 30 |
| `_vocab_version: "fixed-v1"` 顶级字段 | 防止静默回退到 SUPER；启用缓存刷新；前端 VocabAnalyzer 可校验版本 | ✅ Validated in Phase 30 |
| `pos_entries` 数组结构（每词多词性条目） | 从最低 POS 派生 primary level；857 词含多 POS（如 run noun B1 + verb A1）；向后兼容 | ✅ Validated in Phase 30 |
| 未匹配词保留 `_source: "rank-based"` 标记 | 区分已验证（CEFR-J）vs 估算（频率）等级；用户可知数据置信度 | ✅ Validated in Phase 30 |
| 前端无需修改代码，完全向后兼容 | vocabAnalyzer.js 和 CefrBadge.jsx 与新词表完全兼容；SessionStorage 缓存自动刷新 | ✅ Validated in Phase 31 |
| 重写词汇黄色色块UI（覆盖式背景）+ tooltip原词对照 | 色块比下划线更明显，悬停显示原词符合Rewordify交互模式 | 🔄 v2.7 |
| 重写结果按文章维度持久化到IndexedDB，阅读历史自动加载 | 避免重复请求API，用户可在任意时间切换原文/重写版 | 🔄 v2.7 |
| Rewordify参考：分级难度+多显示模式+点击原词对照，本产品CEFR系统更精准 | Rewordify用频率统计，本产品用CEFR词汇表识别i+1词汇，可精准定位简化目标词 | 🔄 v2.7 |
| 阅读板块定位升级为“任意材料 -> i+1 阅读包”而不是“单次重写结果” | 更适合比赛展示，也更符合产品想让用户把兴趣材料转为可理解输入的核心定位 | 🔄 v2.8 |
| 阅读生成必须显式展示诊断与阶段过程 | OpenMAIC 证明阶段感会显著提升可理解性和演示表现，黑盒 rewrite 不足以支撑比赛叙事 | 🔄 v2.8 |
| OpenMAIC 作为编排与展示参考，而不是功能复制目标 | 复用其“输入材料 -> 分阶段生成 -> 资产化结果”的结构，避免把 Bottle 漂移成多智能体课堂产品 | 🔄 v2.8 |
| 阅读结果以”阅读包资产”持久化，而不是只保存 rewrittenText | 历史回看、对照视图、词汇解释、学习接力都更容易围绕 pack 组织 | 🔄 v2.8 |
| 产品从 Bottle 改名为 Unlock | “Unlock Anything” 是产品核心叙事，品牌名直接体现”解锁任意材料”的价值主张，也更适合比赛展示 | 🔄 v3.0 |
| v3.0 学习包 = 阅读包 + 理解测验 + 词汇卡片 + 听写课程 | 单一阅读包不足以展示完整学习闭环，四种输出覆盖读、测、记、写四个学习维度 | 🔄 v3.0 |
| 词汇卡片配 AI 生成场景图 | 图片模型是 AI 赋能的重要展示点，场景图增强词汇记忆效果 | 🔄 v3.0 |
| 多模态输入：网页/PDF/字幕/OCR | 强化”Anything”概念，越多入口越能体现核心价值 | 🔄 v3.0 |
| AI 对话练习推到 v3.0 之后 | v3.0 范围已经足够大，对话练习需要完整的 ASR+SOE+TTS+LLM 链路，独立里程碑更稳妥 | 🔄 v3.0 scope decision |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-10 — Milestone v3.0 Unlock Anything started*
