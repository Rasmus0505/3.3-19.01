---
phase: 01
slug: shared-cloud-generation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 01 — 验证策略

> 面向本阶段执行过程的验证契约，用来控制反馈采样与验证完整性。

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest |
| **Config file** | `pytest.ini` |
| **Quick run command** | `pytest tests/unit/test_dashscope_upload_router.py -q` |
| **Full suite command** | `pytest tests/unit/test_dashscope_upload_router.py tests/contracts/test_desktop_runtime_contract.py tests/integration/test_regression_api.py -k "dashscope or qwen3 or cloud_transcribe or request_url or dashscope_file_id" -q` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/unit/test_dashscope_upload_router.py -q`
- **After every plan wave:** Run `pytest tests/unit/test_dashscope_upload_router.py tests/contracts/test_desktop_runtime_contract.py tests/integration/test_regression_api.py -k "dashscope or qwen3 or cloud_transcribe or request_url or dashscope_file_id" -q`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | WEB-01 | unit | `pytest tests/unit/test_dashscope_upload_router.py -q` | ✅ | ⬜ pending |
| 01-01-02 | 01 | 1 | WEB-03 | integration | `pytest tests/integration/test_regression_api.py -k "dashscope_file_id or request_url" -q` | ✅ | ⬜ pending |
| 01-02-01 | 02 | 2 | WEB-02 | contract | `pytest tests/contracts/test_desktop_runtime_contract.py -k "requestCloudApi" -q` | ✅ | ⬜ pending |
| 01-02-02 | 02 | 2 | DESK-02 | contract | `pytest tests/contracts/test_desktop_runtime_contract.py -k "uploadWithProgress" -q` | ✅ | ⬜ pending |
| 01-03-01 | 03 | 3 | AUTH-02 | integration | `pytest tests/integration/test_regression_api.py -k "resume or terminate or task" -q` | ✅ | ⬜ pending |
| 01-03-02 | 03 | 3 | BILL-01 | e2e/integration | `pytest tests/e2e/test_e2e_key_flows.py -q` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] 不需要新增测试框架，现有 pytest 基础设施已覆盖本阶段。
- [ ] 如果当前测试未覆盖“直传是唯一主路径”这一事实，需要补 focused regression 测试。

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 网页端用户看到桌面专属弹窗和 CTA | WEB-02 | 弹窗位置和 CTA 层级是视觉行为 | 在 Web UI 中触发桌面专属场景，确认弹窗出现且右下角 CTA 可见 |
| Web 和 Desktop 的 Bottle 2.0 阶段词汇一致 | DESK-02 | 跨运行时 UX 一致性最容易用真实交互确认 | 在两个运行时中分别启动 Bottle 2.0 任务，比较阶段名称和顺序 |
| 大文件/边界文件会推荐桌面端而不是服务器兜底 | WEB-03 | 这是产品边界提示问题，自动化不容易完全表达 | 使用超大或边界文件，确认 UI 给出桌面端推荐而不是服务端 fallback |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending