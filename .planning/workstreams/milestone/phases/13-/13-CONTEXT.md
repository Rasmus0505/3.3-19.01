# Phase 13: 桌面发布管线与签名安装包 - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

把当前 Electron 桌面工程从“能打包”提升到“能正式对外发布”。本阶段要交付可追溯的 Windows 官方安装包、官网内统一下载入口、同站点发布元数据、stable/preview 发布分流，以及进入正式流程的签名步骤与验证记录。它不负责把程序内自动更新和模型增量更新做成完整用户体验，那些属于 Phase 14。

</domain>

<decisions>
## Implementation Decisions

### 官方发布入口与版本真相
- **D-01:** 现有学习网站内新增一个统一的“下载桌面版”正式页面，作为面向真实用户的唯一官方桌面下载入口。
- **D-02:** 网页端所有需要引导桌面版的地方都应指向这一个正式下载页，而不是散落的下载链接或第三方地址。
- **D-03:** 下载页是转化/支持入口，不替换现有高频主导航；像“历史记录”“上传素材”这类核心工作流入口保持原位。
- **D-04:** 用户可见下载页与机器可读 release metadata 必须放在同一站点体系下，并共享同一套版本事实源。

### 发布记录与渠道管理
- **D-05:** 每次正式桌面发布都必须能对应一条可追溯的 release 记录，至少覆盖版本号、发布时间、下载地址、更新说明摘要、渠道和签名结果。
- **D-06:** 从 Phase 13 开始正式区分 `stable` 与 `preview` 两个 channel。
- **D-07:** 默认官网入口和普通用户客户端只面向 `stable`；`preview` 仅用于内部测试或小范围验证，不进入默认用户入口。

### 安装包内容策略
- **D-08:** 官方正式安装包默认提供完整桌面体验，随包预装 Electron 主程序、helper runtime、`ffmpeg`、`yt-dlp` 与当前默认 Bottle 1.0 本地模型/资源。
- **D-09:** 用户完成安装后，不应再被要求理解或单独安装 helper、模型、`ffmpeg`、`yt-dlp` 等运行资产。
- **D-10:** 安装包体积优化应优先通过后续 Phase 14 的增量更新能力解决，而不是在 Phase 13 牺牲首次安装完整性。

### 安装器对外表达
- **D-11:** 正式发布版安装器不暴露 `model`、`helper`、`ffmpeg`、`yt-dlp`、资源包之类技术概念。
- **D-12:** 正式发布版安装器默认完整安装，不给普通用户显示资源级选择项。
- **D-13:** 安装器只保留用户能够理解且确有必要的通用选项，例如安装路径、桌面快捷方式等。

### the agent's Discretion
- 下载桌面页最终放在站点顶部导航、账户区域、上传页桌面引导 CTA 还是其他产品入口，只要满足“统一跳转到同一官方页面”即可。
- release metadata 的具体路径与字段命名可以由后续研究/规划决定，只要 stable 与 preview 分离、且与官网下载页保持同一版本事实源即可。
- release 记录先落静态 metadata 还是轻量后台记录可以由后续规划决定，只要外部体验和可追溯性满足上述决策即可。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 里程碑目标与正式发布边界
- `.planning/PROJECT.md` — v2.2 目标、桌面端是完整体验、非技术用户优先、更新可靠性高于“看起来有更新”
- `.planning/REQUIREMENTS.md` — Phase 13 直接对应 `DESK-01`、`SECU-01`，并界定 Phase 14 才负责 `DESK-02`~`DESK-05`、`SECU-03`
- `.planning/ROADMAP.md` — Phase 13 目标与成功标准；当前根目录 roadmap 是 v2.2 的权威来源
- `.planning/STATE.md` — v2.2 当前主状态与“Phase 13 context gathered”后的下一步

### 上游已锁定决策
- `.planning/workstreams/milestone/phases/02-desktop-local-generation/02-CONTEXT.md` — 桌面端应保持低技术感知，用户不应理解 helper/model/ffmpeg
- `.planning/workstreams/milestone/phases/07.1-memo/07.1-CONTEXT.md` — 桌面工作流产品化、统一下载/支持 promise、网站端 CTA 边界
- `.planning/workstreams/milestone/phases/07.1-memo/07.1-RELEASE-CHECKLIST.md` — 通过发布 checklist 锁定对外 promise，而不是靠临时口头约定

### v2.2 研究输入
- `.planning/research/SUMMARY.md` — 建议保留 `electron-builder + nsis`，补齐签名、release logging，并避免“能检查不能完成”的假更新
- `.planning/research/FEATURES.md` — 桌面正式分发的 table stakes：签名安装包、可追溯版本记录、清晰失败恢复

### 当前桌面发布实现与约束
- `desktop-client/package.json` — 现有 NSIS 目标、完整 extraResources 打包、正式安装包的当前资源边界
- `desktop-client/scripts/package-win.mjs` — 现有打包主入口；当前仍写死 preview 环境 URL，需收口到正式发布流
- `desktop-client/scripts/write-runtime-defaults.mjs` — 将 `clientUpdate.metadataUrl` 与 `entryUrl` 写入发布产物的当前机制
- `desktop-client/electron/main.mjs` — 当前客户端更新仍是“检查元数据 + 打开下载链接”，不是程序内自动更新执行
- `desktop-client/build/installer.nsh` — 当前安装器仍暴露“预装模型”技术选项，正式版需要隐藏
- `frontend/src/features/upload/UploadPanel.jsx` — 已有桌面客户端版本/更新诊断与外部下载入口，网站侧 CTA 可复用现有模式
- `tests/contracts/test_desktop_installer_contract.py` — 当前桌面打包/安装契约测试，后续需根据正式版安装器 UX 调整断言
- `tests/contracts/test_desktop_runtime_contract.py` — 当前打包运行时、预装模型、更新桥接相关契约

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `desktop-client/package.json`: 已经具备 `nsis` 正式安装包目标和完整 `extraResources` 清单，说明“完整安装包”不是新发明，而是现有能力产品化。
- `desktop-client/scripts/package-win.mjs`: 已有 build -> 写 runtime defaults -> build helper runtime -> electron-builder 的打包骨架，可扩展为正式 release pipeline。
- `desktop-client/scripts/write-runtime-defaults.mjs`: 已有把下载入口和更新 metadata 注入安装包的机制，适合作为同站点 release metadata 的落点。
- `desktop-client/electron/main.mjs`: 已有客户端版本状态、检查更新、打开下载入口桥接，说明网站下载页与客户端入口可以收敛到同一事实源。
- `frontend/src/features/upload/UploadPanel.jsx`: 已有桌面更新/版本诊断 UI，可在不重造桌面专页的情况下复用统一下载入口。
- `tests/contracts/test_desktop_installer_contract.py` / `tests/contracts/test_desktop_runtime_contract.py`: 已有桌面打包/运行时 contract suite，可作为正式发布回归基础。

### Established Patterns
- 桌面端通过 Electron 包一套共享前端，而不是另起第二套桌面 UI。
- 产品长期方向是低技术感知，正式交付不能把 helper、模型、媒体工具等技术概念前置给用户。
- 既有桌面能力默认追求“安装后即可用”，不鼓励把首次体验拆成多轮资源准备。
- 07.1 已经建立了“发布 checklist 锁定外部 promise”的工作方式，Phase 13 应沿用，而不是恢复为手工临时打包。

### Integration Points
- 官网下载页需要与现有网页 CTA、账户/上传/计费等桌面引导入口复用同一目标 URL。
- 正式 release metadata 需要同时服务网站下载页、桌面客户端 `clientUpdate` 状态和未来 Phase 14 的升级能力。
- 正式发布管线需要贯穿 `package-win.mjs`、签名步骤、网站发布入口和 contract tests，而不是只改 Electron 打包脚本。

</code_context>

<specifics>
## Specific Ideas

- 用户明确希望官方桌面安装包放在自己现有的学习网站内，而不是跳去陌生的第三方下载站。
- 讨论中明确否定了“用下载入口替换主侧边栏高频工作区”的方向；下载页应是统一 CTA 目的地，不是新的主工作台。
- 当前 GSD toolchain 仍把 Phase 13 artifacts 写到 `.planning/workstreams/milestone/phases/13-`，但 v2.2 的权威 scope 以根目录 `.planning/ROADMAP.md` / `.planning/REQUIREMENTS.md` / `.planning/STATE.md` 为准；后续 agent 需要避免误读旧的 workstream roadmap。

</specifics>

<deferred>
## Deferred Ideas

- 完整后台化的桌面 release 管理模型 / 管理台发布中心：可后续从静态 metadata 演进，不作为 Phase 13 硬前置。
- 程序内真正自动更新执行、模型增量更新的用户体验与失败恢复：属于 Phase 14。
- `stable / preview` 之外更细的 `beta / internal / staged rollout / forced update` 策略：后续再扩，不在 Phase 13 引入。
- 轻安装包或首次启动再拉取模型/工具资源：与当前“完整体验、低技术感知”相冲突，暂不进入本阶段。

</deferred>

---

*Phase: 13-desktop-release-pipeline-and-signed-installer*
*Context gathered: 2026-03-31*
