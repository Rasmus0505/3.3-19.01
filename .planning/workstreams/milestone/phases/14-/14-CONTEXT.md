# Phase 14: 桌面程序与模型增量更新产品化 - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

把桌面端版本检测、程序更新、Bottle 1.0 模型/资源增量更新、失败恢复，以及“哪些资产随正式包更新、哪些资产允许独立增量更新”的边界说明收口成真实可用、可诊断、可恢复的升级体验。

本阶段延续 Phase 13 的 stable-only 发布面，范围仅包括 stable 渠道程序更新与 Bottle 1.0 本地资源更新；不包含 preview/internal 渠道产品化、staged rollout、forced update 策略，或新的模型体系。

</domain>

<decisions>
## Implementation Decisions

### 更新入口与可见性
- **D-01:** 桌面客户端启动后自动检查程序更新，同时保留手动刷新入口。
- **D-02:** 若发现新版本，默认以非阻塞横幅提示，并同时显示一个小红点提醒；诊断面板保留完整详情。
- **D-03:** 更新信息至少显示当前版本、最新版本，以及发布名称或一句更新说明。

### 程序更新健康路径
- **D-04:** 用户点击“立即更新”后，健康路径应在客户端内完成更新包下载，而不是直接跳浏览器或网盘。
- **D-05:** 如果用户正在生成课程、下载素材或执行本地任务，默认不强制打断；提供“现在更新”与“稍后更新”两种选择，默认允许稍后处理。
- **D-06:** 更新包下载完成后，由用户选择“重启并安装”或“稍后”，不做强制退出安装。
- **D-07:** 程序更新失败时，主恢复入口为重试、打开日志目录、以及官方下载入口。

### 模型/资源增量更新
- **D-08:** Bottle 1.0 模型/资源更新也在客户端启动时自动检查，同时保留手动触发。
- **D-09:** 发现模型更新后不自动后台下载，而是提示用户手动点“更新模型”。
- **D-10:** 模型增量更新一律写入用户目录；安装包内置模型仅作为只读基线，不直接修改打包目录。
- **D-11:** 模型更新进度至少显示文件数进度、当前文件名，并在失败后允许直接重试。
- **D-12:** 现有 bundled model 可作为第一次落地到 user-data 的基线副本，然后在 user-data 上继续做增量更新。

### 失败恢复与资产边界说明
- **D-13:** 失败态主文案保持面向普通用户，只说明可理解的原因类别和下一步动作，不默认暴露技术细节。
- **D-14:** 模型更新失败后的默认恢复动作是“重试更新”或“暂不更新”，不强制用户立即做完整重下。
- **D-15:** 在诊断面板或帮助说明中明确区分“程序核心运行时随正式包更新”与“Bottle 1.0 模型资源可单独增量更新”。
- **D-16:** 团队侧必须维护一份资产边界清单，区分“打包保护资产”与“允许增量更新资产”，并纳入发布检查。

### the agent's Discretion
- 小红点的精确位置、何时消失、是否按版本号清除
- 横幅 copy、视觉层级、与诊断入口的具体组合方式
- 程序更新下载实现细节，例如后台任务管理、断点续传、安装器调用方式
- 模型更新失败原因的内部分类、日志字段和状态枚举设计

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 阶段目标与上游约束
- `.planning/PROJECT.md` - v2.2 目标、更新可靠性约束、桌面产品边界
- `.planning/workstreams/milestone/REQUIREMENTS.md` - DESK-02, DESK-03, DESK-04, DESK-05, SECU-03
- `.planning/workstreams/milestone/ROADMAP.md` - Phase 14 goal, success criteria, and 14-01/02/03 plan split
- `.planning/workstreams/milestone/STATE.md` - 当前里程碑状态与对 Phase 13 的依赖
- `.planning/workstreams/milestone/phases/13-/13-CONTEXT.md` - stable-only 发布面、下载入口和 release metadata 决策

### 桌面运行时与更新链路
- `desktop-client/electron/main.mjs` - client/model update state、IPC 通道、更新检查与模型更新编排
- `desktop-client/electron/preload.cjs` - renderer 侧 `desktopRuntime` 更新桥接契约
- `desktop-client/electron/runtime-config.mjs` - 运行时配置持久化、clientUpdate 默认值来源
- `desktop-client/electron/model-updater.mjs` - delta 计算、bundled base clone、文件替换与 `.backup` 行为
- `desktop-client/electron/helper-runtime.mjs` - packaged runtime、bundled model 与 install-state 解析
- `desktop-client/scripts/write-runtime-defaults.mjs` - stable metadata URL 与默认下载入口写入规则
- `desktop-client/scripts/release-win.mjs` - stable release metadata 与 `desktop-releases.json` 生成契约

### 后端 metadata 与模型资源接口
- `app/main.py` - `/desktop/client/latest.json`、stable-only channel metadata 与 `/download/desktop` redirect
- `app/api/routers/local_asr_assets.py` - model manifest、单文件下载与 bundled install API

### 共享前端与验证契约
- `frontend/src/features/upload/UploadPanel.jsx` - 客户端诊断 UI、desktop guidance、更新状态展示入口
- `tests/contracts/test_desktop_runtime_contract.py` - preload/main/model-updater 的桥接与状态契约
- `tests/contracts/test_desktop_installer_contract.py` - packaged runtime defaults、bundled resources、stable packaging contract
- `tests/contracts/test_desktop_release_surface_contract.py` - stable-only release metadata 与 `/download/desktop` redirect contract

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/features/upload/UploadPanel.jsx`: 已有“客户端诊断”弹窗、版本状态卡片、desktop guidance，可直接扩展为 Phase 14 的可见更新入口
- `desktop-client/electron/main.mjs`: 已维护 `desktopClientUpdateState` 与 `desktopModelUpdateState`，并向 renderer 发出状态事件
- `desktop-client/electron/model-updater.mjs`: 已具备文件级 delta 比对、bundled base clone、旧文件 `.backup` 备份能力
- `app/api/routers/local_asr_assets.py`: 已提供 manifest 与单文件下载接口，可直接支撑模型增量更新
- `desktop-client/electron/runtime-config.mjs` 与 `desktop-client/scripts/write-runtime-defaults.mjs`: 已有 stable metadata URL 与下载入口默认值

### Established Patterns
- Desktop renderer 通过 `window.desktopRuntime` preload bridge 调主进程能力，而不是直接用 Node
- 程序更新元数据与下载入口已经围绕 stable-only release surface 设计
- 可更新的本地模型资产放在 user-data，打包资源只作为 bundled runtime 输入
- 失败恢复已经有“打开日志目录”等非阻塞恢复动作模式

### Integration Points
- 程序更新检查从 `/desktop/client/latest.json` 或 `/desktop/client/channels/stable.json` 进入 `desktopClientUpdateState`
- 模型更新检查从 `/api/local-asr-assets/download-models/{modelKey}/manifest` 与文件下载接口进入 `desktopModelUpdateState`
- `UploadPanel.jsx` 中 `onClientUpdateStatusChanged` / diagnostics dialog 是现成的更新提示挂载点
- `helper-runtime.mjs` 与 `desktop-install-state.json` 是区分 bundled 资产与用户侧可更新资产的关键边界

</code_context>

<specifics>
## Specific Ideas

- 用户明确要求程序更新提示除了横幅外，还要有一个小红点提醒。
- 程序更新的健康路径目标是“客户端内下载 + 用户控制何时重启安装”，而不是退回纯网页下载体验。
- 模型更新虽然允许增量，但默认仍由用户确认触发，不做静默后台更新。
- 用户更看重普通人可理解的恢复动作，不希望主界面默认露出技术细节。

</specifics>

<deferred>
## Deferred Ideas

- preview/internal 分发面恢复
- staged rollout / forced update 策略（对应 Future Requirement DESK-06）
- 更完整的面向普通用户的技术诊断展开面板

</deferred>

---

*Phase: 14-desktop-program-and-model-incremental-updates*
*Context gathered: 2026-04-01*
