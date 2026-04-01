# Phase 15: 桌面运行时边界加固 - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

审核并收紧桌面端主进程、预加载和渲染层边界，让正式发布版本具备更清晰的安全边界。

本阶段交付 SECU-02（渲染层只接收产品明确允许的预加载能力）并验证 SECU-03（区分打包保护资产与可更新资产）。

不包含：程序内自动更新执行、新模型体系、或 preview/internal 分发面。

</domain>

<decisions>
## Implementation Decisions

### Sandbox 策略
- **D-01:** 正式发布版强制开启 sandbox（`sandbox: true`），开发模式保持 `sandbox: false`。
- **D-02:** Phase 15 需验证开启 sandbox 后没有功能回归（特别关注文件选择、对话流、嵌入内容）。

### openExternalUrl 白名单
- **D-03:** `openExternalUrl` 方法改为白名单模式，只允许打开官方认可域名。
- **D-04:** 当前白名单至少包含：`snapany.com`（备选链接场景）、官方下载域名。
- **D-05:** 白名单在 `runtime-config.mjs` 中配置，允许通过配置文件扩展，无需改代码。

### preload 暴露面审核
- **D-06:** Phase 15 审核所有 21 个 preload 方法，确认每个方法的必要性。
- **D-07:** 历史遗留、无产品路径调用的方法标记为候选移除；最终清理范围由审核结果决定。

### webSecurity 边界验证
- **D-08:** Phase 15 需验证正式发布版 `webSecurity: true` 后没有跨域或资源加载回归。
- **D-09:** 测试结果记录到 `15-VALIDATION.md`，作为 SECU-02 验证证据。

### 资产边界记录
- **D-10:** 继承 Phase 14 SECU-03 决策：打包保护资产（Bottle 1.0 运行时、bundled model）与可更新资产（user-data 模型）边界已在 Phase 14 说明，Phase 15 复验。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 阶段目标与上游约束
- `.planning/PROJECT.md` - 桌面安全边界约束、棕色区保留原则
- `.planning/workstreams/milestone/REQUIREMENTS.md` - SECU-02, SECU-03
- `.planning/workstreams/milestone/ROADMAP.md` - Phase 15 goal, success criteria, 15-01/02/03 plan split
- `.planning/workstreams/milestone/STATE.md` - Phase 14 完成状态、SECU-03 继承说明
- `.planning/workstreams/milestone/phases/13-/13-CONTEXT.md` - stable-only 发布面、下载入口
- `.planning/workstreams/milestone/phases/14-/14-CONTEXT.md` - 模型增量更新决策、SECU-03 资产边界、D-16 资产边界清单

### 桌面运行时核心文件
- `desktop-client/electron/main.mjs` - BrowserWindow 创建、sandbox/webSecurity 当前值、全部 ipcMain handlers
- `desktop-client/electron/preload.cjs` - 全部 21 个暴露方法、auth/localAsr 命名空间
- `desktop-client/electron/runtime-config.mjs` - 运行时配置解析、clientUpdate 配置结构
- `desktop-client/electron/helper-runtime.mjs` - packaged runtime 解析、bundled model 目录

### 前端集成点
- `frontend/src/features/upload/UploadPanel.jsx` - `openExternalUrl` 唯一调用点（SnapAny fallback）

### 验证契约
- `tests/contracts/test_desktop_runtime_contract.py` - preload/main 桥接与状态契约
- `tests/contracts/test_desktop_installer_contract.py` - packaged runtime defaults、资产边界
- `tests/contracts/test_desktop_release_surface_contract.py` - stable-only release metadata

</canonical_refs>

<codebase>
## Existing Code Insights

### Reusable Assets
- `runtime-config.mjs`: 已有配置解析结构，`clientUpdate` 配置块可复用为 `openExternalWhitelist` 配置
- Phase 14 契约测试框架（`test_desktop_runtime_contract.py`）可扩展覆盖 sandbox/webSecurity 验证

### Established Patterns
- BrowserWindow 配置集中在 `createMainWindow()` 函数（`main.mjs` 第 1239-1267 行）
- preload bridge 使用 `contextBridge.exposeInMainWorld` 暴露，auth 使用子命名空间 `desktopRuntime.auth`
- `openExternalUrl` 目前只有一处调用（SNA

...

pAny fallback），白名单实现成本低

### Integration Points
- `openExternalUrl` 白名单逻辑在 `main.mjs` 的 `openExternalUrl` 函数中实现（约第 1041-1048 行）
- sandbox/webSecurity 条件在 `main.mjs` 第 1249-1255 行（BrowserWindow webPreferences 块）

</codebase>

<specifics>
## Specific Ideas

- 用户明确要求全部采用推荐方案，不需要讨论细节。
- 用户希望我（Claude）能讲清楚技术概念，帮助产品视角做判断。
- Phase 15 的 preload 清理范围由审核结果决定，不预先锁定清理数量。

</specifics>

<deferred>
## Deferred Ideas

- preview/internal 分发面恢复（Phase 13/14 deferral）
- staged rollout / forced update 策略（Future Requirement DESK-06）
- 更完整的面向普通用户的技术诊断展开面板（Phase 14 deferral）
- 发音/音标与框选翻译可行性评估（Future Requirements WORD-07/08）

</deferred>

---

*Phase: 15-desktop-runtime-boundary-hardening*
*Context gathered: 2026-04-01*
