# 路线图：Bottle 英语学习产品

## Overview

这份路线图的目标，是把一个已经可运行的英语学习代码库，收敛成一个边界更清晰、运行时职责更明确的产品。首个里程碑重点是稳定共享的 Bottle 2.0 云端生成路径，让桌面端成为完整能力入口，让不同生成路径最终落入一致的课程学习产物，并让计费与后台运营和产品边界保持一致。

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Shared Cloud Generation** - 稳定 Bottle 2.0 作为 Web + Desktop 共享的生成路径
- [ ] **Phase 2: Desktop Local Generation** - 让 Bottle 1.0 成为低摩擦的桌面端本地能力
- [ ] **Phase 3: Lesson Output Consistency** - 统一不同生成路线下的课程产物和学习流程
- [ ] **Phase 4: Desktop Link Import** - 在桌面端支持通过本地工具链导入链接媒体
- [ ] **Phase 5: Billing and Admin Alignment** - 让定价、兑换和运行时可见性与产品策略一致
- [ ] **Phase 6: Product Polish and Fallbacks** - 降低学习者摩擦并补强边界场景体验

## Phase Details

### Phase 1: Shared Cloud Generation
**Goal**: Web 和 Desktop 用户都可以稳定使用 Bottle 2.0 生成课程，同时不让中心服务器变成默认重媒体处理节点。
**Depends on**: Nothing (first phase)
**Requirements**: [AUTH-01, AUTH-02, AUTH-03, BILL-01, WEB-01, WEB-02, WEB-03, DESK-02]
**Success Criteria** (what must be TRUE):
  1. Web 用户可以在主产品流程中完成 Bottle 2.0 课程生成。
  2. Desktop 用户可以在同一产品表面触发 Bottle 2.0，而不需要跳出主流程。
  3. 产品 UI 能清晰区分当前支持能力与运行时边界。
  4. 这条生成路径不会默认让中心服务器承担长时间媒体处理任务。
**Plans**: 3 plans

Plans:
- [ ] 01-01: 稳定共享 Bottle 2.0 直传与任务创建后端契约
- [ ] 01-02: 统一 Web 与 Desktop 的 Bottle 2.0 用户体验与能力提示
- [ ] 01-03: 加固鉴权、余额和任务恢复护栏

### Phase 2: Desktop Local Generation
**Goal**: Desktop 用户可以在低设置摩擦的前提下使用 Bottle 1.0 本地生成，并拥有稳定的就绪检查体验。
**Depends on**: Phase 1
**Requirements**: [DESK-01, DESK-03]
**Success Criteria** (what must be TRUE):
  1. Desktop 用户不需要理解模型、ffmpeg 或 helper 细节，也能准备好 Bottle 1.0。
  2. Desktop 用户可以在本机使用 Bottle 1.0 生成课程。
  3. 本地生成未就绪或失败时，产品能给出清晰且可执行的提示。
**Plans**: 3 plans

Plans:
- [ ] 02-01: 加固本地模型与工具就绪/安装体验
- [ ] 02-02: 稳定 Bottle 1.0 桌面端本地生成管线
- [ ] 02-03: 优化本地生成错误处理与恢复体验

### Phase 3: Lesson Output Consistency
**Goal**: 无论来自哪条受支持的生成路径，最终都形成一致可学习的课程产物。
**Depends on**: Phase 2
**Requirements**: [LESS-01, LESS-02, LESS-03, LEARN-01, LEARN-02]
**Success Criteria** (what must be TRUE):
  1. Bottle 1.0 和 Bottle 2.0 的输出都能形成可用课程记录。
  2. 用户不论通过哪条生成路径得到课程，都能进入一致的课程查看和学习流程。
  3. 生成进度、局部失败和成功结果能被用户清晰理解。
**Plans**: 3 plans

Plans:
- [ ] 03-01: 统一课程产物与状态契约
- [ ] 03-02: 对齐课程详情与练习入口行为
- [ ] 03-03: 优化生成进度和结果状态展示

### Phase 4: Desktop Link Import
**Goal**: Desktop 用户可以通过本地工具链把支持的媒体链接转换成课程生成输入。
**Depends on**: Phase 3
**Requirements**: [DESK-04]
**Success Criteria** (what must be TRUE):
  1. Desktop 用户可以提交支持的媒体链接并在客户端中导入。
  2. 本地 yt-dlp / ffmpeg 工具链承担链接导入准备工作。
  3. 用户在链接导入过程中能看到清晰的进度与失败反馈。
**Plans**: 2 plans

Plans:
- [ ] 04-01: 稳定桌面端链接导入 backend/helper 流程
- [ ] 04-02: 把链接导入整合进桌面端生成体验

### Phase 5: Billing and Admin Alignment
**Goal**: 产品定价、兑换流程和运行时运营能力，准确反映 Bottle 1.0 / Bottle 2.0 的真实产品策略。
**Depends on**: Phase 4
**Requirements**: [BILL-02, BILL-03, ADMIN-01, ADMIN-02, ADMIN-03]
**Success Criteria** (what must be TRUE):
  1. 管理员可以可维护地配置 Bottle 1.0 和 Bottle 2.0 的价格。
  2. 用户通过平台点数消费，而不是提供个人 ASR Key。
  3. 管理员可以查看与生成能力相关的健康与运行状态。
**Plans**: 3 plans

Plans:
- [ ] 05-01: 对齐运行时模式与点数扣费规则
- [ ] 05-02: 加固后台价格与配置控制能力
- [ ] 05-03: 提升生成支持状态的运营可见性

### Phase 6: Product Polish and Fallbacks
**Goal**: 当运行时限制、离线情况或能力边界出现时，学习者仍能低摩擦使用产品。
**Depends on**: Phase 5
**Requirements**: [LEARN-03]
**Success Criteria** (what must be TRUE):
  1. 学习者能理解在当前表面下哪些功能可用、哪些需要切换运行时。
  2. 产品文案与 fallback 行为可以减少“桌面专属”和“网页可用”之间的混淆。
  3. 常见边界场景能优雅失败，而不是要求用户自己排技术问题。
**Plans**: 2 plans

Plans:
- [ ] 06-01: 优化引导、标签和能力边界文案
- [ ] 06-02: 加固运行时相关失败场景下的 fallback 与恢复体验

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Shared Cloud Generation | 0/3 | Not started | - |
| 2. Desktop Local Generation | 0/3 | Not started | - |
| 3. Lesson Output Consistency | 0/3 | Not started | - |
| 4. Desktop Link Import | 0/2 | Not started | - |
| 5. Billing and Admin Alignment | 0/3 | Not started | - |
| 6. Product Polish and Fallbacks | 0/2 | Not started | - |