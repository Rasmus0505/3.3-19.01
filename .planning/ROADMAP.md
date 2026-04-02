# Roadmap: Bottle English Learning

## Milestones

- ✅ **v1.0 基础能力稳定化** — Phases 1, 1.1, 2 (shipped 2026-03-27)
- ✅ **v1.1** — Phases 2.1, 3, 4 (shipped 2026-03-27)
- ✅ **v2.0** — Phases 5, 6 (shipped 2026-03-28)
- ✅ **v2.1 优化学习体验和管理体验** — Phases 7, 7.1, 8, 9, 10, 11, 12 (shipped 2026-03-31)
- ✅ **v2.2 桌面发布与体验收口** — Phases 13, 14, 15, 16, 17, 18 (shipped 2026-04-02)
- 🚧 **v2.3 学习体验与导入流程优化** — Phases 19, 20, 21, 22, 23

## Phases

<details>
<summary>✅ v1.0 基础能力稳定化 (Phases 1, 1.1, 2) — SHIPPED 2026-03-27</summary>

- [x] Phase 1: Shared Cloud Generation (3/3 plans) — completed 2026-03-26
- [x] Phase 1.1: Fix ASR 403 File Access Failures (2/2 plans) — completed 2026-03-27
- [x] Phase 2: Desktop Local Generation (3/3 plans) — completed 2026-03-27

_See: `.planning/milestones/v1.0-ROADMAP.md` for full phase details_

</details>

<details>
<summary>✅ v1.1 (Phases 2.1, 3, 4) — SHIPPED 2026-03-27</summary>

- [x] Phase 2.1: Admin Bottle 1.0 Settings & Billing Cleanup (3/3 plans) — completed 2026-03-27
- [x] Phase 3: Lesson Output Consistency (3/3 plans) — completed 2026-03-27
- [x] Phase 4: Desktop Link Import (2/2 plans) — completed 2026-03-27

_See: `.planning/milestones/v2.0-ROADMAP.md` for archived v1.1 phase details_

</details>

<details>
<summary>✅ v2.0 — Billing, Admin & Polish (Phases 5, 6) — SHIPPED 2026-03-28</summary>

- [x] Phase 5: Billing and Admin Alignment (3/3 plans) — completed 2026-03-28
- [x] Phase 6: Product Polish and Fallbacks (2/2 plans) — completed 2026-03-28

_See: `.planning/milestones/v2.0-ROADMAP.md` for full phase details_

</details>

<details>
<summary>✅ v2.1 优化学习体验和管理体验 (Phases 7, 7.1, 8, 9, 10, 11, 12) — SHIPPED 2026-03-31</summary>

- [x] Phase 7: 竞品研究与产品规范 (2/2 plans) — completed 2026-03-28
- [x] Phase 7.1: Memo 模式复刻与桌面媒体工作流产品化 (3/3 plans) — completed 2026-03-29
- [x] Phase 8: 沉浸学习重构 (4/4 plans) — completed 2026-03-28
- [x] Phase 9: 生词本、账号与网页模型边界 (4/4 plans) — completed 2026-03-28
- [x] Phase 10: 管理台前后端收口 (4/4 plans) — completed 2026-03-29
- [x] Phase 11: 盈利转化落地与回归收口 (3/3 plans) — completed 2026-03-30
- [x] Phase 12: 沉浸学习前端交互优化 (1/1 plan) — completed 2026-03-31

_See: `.planning/milestones/v2.1-ROADMAP.md` for full phase details_

</details>

<details>
<summary>✅ v2.2 桌面发布与体验收口 (Phases 13–18) — SHIPPED 2026-04-02</summary>

- [x] Phase 13: 桌面发布管线与签名安装包 (3/3 plans) — completed 2026-04-01
- [x] Phase 14: 桌面程序与模型增量更新产品化 (5/5 plans) — completed 2026-04-02
- [x] Phase 15: 桌面运行时边界加固 (2/2 plans) — completed 2026-04-01
- [x] Phase 16: 公告与更新日志系统 (3/3 plans) — completed 2026-04-01
- [x] Phase 17: 生词本复习主流程重做 (3/3 plans) — completed 2026-04-02
- [x] Phase 18: 生词本管理收口与站内轻提示 (4/4 plans) — completed 2026-04-02

_See: `.planning/milestones/v2.2-ROADMAP.md` for full phase details_

</details>

### 🚧 v2.3 学习体验与导入流程优化 (Phases 19–23)

- [ ] **Phase 19: 沉浸式学习 Bug 修复** — 修复固定按钮/倍速清空句子、上一句播放失败、答题框颜色区分
- [ ] **Phase 20: 生词本词条增强** — 独立翻译显示、发音播放
- [ ] **Phase 21: 素材导入 UX 优化** — 默认链接 Tab、精简文案、自动填标题、快捷键紧凑化
- [ ] **Phase 22: 导入弹窗配置与视频内容提取** — 功能开关弹窗、视频内容提取单独记录类型
- [ ] **Phase 23: 字幕遮挡板与链接恢复** — 新视频遮挡板居中、链接恢复增强

---

## Phase Details

### Phase 19: 沉浸式学习 Bug 修复

**Goal**: 沉浸式学习中已知 Bug 全部收口，用户在答题和播放过程中不再遇到句子被清空、播放静默失败、颜色显示错误等问题

**Depends on**: Nothing (first phase of v2.3)

**Requirements**: IMMERSE-01, IMMERSE-02, IMMERSE-03, IMMERSE-04

**Success Criteria** (what must be TRUE):

1. 用户在答题框输入 3 个词后切换播放倍速，已输入内容保持可见，不触发自动重播
2. 用户点击"上一句"右侧小喇叭按钮时，只有在音频实际播放成功后才显示 playing 状态；音频不可用时显示明确错误提示
3. 沉浸式学习答题框中，AI/提示生成的内容以黄色背景（#FEF3C7）显示，用户手打的内容以绿色背景（#D1FAE5）显示
4. 用户在输入句子的任意时刻切换循环开关，已输入句子内容保持可见，不触发自动重播

**Plans**: TBD

### Phase 20: 生词本词条增强

**Goal**: 生词本每个词条展示完整的翻译和发音信息，用户可独立查看翻译和播放发音

**Depends on**: Nothing (independent of Phase 19)

**Requirements**: WB-01, WB-02

**Success Criteria** (what must be TRUE):

1. 生词本每个词条卡片的翻译文字显示在该词条正上方，采用独立的视觉区块（背景色区分），而非内嵌在正文行内
2. 卡片整体高度保持一致（使用 min-h 或固定高度容器），不受翻译文字长度影响
3. 用户点击词条的发音按钮后，浏览器播放该单词/短语的发音（Web Speech API，lang='en-US'）
4. 发音按钮显示加载中状态；发音不可用时显示错误提示而非静默失败

**Plans**: TBD

**UI hint**: yes

### Phase 21: 素材导入 UX 优化

**Goal**: 素材导入界面更简洁高效，默认进入链接导入流程，文案精简无冗余

**Depends on**: Nothing (independent phase)

**Requirements**: UPLOAD-01, UPLOAD-02, UPLOAD-03, UPLOAD-04

**Success Criteria** (what must be TRUE):

1. 用户打开素材上传页时，默认选中"链接"Tab（而非文件上传 Tab）
2. 链接 Tab 的说明文案精简，冗余解释段落移除；"支持常见公开视频链接"改为输入框 placeholder 文案；底部仅保留 SnapAny 外链说明
3. 用户粘贴链接导入成功后，视频标题自动填入标题输入框，无需手动输入
4. 快捷键配置区域所有配置项在一屏内可见，采用一行紧凑布局，不再占据整行宽度

**Plans**: TBD

**UI hint**: yes

### Phase 22: 导入弹窗配置与视频内容提取

**Goal**: 用户在导入时可以选择生成方式和功能开关，视频内容提取成为独立的记录类型，历史记录可区分

**Depends on**: Phase 21

**Requirements**: UPLOAD-05, UPLOAD-06, UPLOAD-07, UPLOAD-08, UPLOAD-09, UPLOAD-10

**Success Criteria** (what must be TRUE):

1. 用户点击"导入并开始生成"后弹出 GenerationConfigModal 配置弹窗，弹窗内保留已填入的标题（用户修改过以修改后为准）
2. GenerationConfigModal 包含功能开关（翻译开关：默认 ON，自动提取词汇：默认 OFF），Toggle Switch 即时响应
3. 用户可在 English Materials（结构化课程）和 Video Content Extraction（视频内容提取）之间选择生成方式，首选 English Materials
4. 选择 Video Content Extraction 后，弹窗下方展开段落粒度/句子粒度（默认段落）、是否显示时间戳（默认 OFF）单独配置
5. 历史记录列表中，课程记录显示蓝色 badge（"课程"），内容提取记录显示琥珀色 badge（"内容提取"），支持按类型过滤
6. 桌面客户端记住链接导入视频的原始 URL，恢复时若检测到该 lesson 有 source URL，提供"按链接恢复"选项

**Plans**: TBD

**UI hint**: yes

### Phase 23: 字幕遮挡板与链接恢复

**Goal**: 字幕遮挡板位置在新视频时居中恢复且启用状态跨视频记忆；链接恢复入口更丰富

**Depends on**: Phase 22

**Requirements**: MASK-01, MASK-02

**Success Criteria** (what must be TRUE):

1. 用户加载新视频时，字幕遮挡板位置恢复到屏幕正中，不延续上一视频的位置
2. 遮挡板启用/关闭状态跨视频保持（用户关闭后新视频也关闭，用户开启后新视频也开启）
3. 遮挡板位置不跨视频记忆（每换新视频都回到居中）
4. 桌面客户端恢复视频时，提供"文件恢复"和"链接恢复"两个入口选项
5. 若视频曾通过链接导入且有 source URL，恢复界面提供"按链接恢复"直接重新下载，而非使用本地缓存

**Plans**: TBD

---

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. Shared Cloud Generation | v1.0 | 3/3 | Complete | 2026-03-26 |
| 1.1. Fix ASR 403 | v1.0 | 2/2 | Complete | 2026-03-27 |
| 2. Desktop Local Generation | v1.0 | 3/3 | Complete | 2026-03-27 |
| 2.1. Admin Bottle 1.0 Settings & Billing | v1.1 | 3/3 | Complete | 2026-03-27 |
| 3. Lesson Output Consistency | v1.1 | 3/3 | Complete | 2026-03-27 |
| 4. Desktop Link Import | v1.1 | 2/2 | Complete | 2026-03-27 |
| 5. Billing and Admin Alignment | v2.0 | 3/3 | Complete | 2026-03-28 |
| 6. Product Polish and Fallbacks | v2.0 | 2/2 | Complete | 2026-03-28 |
| 7. 竞品研究与产品规范 | v2.1 | 2/2 | Complete | 2026-03-28 |
| 7.1. Memo 模式复刻 | v2.1 | 3/3 | Complete | 2026-03-29 |
| 8. 沉浸学习重构 | v2.1 | 4/4 | Complete | 2026-03-28 |
| 9. 生词本、账号与网页模型边界 | v2.1 | 4/4 | Complete | 2026-03-28 |
| 10. 管理台前后端收口 | v2.1 | 4/4 | Complete | 2026-03-29 |
| 11. 盈利转化落地与回归收口 | v2.1 | 3/3 | Complete | 2026-03-30 |
| 12. 沉浸学习前端交互优化 | v2.1 | 1/1 | Complete | 2026-03-31 |
| 13. 桌面发布管线与签名安装包 | v2.2 | 3/3 | Complete | 2026-04-01 |
| 14. 桌面程序与模型增量更新产品化 | v2.2 | 5/5 | Complete | 2026-04-02 |
| 15. 桌面运行时边界加固 | v2.2 | 2/2 | Complete | 2026-04-01 |
| 16. 公告与更新日志系统 | v2.2 | 3/3 | Complete | 2026-04-01 |
| 17. 生词本复习主流程重做 | v2.2 | 3/3 | Complete | 2026-04-02 |
| 18. 生词本管理收口与站内轻提示 | v2.2 | 4/4 | Complete | 2026-04-02 |
| 19. 沉浸式学习 Bug 修复 | v2.3 | 0/4 | Not started | - |
| 20. 生词本词条增强 | v2.3 | 0/4 | Not started | - |
| 21. 素材导入 UX 优化 | v2.3 | 0/4 | Not started | - |
| 22. 导入弹窗配置与视频内容提取 | v2.3 | 0/6 | Not started | - |
| 23. 字幕遮挡板与链接恢复 | v2.3 | 0/5 | Not started | - |

**Overall:** 18/23 phases complete
