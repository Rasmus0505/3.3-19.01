# Phase 7 Web CTA Spec

> This spec converts the positioning contract into concrete web routing rules: which scenario keeps the user in the web flow, which one promotes desktop, and which copy is forbidden.

## 场景决策表

| 场景 | 主 CTA | 次 CTA | 触发条件 | 页面说明 | 禁止文案 |
| --- | --- | --- | --- | --- | --- |
| Bottle 2.0 默认网页流程 | 开始生成 | 下载桌面端 | 默认上传音频/视频，网页端 Bottle 2.0 可直接执行，且未命中桌面专属或高风险判断 | Bottle 2.0 是网页即用、快速起步、默认推荐；桌面端只是补充入口，不抢主流程 | 不得把网页默认路径写成“先试试 Bottle 1.0” |
| Bottle 1.0 | 下载桌面端 | 查看 Bottle 1.0 说明 | 用户明确想要 Bottle 1.0，或页面需要解释更高精度/客户端专属路径 | Bottle 1.0 只承担价值说明与下载引导，不承担浏览器内执行 | 不得写“网页端直接开始 Bottle 1.0” |
| 链接导入 | 下载桌面端 | 继续网页上传 | 用户要处理视频链接而不是本地文件，或命中桌面端专属链接导入能力 | 链接导入属于桌面端专属流程；网页端可继续处理本地上传，但不能承诺链接导入 | 不得写“浏览器内可直接导入链接生成” |
| 超大文件 / 长时长 / 网络不稳定 | 下载桌面端 | 继续网页生成 | 文件大小、时长或网络条件命中高风险素材判断，但网页直传仍可执行 | 能力边界和高风险素材可以切换主 CTA 为下载桌面端，同时保留继续网页生成作为次级动作 | 不得把继续网页流程写成“同样稳定”或把桌面推荐写成可选提示而非主动作 |
| 余额不足 | 充值后生成 | 稍后再试 | 钱包余额不足，当前任务被计费阻塞 | 余额不足属于付费阻塞，不属于能力边界；用户应先恢复支付能力，而不是被误导去桌面端 | 不得把余额阻塞写成“下载桌面端即可继续” |

## 主次 CTA 规则

- `能力边界和高风险素材可以切换主 CTA 为下载桌面端`
- `余额不足属于付费阻塞，不属于能力边界`
- `网页端可以展示 Bottle 1.0 价值，但不得把它写成浏览器内可执行流程`

补充规则：

- 如果主 CTA 已切换为 `下载桌面端`，次 CTA 只能保留“继续网页生成 / 继续网页上传 / 查看说明”这类降级动作，不能再给出等权重的 Bottle 1.0 浏览器执行按钮。
- `开始生成` 只属于 Bottle 2.0 的网页默认流程，不能被复用于 Bottle 1.0、链接导入或其他桌面端专属能力。
- `充值后生成` 只用于余额恢复；不能借由充值文案顺带改写产品能力边界。

## Surface Mapping

| 文件 | 用途 |
| --- | --- |
| `frontend/src/features/upload/UploadPanel.jsx` | 模型卡标题、主次按钮、桌面引导弹窗 |
| `frontend/src/features/upload/asrStrategy.js` | 受阻场景消息 |
| `frontend/src/shared/lib/asrModels.js` | Bottle 主命名和副文案 |
| `app/services/asr_model_registry.py` | 后端显示元数据 |
| `frontend/src/features/admin-system/AdminSystemTab.jsx` | 诊断面的 Bottle 命名 |

## 非目标

- `不让网页端执行 Bottle 1.0`
- `不引入订阅 CTA`
- `不把余额阻塞改写成桌面端能力问题`
