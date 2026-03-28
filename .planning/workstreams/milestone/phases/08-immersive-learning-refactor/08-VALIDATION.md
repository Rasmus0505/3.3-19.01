---
phase: "08"
slug: immersive-learning-refactor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-03-28"
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `pytest` + Vite build |
| **Config file** | `pytest.ini`, `frontend/package.json` |
| **Quick run command** | `npm --prefix frontend run build` |
| **Full suite command** | `npm --prefix frontend run build:app-static && pytest tests/contracts/test_learning_immersive_contract.py tests/e2e/test_e2e_key_flows.py -k "practice_progress or lesson" -q` |
| **Estimated runtime** | ~90-180 seconds |

---

## Sampling Rate

- **After every task commit:** Run the narrowest automated command listed in the map below; before Phase 08 contract tests exist, fall back to `npm --prefix frontend run build`
- **After every plan wave:** Run `npm --prefix frontend run build`
- **Before `$gsd-execute-phase` is considered complete:** Run `npm --prefix frontend run build:app-static` plus the Phase 08 contract/e2e suite
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 08-01-01 | 01 | 1 | IMM-04 | build | `npm --prefix frontend run build` | ⬜ pending |
| 08-01-02 | 01 | 1 | IMM-04 | build | `npm --prefix frontend run build` | ⬜ pending |
| 08-02-01 | 02 | 2 | IMM-02, IMM-03 | build | `npm --prefix frontend run build` | ⬜ pending |
| 08-02-02 | 02 | 2 | IMM-01, IMM-02, IMM-03, IMM-04 | build | `npm --prefix frontend run build` | ⬜ pending |
| 08-03-01 | 03 | 2 | IMM-04, IMM-05 | build | `npm --prefix frontend run build` | ⬜ pending |
| 08-03-02 | 03 | 2 | IMM-04, IMM-05 | build | `npm --prefix frontend run build` | ⬜ pending |
| 08-04-01 | 04 | 3 | IMM-01, IMM-02, IMM-03, IMM-04, IMM-05 | contract | `pytest tests/contracts/test_learning_immersive_contract.py -q` | ⬜ pending |
| 08-04-02 | 04 | 3 | IMM-04, IMM-05 | e2e/build | `npm --prefix frontend run build:app-static && pytest tests/e2e/test_e2e_key_flows.py -k "practice_progress or lesson" -q` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/contracts/test_learning_immersive_contract.py` — source-level contract tests covering state-machine extraction, loop toggle persistence, fixed-speed buttons, previous-sentence speaker button, and禁止回归的全屏重置逻辑
- [ ] `npm --prefix frontend run build` — continue using frontend build as baseline compile check until Phase 08 contract tests land

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 单句循环保持在当前句直到手动退出 | IMM-01, IMM-02 | 需要真实页面交互确认播放器不会偷跳句 | 进入沉浸学习，打开单句循环，答对当前句并观察是否仍停留当前句；再手动点击下一句确认能立即硬切并自动播目标句 |
| 上一句喇叭按钮硬中断当前句并播完后回待命 | IMM-04 | 需要交互确认不会自动恢复当前句循环 | 在当前句播放中点击上一句区域右侧喇叭按钮，确认上一句完整播放一次后返回当前句待命 |
| 全屏 / 上一句显示 / 字幕遮挡板不重置学习状态 | IMM-05 | 输入内容、揭示进度和显示层耦合只能靠真实 UI 验证 | 在当前句已输入一部分并执行过揭示操作后，切全屏、显示/隐藏上一句、开关并拖动遮挡板，确认句子索引、输入内容、揭示进度和当前速率不变 |

---

## Validation Sign-Off

- [ ] All tasks have automated verification or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without `npm --prefix frontend run build`
- [ ] Wave 0 covers missing immersive contract assertions
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter before phase close-out

**Approval:** pending

---

_Phase: 08-immersive-learning-refactor_
_Last updated: 2026-03-28_
