# Roadmap: Bottle English Learning

## Milestones

- ✅ **v1.0 基础能力稳定化** — Phases 1, 1.1, 2 (shipped 2026-03-27)
- ✅ **v1.1** — Phases 2.1, 3, 4 (shipped 2026-03-27)
- ✅ **v2.0** — Phases 5, 6 (shipped 2026-03-28)
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

### 📋 v2.2 桌面发布与体验收口 (Planned)

- [ ] **Phase 13: 桌面发布管线与签名安装包**
  Goal: 把当前 Electron 工程从“能打包”提升到“能正式发布”，建立可追踪的 Windows 安装包与签名发布流程。
  Requirements: DESK-01, SECU-01
  Success criteria:
  1. 团队可以从受控流程产出官方 Bottle Windows 安装包，而不是手工拼装开发产物。
  2. 发布产物版本、安装包元数据和发布记录可以互相对应。
  3. 公共发布所需的签名步骤进入正式发布流程，并能验证结果。

- [x] **Phase 14: 桌面程序与模型增量更新产品化** (completed 2026-04-01)
  Goal: 把桌面端版本更新与 ASR 资源更新收口成真实可用、可诊断、可恢复的升级体验。
  Requirements: DESK-02, DESK-03, DESK-04, DESK-05, SECU-03
  Success criteria:
  1. 用户能在客户端看到当前版本、可用新版本和更新状态。
  2. 程序更新在健康路径下可在客户端内完成，不需要用户手动卸载重装。
  3. 模型/资源更新只下载变化文件，并能正确展示进度、完成状态和失败恢复入口。
  4. 团队能区分哪些资源是打包保护资产，哪些资源是按设计允许增量更新的资产。

- [x] **Phase 15: 桌面运行时边界加固** (completed 2026-04-01)
  Goal: 审核并收紧桌面端主进程、预加载和渲染层边界，让正式发布版本具备更清晰的安全边界。
  Requirements: SECU-02
  Success criteria:
  1. 渲染层只能访问产品明确允许的预加载能力。
  2. 发布版桌面端的权限边界被记录并验证，而不是依赖默认或历史残留配置。
  3. 核心运行时暴露面相比当前基线收紧，且不破坏已有核心工作流。

- [x] **Phase 16: 公告与更新日志系统**
  Goal: 在管理台建立一套面向 web/desktop 的统一公告系统，支持更新日志、横幅和弹窗。
  Requirements: ANNC-01, ANNC-02, ANNC-03, ANNC-04, ANNC-05
  Success criteria:
  1. 管理员可以创建、排序、置顶和删除公告。
  2. 单条公告可以配置为 changelog、banner 或 modal 展示方式。
  3. 用户在对应表面只会看到当前有效且匹配端能力的公告内容。

- [x] **Phase 17: 生词本复习主流程重做** (completed 2026-04-01)
  Goal: 把生词本从“功能存在”提升到“适合高频复习”，优先解决复习流、掌握度反馈和上下文回看。
  Requirements: WORD-01, WORD-02, WORD-04
  Success criteria:
  1. 用户可以直接进入到期复习流，而不是先在冗杂列表里找入口。
  2. 每次复习都会更新掌握度/下次复习安排，并对用户可见。
  3. 用户在复习中可以快速回看例句和来源课程，不需要跳出一串低效页面。

- [x] **Phase 18: 生词本管理收口与站内轻提示** (completed 2026-04-02)
  Goal: 完成生词本的批量操作、框选翻译和 shadcn 风格重做，并把网站轻提示系统落到关键交互点。
  Requirements: WORD-03, WORD-05, WORD-06, HINT-01, HINT-02
  Success criteria:
  1. 用户可以批量管理生词，并在聚焦复习与管理视图之间自然切换。
  2. 用户可以对存量上下文中的局部内容发起单独翻译，而不是只能看整句解释。
  3. 生词本界面完成一次一致的视觉与交互收口，减少非必要信息干扰。
  4. 网站关键困惑点具备统一的半透明轻提示，且提示能自动消失、不阻塞流程。

### 🚧 v2.3 学习体验与导入流程优化 (In Progress: Phase 22)

- [x] **Phase 19: 沉浸式学习 Bug 修复** (completed 2026-04-02)
  Goal: 沉浸式学习中已知 Bug 全部收口，用户在答题和播放过程中不再遇到句子被清空、播放静默失败、颜色显示错误等问题。
  Requirements: IMMERSE-01, IMMERSE-02, IMMERSE-03, IMMERSE-04
  Success criteria:
  1. 用户在答题框输入 3 个词后切换播放倍速，已输入内容保持可见，不触发自动重播
  2. 用户点击"上一句"右侧小喇叭按钮时，只有在音频实际播放成功后才显示 playing 状态；音频不可用时显示明确错误提示
  3. 沉浸式学习答题框中，AI/提示生成的内容以黄色背景（#FEF3C7）显示，用户手打的内容以绿色背景（#D1FAE5）显示
  4. 用户在输入句子的任意时刻切换循环开关，已输入句子内容保持可见，不触发自动重播

  Plans:
  - [x] 19-01: 答题内容保持可见 ✅ (2026-04-02)
  - [x] 19-02: 播放状态管理 ✅ (2026-04-02)
  - [x] 19-03: 答题背景色区分 ✅ (2026-04-02)
  - [x] 19-04: 循环开关触发逻辑 ✅ (2026-04-02)

- [x] **Phase 20: 生词本词条增强** (completed 2026-04-02)
  Goal: 生词本每个词条展示完整的翻译和发音信息，用户可独立查看翻译和播放发音。
  Requirements: WB-01, WB-02
  Success criteria:
  1. 生词本每个词条卡片的翻译文字显示在该词条正上方，采用独立的视觉区块（背景色区分）
  2. 卡片整体高度自适应，不受翻译文字长度影响
  3. 用户点击词条的发音按钮后，浏览器播放该单词发音（Web Speech API，lang='en-US'）
  4. 发音按钮显示加载中状态；发音不可用时显示错误提示而非静默失败
  Plans: 2/2 — COMPLETE ✅
  - [x] 20-01: 翻译区块结构重组 ✅ (2026-04-02)
  - [x] 20-02: 发音按钮 + Web Speech API ✅ (2026-04-02)

- [x] **Phase 21: 素材导入 UX 优化** (completed 2026-04-02)
  Goal: 素材导入界面更简洁高效，默认进入链接导入流程，文案精简无冗余。
  Requirements: UPLOAD-01, UPLOAD-02, UPLOAD-03, UPLOAD-04
  Success criteria:
  1. 用户打开素材上传页时，默认选中"链接"Tab（而非文件上传 Tab）
  2. 链接 Tab 的说明文案精简，冗余解释段落移除；"支持常见公开视频链接"改为输入框 placeholder 文案；底部仅保留 SnapAny 外链说明
  3. 用户粘贴链接导入成功后，视频标题自动填入标题输入框，无需手动输入
  4. 快捷键配置区域所有配置项在一屏内可见，采用一行紧凑布局，不再占据整行宽度
  Plans: 2/2 — COMPLETE ✅
  - [x] 21-01: 默认 Tab + 文案精简（UPLOAD-01/02）✅ (2026-04-02)
  - [x] 21-02: 快捷键两行布局（UPLOAD-04）✅ (2026-04-02)

### Phase 13: 桌面发布管线与签名安装包

**Goal**: 把当前 Electron 工程从“能打包”提升到“能正式发布”，建立可追踪的 Windows 安装包与签名发布流程。  
**Depends on**: Phase 12  
**Requirements**: DESK-01, SECU-01  
**Plans**: 3/3 — COMPLETE ✅

Plans:

- [x] 13-01: 收口正式下载页、release metadata 与 stable/preview 渠道规则 ✅ (2026-03-31)
- [x] 13-02: 整理正式 Windows 打包与签名发布流水线 ✅ (2026-03-31)
- [x] 13-03: 调整正式安装器表达、隐藏技术选项并补齐发布验证 ✅ (2026-03-31)

### Phase 14: 桌面程序与模型增量更新产品化

**Goal**: 把桌面端版本更新与 ASR 资源更新收口成真实可用、可诊断、可恢复的升级体验。  
**Depends on**: Phase 13  
**Requirements**: DESK-02, DESK-03, DESK-04, DESK-05, SECU-03  
**Plans**: 3/3 — COMPLETE ✅

Plans:

- [x] 14-01: 接入正式程序更新元数据、版本显示与可用更新状态 ✅ (2026-04-01)
- [x] 14-02: 产品化客户端内程序更新流程与失败恢复 ✅ (2026-04-01)
- [x] 14-03: 收口模型/资源增量更新、进度反馈与资产边界说明 ✅ (2026-04-01)

### Phase 15: 桌面运行时边界加固

**Goal**: 审核并收紧桌面端主进程、预加载和渲染层边界，让正式发布版本具备更清晰的安全边界。  
**Depends on**: Phase 14  
**Requirements**: SECU-02  
**Plans**: 0 plans

Plans:

- [ ] 15-01: 审核并缩减 preload/main 暴露面
- [ ] 15-02: 固定正式版 BrowserWindow / sandbox / 权限边界
- [ ] 15-03: 为运行时边界补齐契约验证与发布检查

### Phase 16: 公告与更新日志系统

**Goal**: 在管理台建立一套面向 web/desktop 的统一公告系统，支持更新日志、横幅和弹窗。  
**Depends on**: Phase 15  
**Requirements**: ANNC-01, ANNC-02, ANNC-03, ANNC-04, ANNC-05  
**Plans**: 3/3 — COMPLETE

Plans:

- [x] 16-01: 建立公告数据模型、后台接口与排序/置顶能力 ✅ (2026-04-01)
- [x] 16-02: 完成管理台公告编辑、删除和投放配置 ✅ (2026-04-01)
- [x] 16-03: 在 web/desktop 表面接入 changelog、banner、modal 渲染 ✅ (2026-04-01)

### Phase 17: 生词本复习主流程重做

**Goal**: 把生词本从“功能存在”提升到“适合高频复习”，优先解决复习流、掌握度反馈和上下文回看。  
**Depends on**: Phase 16  
**Requirements**: WORD-01, WORD-02, WORD-04  
**Plans**: 0 plans

Plans:

- [ ] 17-01: 重做复习入口与 due queue 优先级
- [ ] 17-02: 收口掌握度反馈与遗忘曲线式调度
- [ ] 17-03: 在复习流中补齐例句与来源课程回看

### Phase 18: 生词本管理收口与站内轻提示

**Goal**: 完成生词本的批量操作、框选翻译和 shadcn 风格重做，并把网站轻提示系统落到关键交互点。  
**Depends on**: Phase 17  
**Requirements**: WORD-03, WORD-05, WORD-06, HINT-01, HINT-02  
**Plans**: 4/4 — COMPLETE ✅

Plans:

- [x] 18-01: 补齐生词本批量管理与管理/复习视图切换 ✅ (2026-04-02)
- [x] 18-02: 实现存量上下文局部翻译与界面重构 ✅ (2026-04-02)
- [x] 18-03: 上线统一轻提示系统并覆盖关键困惑点 ✅ (2026-04-02)
- [x] 18-04: 翻译对话框与局部翻译实现 ✅ (2026-04-02)

- [x] Phase 19: 沉浸式学习 Bug 修复 (4/4 plans) — completed 2026-04-02

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
| 13. 桌面发布管线与签名安装包 | v2.2 | 0/0 | Planned | — |
| 14. 桌面程序与模型增量更新产品化 | v2.2 | 3/3 | Complete    | 2026-04-01 |
| 15. 桌面运行时边界加固 | v2.2 | 0/0 | Complete    | 2026-04-01 |
| 16. 公告与更新日志系统 | v2.2 | 3/3 | Complete    | 2026-04-01 |
| 17. 生词本复习主流程重做 | v2.2 | 0/0 | Complete    | 2026-04-01 |
| 18. 生词本管理收口与站内轻提示 | v2.2 | 4/4 | Complete | 2026-04-02 |
| 19. 沉浸式学习 Bug 修复 | v2.3 | 4/4 | Complete    | 2026-04-02 |
| 20. 生词本词条增强 | v2.3 | 2/2 | Complete | 2026-04-02 |
| 21. 素材导入 UX 优化 | v2.3 | 2/2 | Complete | 2026-04-02 |

**Overall:** 20/23 phases complete
