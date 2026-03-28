# Phase 7 Product Positioning Spec

> Purpose: make Bottle 1.0 / Bottle 2.0 naming, boundary, monetization language, and downstream copy reusable across web upload, admin diagnostics, runtime metadata, and product docs.

## 标准定位

### 主定位语句

- `Bottle 1.0：生成速度一般，字幕质量较好（客户端专属）`
- `Bottle 2.0：生成速度快，字幕质量好`

### 运行时角色定义

- `Bottle 2.0 = 网页即用、快速起步、默认推荐`
- `Bottle 1.0 = 桌面高精度、长时长/复杂素材/链接导入优先`

### 给后续界面的解释方式

- Bottle 2.0 负责网页内可直接执行的默认生成流程，用户不用先理解技术栈就能开始。
- Bottle 1.0 负责更高控制、更重素材、更复杂导入路径的桌面价值锚点，不再被写成“浏览器里也许能跑”的灰色能力。
- 用户面对的选择题不该再是“走哪条 ASR 技术路线”，而是“当前素材更适合哪种学习质量路径”。

## 标准命名

### 旧词到新词映射

- `本机识别 -> Bottle 1.0（解释性副文案可保留“本机识别”）`
- `云端识别 -> Bottle 2.0（解释性副文案可保留“云端识别”）`
- `选择字幕生成方式 -> 选择学习素材质量`

### 命名规范

- 面向用户的一级标题、模型卡标题、按钮、桌面引导和 admin/runtime 卡片，一律优先使用 `Bottle 1.0` / `Bottle 2.0`。
- `本机识别`、`云端识别`、model key、runtime kind 只能作为解释性副文案、诊断注释或开发者语义存在。
- 如果同一表面同时出现主命名和技术说明，主命名在前，技术说明降级为次级文字，不得反过来。

## 产品边界

| 场景 | Bottle 2.0 | Bottle 1.0 |
| --- | --- | --- |
| 网页端直接生成 | 默认路径，可直接执行 | 只可解释与引导，不可执行 |
| 长时长 / 复杂素材 | 可保留继续网页上传的次级入口，但不是默认推荐 | 优先推荐桌面端 |
| 链接导入 | 网页端不承担主流程 | 桌面端专属能力 |
| 诊断/管理台 | 显示为 Bottle 2.0 云端运行状态 | 显示为 Bottle 1.0 本地运行状态 |
| 产品介绍与转化文案 | 强调“快速起步、网页即用” | 强调“客户端专属、高精度、复杂场景更稳” |

边界结论：

- `网页端不得执行 Bottle 1.0`
- 网页端可以解释 Bottle 1.0 的价值、适用素材和下载桌面端的理由，但不可以写成浏览器内的备选执行流程。
- 链接导入、本地模型、重素材处理能力都应被说成“桌面端完成”，而不是“网页端失败后的隐藏兜底”。

## Benchmark-backed Monetization Summary

基于 [07-COMPETITOR-MATRIX.md](./07-COMPETITOR-MATRIX.md) 的官方 benchmark，Bottle 在 v2.1 的盈利结论固定如下：

- `不引入订阅`
- `沿用按次付费`
- `用场景化主次 CTA 提升下载/充值转化，而不是扩展套餐复杂度`

### 结论拆解

1. LingQ、FluentU、Glossika、Migaku 都在卖“更完整、更顺手、更省心”的体验，而不是把用户教育成本转移成更复杂的套餐结构。Bottle 现在已经有钱包和充值动作，不需要在 v2.1 再引入订阅叙事。
2. Bottle 的转化优化应优先落在场景说明：
   - 余额阻塞：继续用 `充值后生成`
   - 能力边界 / 高风险素材：提升 `下载桌面端`
   - 默认网页流程：保持 `开始生成`
3. Bottle 1.0 的价值不是“更贵的模式”，而是“更适合复杂素材的高价值路径”；Bottle 2.0 的价值不是“更便宜”，而是“网页即用、快速起步”。

## 下游消费面

| 文件 | 必须消费的定位结论 |
| --- | --- |
| `frontend/src/features/upload/UploadPanel.jsx` | 模型卡主标题、主次按钮、桌面引导弹窗都切换到 Bottle 主命名与“选择学习素材质量”问题框架 |
| `frontend/src/features/upload/asrStrategy.js` | 受阻场景消息要区分能力边界和余额阻塞，不能把两者混写 |
| `frontend/src/shared/lib/asrModels.js` | Bottle 2.0 的 display_name / subtitle / note 使用标准命名和副文案 |
| `app/services/asr_model_registry.py` | 后端 runtime metadata 返回 Bottle 主命名，并保持桌面/云端解释为副语义 |
| `frontend/src/features/admin-system/AdminSystemTab.jsx` | admin 诊断卡片统一显示 Bottle 1.0 / Bottle 2.0，不把技术 key 暴露成主标签 |
| `Docx/产品介绍.md` | 产品介绍从技术导向和“模型管理”口径切回到产品路径、能力边界和充值/下载转化叙事 |

需要同步注意的现状裂缝：

- `UploadPanel.jsx` 仍然直接展示 `选择字幕生成方式`、`本机识别`、`云端识别`
- `asrModels.js` 与 `asr_model_registry.py` 已经部分使用 `Bottle 2.0`
- `AdminSystemTab.jsx` 已经使用 `Bottle 运行就绪度`
- `Docx/产品介绍.md` 仍然保留偏技术和后台配置导向的话术

## 禁止事项

- `网页端不得执行 Bottle 1.0`
- `不得把技术标识作为主标签`
- `不得在 v2.1 引入订阅表达`
- 不得把 Bottle 1.0 写成“网页失败后自动切换的备用云端模式”
- 不得把 “Bottle 1.0 / Bottle 2.0” 重新退回成仅开发者才能理解的 model key 或 runtime kind
