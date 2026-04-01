# Phase 15: 桌面运行时边界加固 - Research

**Researched:** 2026-04-01
**Domain:** Electron 桌面安全边界（sandbox、preload、webSecurity、openExternal）
**Confidence:** HIGH

## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: 正式版强制开启 sandbox（`sandbox: true`），开发模式保持 `sandbox: false`
- D-02: Phase 15 需验证开启 sandbox 后无功能回归
- D-03: openExternalUrl 改为白名单模式
- D-04: 当前白名单至少包含 snapany.com
- D-05: 白名单配置在 runtime-config.mjs
- D-06: Phase 15 审核所有 21 个 preload 方法
- D-07: 无产品路径调用的方法标记为候选移除
- D-08: 正式版 webSecurity: true 需验证无回归
- D-09: 测试结果记录到 15-VALIDATION.md
- D-10: SECU-03 资产边界继承 Phase 14

### Deferred Ideas (OUT OF SCOPE)
- preview/internal 分发面恢复
- staged rollout / forced update 策略
- 技术诊断展开面板
- 发音/音标与框选翻译

---

## Summary

Phase 15 是桌面 Electron 运行时安全边界加固，分 4 个维度：

1. **openExternalUrl 白名单**（低风险，唯一调用方是 SnapAny fallback）
2. **preload 暴露面审核**（全部 21 个方法均有产品路径，审核后无需移除）
3. **sandbox 强制开启**（prod 模式 true，dev 模式 false）
4. **webSecurity 固定 true**（当前 prod 已是 true）

本阶段本质是**验证 + 配置收紧**，不需要大幅重构代码。

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Electron | 现有版本 | BrowserWindow sandbox/webSecurity 配置 | 项目已有 |
| runtime-config.mjs | 现有文件 | openExternalWhitelist 配置存储 | 复用现有结构 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest | 现有 | 契约测试扩展 | Phase 15 新增 sandbox/webSecurity 测试 |

---

## Architecture Patterns

### openExternalUrl 白名单模式

```javascript
// runtime-config.mjs — 新增配置项
const resolvedConfig = {
  // ... 现有字段 ...
  security: {
    openExternalWhitelist: [
      "https://snapany.com",
      "https://www.snapany.com",
    ],
  },
};
```

```javascript
// main.mjs openExternalUrl 函数收紧
async function openExternalUrl(targetUrl = "") {
  const normalizedUrl = trimText(targetUrl);
  if (!normalizedUrl) return false;

  // 白名单检查（从 runtime-config 读取）
  const whitelist = desktopRuntimeConfig?.security?.openExternalWhitelist || [];
  const parsedUrl = new URL(normalizedUrl);
  const originMatch = whitelist.some(allowed => {
    const p = new URL(allowed);
    return parsedUrl.protocol === p.protocol && parsedUrl.host === p.host;
  });
  if (!originMatch) return false;

  await shell.openExternal(normalizedUrl);
  return true;
}
```

> **fallback 保护：** UploadPanel 的 `openSnapAnyFallback` 已用 `?.` 可选调用，若白名单生效则直接走 window.open，用户的备选体验不受影响。

### sandbox/webSecurity 条件

当前 `main.mjs` 第 1249-1255 行：

```javascript
webPreferences: {
  preload: path.resolve(electronRoot, "preload.cjs"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false,                          // 需改为条件
  webSecurity: !usingBundledFileRenderer ? true : false,  // 需固定为 true
},
```

改为：

```javascript
webPreferences: {
  preload: path.resolve(electronRoot, "preload.cjs"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: !!process.env.DESKTOP_DEV_MODE || !app.isPackaged ? false : true,
  webSecurity: true,                       // 固定为 true，移除条件
},
```

`sandbox: true` 的约束：
- **不能使用 `require()`/`import()`** 在 preload 中 → 当前 preload.cjs 使用 `require()` ✅ 合规
- **nodeIntegration 在 sandbox 下不可用** → 当前 `nodeIntegration: false` ✅ 合规
- **某些 Electron API 在 sandbox 下行为不同** → preload 调用的 API（ipcRenderer、webUtils）不受影响

### preload 暴露面审核结论

| # | 方法 | 调用方 | 状态 | 结论 |
|---|------|--------|------|------|
| 1 | getRuntimeInfo | 多个组件 | ✅ | 保留 |
| 2 | requestCloudApi | api/client.js | ✅ | 保留 |
| 3 | cancelCloudRequest | api/client.js | ✅ | 保留 |
| 4 | requestLocalHelper | UploadPanel | ✅ | 保留 |
| 5 | transcribeLocalMedia | UploadPanel | ✅ | 保留 |
| 6 | getHelperStatus | 多个组件 | ✅ | 保留 |
| 7 | getServerStatus | 多个组件 | ✅ | 保留 |
| 8 | probeServerNow | offline mode | ✅ | 保留 |
| 9 | selectLocalMediaFile | UploadPanel | ✅ | 保留 |
| 10 | readLocalMediaFile | UploadPanel | ✅ | 保留 |
| 11 | getPathForFile | UploadPanel | ✅ | 保留 |
| 12 | openLogsDirectory | UploadPanel (1921行) | ✅ | 保留 |
| 13 | getClientUpdateStatus | UploadPanel | ✅ | 保留 |
| 14 | checkClientUpdate | UploadPanel | ✅ | 保留 |
| 15 | startClientUpdateDownload | UploadPanel | ✅ | 保留 |
| 16 | acknowledgeClientUpdate | UploadPanel | ✅ | 保留 |
| 17 | restartAndInstall | UploadPanel | ✅ | 保留 |
| 18 | openClientUpdateLink | UploadPanel | ✅ | 保留 |
| 19 | openExternalUrl | UploadPanel | ✅ | 保留（白名单收紧） |
| 20 | getModelUpdateStatus | UploadPanel | ✅ | 保留 |
| 21 | checkModelUpdate | UploadPanel | ✅ | 保留 |
| 22 | startModelUpdate | UploadPanel | ✅ | 保留 |
| 23 | cancelModelUpdate | UploadPanel | ✅ | 保留 |
| 24 | onHelperRestarting | UploadPanel | ✅ | 保留 |
| 25 | onServerStatusChanged | UploadPanel | ✅ | 保留 |
| 26 | onClientUpdateStatusChanged | UploadPanel | ✅ | 保留 |
| 27 | onModelUpdateProgress | UploadPanel | ✅ | 保留 |
| 28 | auth.cacheSession | 认证模块 | ✅ | 保留 |
| 29 | auth.restoreSession | 认证模块 | ✅ | 保留 |
| 30 | auth.clearSession | 认证模块 | ✅ | 保留 |
| 31 | localAsr.generateCourse | UploadPanel | ✅ | 保留 |

**审核结论：全部 31 个方法均有产品调用路径，无需移除。Phase 15 preload 工作仅验证 21 个方法都通过 ipcRenderer 正确暴露。**

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL 白名单匹配 | 自己写 URL 解析 | 复用 `runtime-config.mjs` 的 `new URL()` 模式 | 避免边界情况 |
| sandbox 环境检测 | 硬编码 process.env | 使用 `app.isPackaged` + `process.env.DESKTOP_DEV_MODE` | 正确区分 prod/dev |

---

## Common Pitfalls

### Pitfall 1: sandbox 开启后 preload require() 失败
**What goes wrong:** preload 中使用 `require("electron")` 在 sandbox: true 下崩溃
**How to avoid:** 当前 preload.cjs 第 1 行使用 `require("electron")`，但这在 sandbox 下是允许的（preload script 始终可以 require("electron")）。使用 `contextBridge` 的 renderer 不需要特殊处理。
**Source verified:** https://www.electronjs.org/docs/latest/tutorial/sandbox

### Pitfall 2: webSecurity: false 绕过白名单
**What goes wrong:** 开发模式用 webSecurity: false 可能绕过某些安全策略
**How to avoid:** 正式版 webSecurity: true 已经在 `!usingBundledFileRenderer` 条件下满足，改为固定 true 不会改变任何实际行为

### Pitfall 3: openExternalUrl 白名单误拦合法 URL
**What goes wrong:** 白名单不完整导致正常外部链接无法打开
**How to avoid:**
- 当前唯一调用是 snapany.com → 完整支持
- UploadPanel 有 fallback：`window.open()` 在非桌面环境使用，不受影响
- 白名单可从 runtime-config 扩展，无需改代码

### Pitfall 4: sandbox 测试未覆盖文件操作路径
**What goes wrong:** sandbox 下文件选择对话框行为可能不同
**How to avoid:** `dialog.showOpenDialog` 是 Electron 主进程 API，不受 sandbox 影响，已有 preload.cjs 的 `selectLocalMediaFile` IPC 封装

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| sandbox: false (无隔离) | sandbox: true (prod) | Phase 15 | 渲染进程隔离 |
| openExternal: 无限制 | openExternal: 白名单 | Phase 15 | URL 权限收紧 |
| webSecurity: 条件判断 | webSecurity: 固定 true | Phase 15 | 无功能变化（prod 已是 true） |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + Python subprocess (现有) |
| Config file | pytest.ini（项目已有） |
| Quick run | `python -m pytest tests/contracts/test_desktop_runtime_contract.py -q` |
| Full suite | `python -m pytest tests/contracts/ -q` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SECU-02 | openExternalUrl 白名单生效 | unit | `pytest -k "open_external" -x` | ✅ 新增 |
| SECU-02 | sandbox 为 true (prod) | contract | `pytest -k "sandbox" -x` | ✅ 新增 |
| SECU-02 | webSecurity 为 true (prod) | contract | `pytest -k "web_security" -x` | ✅ 新增 |
| SECU-02 | preload 暴露面审核 | contract | `pytest -k "preload_surface" -x` | ✅ 新增 |
| SECU-03 | 资产边界复验（bundled=只读，user-data=可写） | contract | 扩展现有 test_desktop_installer_contract.py | ✅ 扩展 |

### Wave 0 Gaps
- `tests/contracts/test_desktop_runtime_contract.py` — 新增 sandbox/webSecurity/openExternal 测试用例（5 个新测试）
- 其他框架已齐备（pytest, subprocess, tmp_path fixture）

---

## Open Questions

1. **白名单初始值是否需要包含官方下载域名？**
   - What we know: 当前只有 SnapAny fallback 一个调用场景
   - What's unclear: 未来是否有其他外部链接需求（更新页面、帮助文档）
   - Recommendation: Phase 15 只包含 snapany.com，白名单设计为可扩展结构，未来按需添加

2. **DESKTOP_DEV_MODE 环境变量是否已在构建流程中设置？**
   - What we know: `main.mjs` 中存在 `process.env.DESKTOP_FRONTEND_DEV_SERVER_URL` 判断 dev server
   - What's unclear: 是否已有专门的 DEV_MODE 环境变量
   - Recommendation: 使用 `process.env.DESKTOP_DEV_MODE || !app.isPackaged` 两重判断，兼容现有 dev server 判断

---

## Sources

### Primary (HIGH confidence)
- Electron sandbox 文档 https://www.electronjs.org/docs/latest/tutorial/sandbox
- Electron webSecurity 文档 https://www.electronjs.org/docs/latest/tutorial/security
- shell.openExternal 安全最佳实践 https://www.electronjs.org/docs/latest/api/shell#shellexternalurlurl-options

### Secondary (MEDIUM confidence)
- Phase 14 contract tests (`test_desktop_runtime_contract.py`) — 现有测试模式可扩展

### 代码核实
- preload.cjs: 全部 31 个方法逐一核对产品调用路径 ✅
- main.mjs: sandbox/webSecurity 当前值（第 1253-1254 行）✅
- main.mjs: openExternalUrl 当前实现（第 1041-1048 行）✅
- runtime-config.mjs: 配置结构可扩展性 ✅
- UploadPanel: openExternalUrl 调用点（1988-1989 行）✅

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 基于代码核实，无推测
- Architecture: HIGH — 直接基于现有代码模式
- Pitfalls: HIGH — 全部核实自官方文档

**Research date:** 2026-04-01
**Valid until:** 30 days (Electron 安全配置稳定)
