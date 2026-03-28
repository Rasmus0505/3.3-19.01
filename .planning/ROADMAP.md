# Roadmap: Bottle English Learning

## Milestones

- ✅ **v1.0 基础能力稳定化** — Phases 1, 1.1, 2 (shipped 2026-03-27)
- ✅ **v1.1** — Phases 2.1, 3, 4 (shipped 2026-03-27)
- ✅ **v2.0** — Phases 5, 6 (shipped 2026-03-28)
- 🚧 **v2.1 优化学习体验和管理体验** — Phases 7, 8, 9, 10, 11 (planned)

## Phases

<details>
<summary>✅ v1.0 基础能力稳定化 (Phases 1, 1.1, 2) — SHIPPED 2026-03-27</summary>

- [x] Phase 1: Shared Cloud Generation (3/3 plans) — completed 2026-03-26
- [x] Phase 1.1: Fix ASR 403 File Access Failures (2/2 plans) — completed 2026-03-27
- [x] Phase 2: Desktop Local Generation (3/3 plans) — completed 2026-03-27

_See: `.planning/milestones/v1.0-ROADMAP.md` for full phase details_

</details>

<details>
<summary>✅ v1.1 — Urgent Admin Cleanup, Lesson Output & Desktop Link Import — SHIPPED 2026-03-27</summary>

- [x] Phase 2.1: Admin Bottle 1.0 Settings & Billing Cleanup (3/3 plans) — completed 2026-03-27
- [x] Phase 3: Lesson Output Consistency (3/3 plans) — completed 2026-03-27
- [x] Phase 4: Desktop Link Import (2/2 plans) — completed 2026-03-27

_See: `.planning/milestones/v2.0-ROADMAP.md` for archived v1.1 phase details_

</details>

<details>
<summary>✅ v2.0 — Billing, Admin & Polish — SHIPPED 2026-03-28</summary>

- [x] Phase 5: Billing and Admin Alignment (3/3 plans) — completed 2026-03-28
- [x] Phase 6: Product Polish and Fallbacks (2/2 plans) — completed 2026-03-28

_See: `.planning/milestones/v2.0-ROADMAP.md` for full phase details_

</details>

### 🚧 v2.1 — 优化学习体验和管理体验

- [ ] Phase 7: 竞品研究与产品规范
- [ ] Phase 8: 沉浸学习重构
- [ ] Phase 9: 生词本、账号与网页模型边界
- [ ] Phase 10: 管理台前后端收口
- [ ] Phase 11: 盈利转化落地与回归收口

### Phase 7: 竞品研究与产品规范

**Goal**: 固定 v2.1 的产品定位、竞品参考、Bottle 1.0 / 2.0 文案与网页端转化路径，让后续体验改造不是凭感觉推进。  
**Depends on**: Phase 6  
**Requirements**: WEB-01, WEB-02, WEB-03, GROW-01, GROW-02  
**Success criteria:**
1. 网页端生成前就能清楚区分 Bottle 1.0 与 Bottle 2.0 的场景差异
2. 网页端无法执行 Bottle 1.0，但可顺滑引导到桌面端
3. 上传模型卡、充值阻断与桌面下载提示采用统一定位文案
4. 里程碑留下正式竞品/盈利总结，供后续实验使用

Plans:

- [ ] 07-01: 完成官方竞品矩阵与 Bottle 1.0 / 2.0 定位文案
- [ ] 07-02: 收口网页端模型卡、充值引导、桌面端 CTA 与 Bottle 1.0 执行防守

### Phase 8: 沉浸学习重构

**Goal**: 把沉浸学习改成稳定的播放/输入状态机，支持单句循环和倍速切换，并解决历史组合操作冲突。  
**Depends on**: Phase 7  
**Requirements**: IMM-01, IMM-02, IMM-03, IMM-04, IMM-05  
**Success criteria:**
1. 用户可以反复精听当前句，不会被自动误跳句
2. 用户可以在学习过程中切换固定倍速并即时生效
3. 重播、暂停、揭示、切句、全屏、遮挡板等组合操作不会互相打架
4. 当前句完成与下一句切换逻辑保持可预测

Plans:

- [ ] 08-01: 拆分沉浸学习的播放、输入、快捷键与句子推进状态
- [ ] 08-02: 增加单句循环与固定倍速切换
- [ ] 08-03: 清理全屏、遮挡板与播放完成状态的互斥关系
- [ ] 08-04: 补齐关键组合交互回归验证

### Phase 9: 生词本、账号与网页模型边界

**Goal**: 让生词本从收词列表升级为可复习入口，同时完成用户名注册/修改与网页端 Bottle 1.0 边界强化。  
**Depends on**: Phase 8  
**Requirements**: WBK-01, WBK-02, WBK-03, WBK-04, ACC-01, ACC-02, ACC-03, ACC-04  
**Success criteria:**
1. 用户注册必须填写唯一用户名，并能在登录后修改
2. 登录仍只依赖邮箱和密码，避免认证逻辑扩散
3. 生词本可以查看到期复习项并记录简单复习结果
4. 收词后的上下文、来源次数和下次复习时间都可见

Plans:

- [ ] 09-01: 增加用户名注册、个人资料改名和当前用户读取接口
- [ ] 09-02: 重做登录/注册前端与轻量账户设置入口
- [ ] 09-03: 为生词本补齐复习字段、到期队列与复习动作
- [ ] 09-04: 收口网页端 Bottle 1.0 不可执行但可引导的边界体验

### Phase 10: 管理台前后端收口

**Goal**: 重构管理台信息架构和接口展示语义，统一中文表达、元优先金额、Bottle 1.0 / 2.0 主命名。  
**Depends on**: Phase 9  
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04  
**Success criteria:**
1. 管理台核心页面金额全部以元为主展示
2. Bottle 1.0 排在 Bottle 2.0 前，技术名只作为二级说明
3. 旧路由与老深链仍能跳到新结构
4. 计费编辑与运行诊断不再混成一个运营动作

Plans:

- [ ] 10-01: 设计并落地新的中文优先管理台导航与深链兼容
- [ ] 10-02: 将 overview/users/wallet/redeem/pricing 金额统一改为元语义
- [ ] 10-03: 收口 Bottle 1.0 / 2.0 命名、排序和模型配置说明
- [ ] 10-04: 分离计费编辑与运行诊断视图并清理英文残留

### Phase 11: 盈利转化落地与回归收口

**Goal**: 基于前面阶段的定位和文案，把充值、模型选择、桌面下载转化路径真正落地，并完成整条链路回归。  
**Depends on**: Phase 10  
**Requirements**: GROW-01, GROW-02  
**Success criteria:**
1. 充值阻断、模型卡、桌面端 CTA 文案前后一致
2. 用户能更容易理解“何时充值”“何时改用桌面端”
3. 形成后续可做 A/B 的盈利建议清单
4. 网页端 `app/static` 与管理台构建完成并验证

Plans:

- [ ] 11-01: 统一模型卡、充值按钮、余额不足提示与桌面端下载转化文案
- [ ] 11-02: 形成 v2.1 经营建议清单并固化到研究总结
- [ ] 11-03: 完成全链路回归、旧深链验证与网页静态产物同步检查

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. Shared Cloud Generation | v1.0 | 3/3 | Complete | 2026-03-26 |
| 1.1. Fix ASR 403 | v1.0 | 2/2 | Complete | 2026-03-27 |
| 2. Desktop Local Generation | v1.0 | 3/3 | Complete | 2026-03-27 |
| 2.1. Admin Bottle 1.0 Settings & Billing Cleanup | v1.1 | 3/3 | Complete | 2026-03-27 |
| 3. Lesson Output Consistency | v1.1 | 3/3 | Complete | 2026-03-27 |
| 4. Desktop Link Import | v1.1 | 2/2 | Complete | 2026-03-27 |
| 5. Billing and Admin Alignment | v2.0 | 3/3 | Complete | 2026-03-28 |
| 6. Product Polish and Fallbacks | v2.0 | 2/2 | Complete | 2026-03-28 |
| 7. 竞品研究与产品规范 | v2.1 | 2/2 | Pending | — |
| 8. 沉浸学习重构 | v2.1 | 4/4 | Pending | — |
| 9. 生词本、账号与网页模型边界 | v2.1 | 4/4 | Pending | — |
| 10. 管理台前后端收口 | v2.1 | 4/4 | Pending | — |
| 11. 盈利转化落地与回归收口 | v2.1 | 3/3 | Pending | — |

**Overall:** 8/13 phases complete — v2.1 initialized
