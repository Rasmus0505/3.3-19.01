# Roadmap: Bottle English Learning

## Milestones

- ✅ **v1.0 基础能力稳定化** — Phases 1, 1.1, 2 (shipped 2026-03-27)
- ✅ **v1.1** — Phases 2.1, 3, 4 (shipped 2026-03-27)
- ✅ **v2.0** — Phases 5, 6 (shipped 2026-03-28)
- 🚧 **v2.1 优化学习体验和管理体验** — Phases 7, 8, 9, 10, 11 (planned)

## Phases

### Phase 7: 竞品研究与产品规范

**Goal**: 固定 v2.1 的产品定位、竞品参考、Bottle 1.0 / 2.0 文案与网页端转化路径，让后续体验改造不是凭感觉推进。  
**Depends on**: Phase 6  
**Requirements**: WEB-01, WEB-02, WEB-03, GROW-01, GROW-02  
**Plans**: 2 plans

Plans:

- [x] 07-01: 完成官方竞品矩阵与 Bottle 1.0 / 2.0 定位文案
- [x] 07-02: 收口网页端模型卡、充值引导、桌面端 CTA 与 Bottle 1.0 执行防守

### Phase 07.1: Memo 模式复刻与桌面媒体工作流产品化 (INSERTED)

**Goal:** 把公开链接导入、本地下载/媒体准备、课程生成与后续学习闭环收口成正式桌面端产品能力，明确支持承诺、控制面与元数据边界。  
**Requirements**: TBD
**Depends on:** Phase 7
**Plans:** 3/3 plans complete

Plans:
- [x] 07.1-01: 固定 Memo 模式复刻的桌面工作流规范、支持承诺与诊断边界
- [x] 07.1-02: 将上传面板、desktop helper、runtime bridge 和产品介绍收口到公开链接优先的正式流程
- [x] 07.1-03: 用单元/契约/集成回归与发布 checklist 锁定支持 promise、学习闭环和打包边界

### Phase 8: 沉浸学习重构

**Goal**: 把沉浸学习改成稳定的播放/输入状态机，支持单句循环和倍速切换，并解决历史组合操作冲突。  
**Depends on**: Phase 7  
**Requirements**: IMM-01, IMM-02, IMM-03, IMM-04, IMM-05  
**Plans**: 4 plans

Plans:

- [x] 08-01: 拆分沉浸学习的播放、输入、快捷键与句子推进状态
- [x] 08-02: 增加单句循环与固定倍速切换
- [x] 08-03: 清理全屏、遮挡板与播放完成状态的互斥关系
- [x] 08-04: 补齐关键组合交互回归验证

### Phase 9: 生词本、账号与网页模型边界

**Goal**: 让生词本从收词列表升级为可复习入口，同时完成用户名注册/修改与网页端 Bottle 1.0 边界强化。  
**Depends on**: Phase 8  
**Requirements**: WBK-01, WBK-02, WBK-03, WBK-04, ACC-01, ACC-02, ACC-03, ACC-04  
**Plans**: 4 plans

Plans:

- [x] 09-01: 增加用户名注册、个人资料改名和当前用户读取接口
- [x] 09-02: 重做登录/注册前端与轻量账户设置入口
- [x] 09-03: 为生词本补齐复习字段、到期队列与复习动作
- [x] 09-04: 收口网页端 Bottle 1.0 不可执行但可引导的边界体验

### Phase 10: 管理台前后端收口

**Goal**: 重构管理台信息架构和接口展示语义，统一中文表达、元优先金额、Bottle 1.0 / 2.0 主命名。  
**Depends on**: Phase 9  
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04  
**Plans**: 4 plans

Plans:

- [x] 10-01: 设计并落地新的中文优先管理台导航与深链兼容
- [x] 10-02: 将 overview/users/wallet/redeem/pricing 金额统一改为元语义
- [x] 10-03: 收口 Bottle 1.0 / 2.0 命名、排序和模型配置说明
- [x] 10-04: 分离计费编辑与运行诊断视图并清理英文残留

### Phase 11: 盈利转化落地与回归收口

**Goal**: 基于前面阶段的定位和文案，把充值、模型选择、桌面下载转化路径真正落地，并完成整条链路回归。  
**Depends on**: Phase 10  
**Requirements**: GROW-01, GROW-02  
**Plans**: 3 plans

Plans:

- [x] 11-01: 统一模型卡、充值按钮、余额不足提示与桌面端下载转化文案
- [x] 11-02: 全局数字输入框编辑体验修复并覆盖关键金额/数量输入
- [x] 11-03: 完成全链路回归、旧深链验证与网页静态产物同步检查

## Summary

**Pending milestone:** v2.1 优化学习体验和管理体验  
**Phase count:** 6  
**Requirement coverage:** 22 / 22 mapped
