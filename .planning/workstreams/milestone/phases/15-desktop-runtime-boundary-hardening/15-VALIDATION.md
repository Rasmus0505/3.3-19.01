# Phase 15: 桌面运行时边界加固 - 验证记录

**Phase:** 15-desktop-runtime-boundary-hardening
**验证执行日期:** 2026-04-01
**状态:** passed

---

## SECU-02 验证：渲染层只接收产品明确允许的预加载能力

### openExternalUrl 白名单

| 验证项 | 预期 | 结果 | 证据 |
|--------|------|------|------|
| snapany.com 在默认白名单中 | true | ✅ pass | runtime-config.mjs security.openExternalWhitelist |
| 非白名单 URL 返回 false | false | ✅ pass | main.mjs openExternalUrl 逻辑 |
| snapany.com URL 通过白名单检查 | true | ✅ pass | main.mjs openExternalUrl 逻辑 |
| UploadPanel 有 window.open fallback | true | ✅ | UploadPanel.jsx openSnapAnyFallback 函数 |

### sandbox 配置

| 验证项 | 预期 | 结果 | 证据 |
|--------|------|------|------|
| 正式版 sandbox 为 true | true | ✅ pass | main.mjs sandbox 表达式 |
| 开发模式 sandbox 为 false | false | ✅ pass | main.mjs sandbox 表达式 |
| preload 不依赖 nodeIntegration | 不依赖 | ✅ | preload.cjs 仅用 ipcRenderer/webUtils |
| contextIsolation 保持 true | true | ✅ pass | main.mjs contextIsolation 值 |
| nodeIntegration 保持 false | false | ✅ pass | main.mjs nodeIntegration 值 |

### webSecurity 配置

| 验证项 | 预期 | 结果 | 证据 |
|--------|------|------|------|
| webSecurity 固定为 true | true | ✅ pass | main.mjs webSecurity 值 |
| 无 usingBundledFileRenderer 条件 | 无 | ✅ pass | main.mjs webSecurity 行 |
| 与 Phase 14 prod 行为一致 | 无回归 | ✅ pass | 对比 Phase 14 |

### preload 暴露面

| 验证项 | 预期 | 结果 | 证据 |
|--------|------|------|------|
| 全部 31 个方法有调用方 | 31/31 | ✅ | 15-PRELOAD-AUDIT.md |
| 无历史遗留未使用接口 | 0 | ✅ | 15-PRELOAD-AUDIT.md |

---

## SECU-03 验证：资产边界复验

继承 Phase 14 结论（无需重复验证）。Phase 14 VERIFICATION.md 证据：
- `test_packaged_runtime_prefers_bundled_helper_and_respects_installer_state`
- `test_packaged_runtime_falls_back_to_user_model_dir_when_installer_opted_out`
- `test_model_updater_delta_detects_missing_and_changed_files`

**状态：** ✅ inherited（Phase 14 已覆盖）

---

## 自动化测试覆盖

| 测试 | 覆盖需求 | 状态 |
|------|---------|------|
| test_open_external_url_whitelist_allows_snapany | SECU-02 openExternal | ✅ pass |
| test_open_external_url_whitelist_from_env_override | SECU-02 openExternal env | ✅ pass |
| test_main_process_enables_sandbox_when_packaged | SECU-02 sandbox | ✅ pass |
| test_main_process_web_security_always_true | SECU-02 webSecurity | ✅ pass |
| test_main_process_context_isolation_always_true | SECU-02 contextIsolation | ✅ pass |
| test_main_process_node_integration_always_false | SECU-02 nodeIntegration | ✅ pass |
| test_preload_exposes_all_31_methods | SECU-02 preload | ✅ pass |
| test_preload_uses_context_bridge_not_direct_ipc | SECU-02 preload | ✅ pass |
| test_open_external_url_in_upload_panel_has_fallback | SECU-02 openExternal | ✅ pass |
| test_asset_boundary_inherited_from_phase14 | SECU-03 | Phase 14 已覆盖 |

---

## 最终结论

**所有验证项均已通过。** Phase 15 安全边界收紧完成。
