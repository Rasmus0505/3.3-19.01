---
phase: "09"
slug: wordbook-account-and-web-bottle-boundary
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-03-28"
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `pytest` + Vite build |
| **Config file** | `pytest.ini`, `frontend/package.json` |
| **Quick run command** | `pytest tests/contracts/test_auth_contract.py tests/integration/api/test_wordbook_api.py -q` |
| **Full suite command** | `npm --prefix frontend run build:app-static && pytest tests/contracts/test_auth_contract.py tests/contracts/test_phase09_surface_contract.py tests/integration/api/test_wordbook_api.py -q` |
| **Estimated runtime** | ~120-240 seconds |

---

## Sampling Rate

- **After every task commit:** Run the narrowest automated command listed in the map below
- **After every plan wave:** Run `npm --prefix frontend run build && pytest tests/contracts/test_auth_contract.py tests/integration/api/test_wordbook_api.py -q`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 240 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | ACC-01 | migration/model | `pytest tests/contracts/test_auth_contract.py -q` | ✅ | ⬜ pending |
| 09-01-02 | 01 | 1 | ACC-01, ACC-02, ACC-03 | contract/integration | `pytest tests/contracts/test_auth_contract.py -q` | ✅ | ⬜ pending |
| 09-02-01 | 02 | 2 | ACC-01, ACC-03, ACC-04 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 09-02-02 | 02 | 2 | ACC-02, ACC-04 | frontend contract/build | `npm --prefix frontend run build && pytest tests/contracts/test_phase09_surface_contract.py -q` | ❌ W0 | ⬜ pending |
| 09-03-01 | 03 | 1 | WBK-01, WBK-02, WBK-04 | integration | `pytest tests/integration/api/test_wordbook_api.py -q` | ✅ | ⬜ pending |
| 09-03-02 | 03 | 1 | WBK-02, WBK-03, WBK-04 | frontend contract/build | `npm --prefix frontend run build && pytest tests/contracts/test_phase09_surface_contract.py -q` | ❌ W0 | ⬜ pending |
| 09-04-01 | 04 | 1 | WEB-01, WEB-02, WEB-03 | frontend contract | `pytest tests/contracts/test_phase09_surface_contract.py -q` | ❌ W0 | ⬜ pending |
| 09-04-02 | 04 | 1 | WEB-01, WEB-02, WEB-03 | static/build | `npm --prefix frontend run build:app-static` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/contracts/test_phase09_surface_contract.py` — contract tests covering account panel registration, sidebar order, redeem panel removal, wordbook review entry labels, and UploadPanel old-name removal
- [ ] Extend `tests/contracts/test_auth_contract.py` to validate username in `UserResponse` and `GET /api/auth/me`
- [ ] Extend `tests/integration/api/test_wordbook_api.py` with due queue / review action coverage

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 个人中心放在学习侧边栏最上方且兑换码入口已并入其中 | ACC-02, ACC-04 | 信息架构和真实导航路径更适合人工确认 | 登录后打开学习壳，确认侧边栏最上方是个人中心；进入后能看到用户名信息与兑换码充值区块；侧边栏不再有独立“兑换码充值”入口 |
| 生词本“开始复习”入口进入专门复习流并展示四档反馈 | WBK-03, WBK-04 | 需要真实点击流确认 due queue 与按钮语义 | 准备至少一个到期词条，进入生词本，点击顶部“开始复习”，确认进入复习态并显示 `重来 / 很吃力 / 想起来了 / 很轻松` |
| 记忆率达到阈值后才显示“已掌握” | WBK-02 | UI 细节和算法输出联动需要人工确认 | 选取一个接近阈值的词条做多次复习，确认列表先显示百分比，再在达到 `0.85` 后切换为 `已掌握` |
| UploadPanel 用户面向表面不再出现旧词且 Bottle 1.0 仍不可网页执行 | WEB-01, WEB-02, WEB-03 | 需要真实页面确认用户可见文案和 CTA 行为 | 打开上传页，检查模型卡、桌面引导弹窗和阻断状态文案；确认看不到 `本机识别 / 云端识别`，且 Bottle 1.0 仍只引导下载桌面端 |

---

## Validation Sign-Off

- [ ] All tasks have automated verification or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all missing contract assertions
- [ ] No watch-mode flags
- [ ] Feedback latency < 240s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

---

_Phase: 09-wordbook-account-and-web-bottle-boundary_  
_Last updated: 2026-03-28_
