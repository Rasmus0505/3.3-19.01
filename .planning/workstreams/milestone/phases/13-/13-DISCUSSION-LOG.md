# Phase 13: 桌面发布管线与签名安装包 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `13-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-03-31
**Phase:** 13-desktop-release-pipeline-and-signed-installer
**Areas discussed:** 官方发布入口与版本记录、安装包内容策略、安装器技术暴露、release channel 划分

---

## 官方发布入口与版本记录

| Option | Description | Selected |
|--------|-------------|----------|
| 轻量静态下载页 | 官网只放安装包与简化 `latest.json`，发布记录较弱 | |
| 后台发布记录模型 | 后台维护完整桌面 release 记录，网站与客户端都读取后台 | |
| 官网下载页 + 同站点 release metadata | 用户只看到官网正式下载页；客户端与网站共用同一版本事实源 | ✓ |

**User's choice:** 官网下载页 + 同站点 release metadata
**Notes:** 用户明确希望安装包放在自己的学习网站内；下载页可以新增，但不应该替换“历史记录”“上传素材”等高频主导航。

---

## 安装包内容策略

| Option | Description | Selected |
|--------|-------------|----------|
| 大而全安装包 | 主程序、helper、工具与默认模型一并打包，安装后即可用 | ✓ |
| 轻安装包 + 首次启动补资源 | 先装客户端，再在首次使用时下载模型/工具 | |
| 折中方案 | 预装部分运行时，重资源按场景补装 | |

**User's choice:** 大而全安装包
**Notes:** 用户接受更大的安装包，以换取更稳定、简单的首次安装体验。

---

## 安装器技术暴露

| Option | Description | Selected |
|--------|-------------|----------|
| 保留技术词与资源选择 | 安装器继续显示模型/资源级选项 | |
| 改成产品语言但保留选择 | 用“完整安装/精简安装”等产品词替代技术词 | |
| 隐藏技术选项，默认完整安装 | 正式版不暴露模型/helper/工具概念，默认装全 | ✓ |

**User's choice:** 隐藏技术选项，默认完整安装
**Notes:** 用户明确确认“正式版安装器隐藏技术选项，默认完整安装”。

---

## Release Channel 划分

| Option | Description | Selected |
|--------|-------------|----------|
| 单一 latest | 所有版本共用一个“最新版”事实源 | |
| `stable` + `preview` | 正式用户只见 stable；preview 供内部/小范围测试 | ✓ |
| 多层 channel | `stable / beta / internal` 等更细粒度分层 | |

**User's choice:** `stable` + `preview`
**Notes:** 用户接受双 channel 设计，用于隔离正式版与预览版，避免普通用户被带到测试版本。

---

## the agent's Discretion

- 官网下载页具体放在顶部导航、账户页、上传页还是计费页入口，可由后续产品规划决定，只要保持统一目标页。
- release metadata 的最终文件名和字段命名可由后续研究/规划决定，只要同站点、同版本真相、双 channel 分离。

## Deferred Ideas

- 完整后台化的 release 管理中心
- 程序内自动更新与模型增量更新体验
- 多于 `stable / preview` 的更复杂 channel
- 轻安装包 / 首次启动补资源
