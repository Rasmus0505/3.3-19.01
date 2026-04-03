---
phase: 23
slug: subtitle-mask-and-link-restore
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (frontend project standard — not yet broadly adopted) |
| **Config file** | `frontend/vitest.config.js` or `frontend/vite.config.js` with vitest plugin — **does not exist** |
| **Quick run command** | N/A — no automated frontend tests |
| **Full suite command** | N/A — no automated frontend tests |
| **Estimated runtime** | N/A |

> Phase 23 is **manual verification only**. The frontend project has minimal test coverage (2 legacy `.test.js` files, neither covering immersive or lesson-list components). All `<automated>` verify commands in plans use **grep/shell inspection** — not browser tests. This is acceptable for this phase's scope.

---

## Sampling Rate

- **After every task commit:** Run `<automated>` grep commands from plan's verify block
- **After every plan wave:** Review grep + visual checklist (see Manual-Only Verifications)
- **Before `/gsd-verify-work`:** All grep checks pass
- **Max feedback latency:** < 5 seconds (grep-only)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | MASK-01 (居中) | grep | `grep -n "prevLessonIdRef\|sessionMaxWidthRatioRef" frontend/src/features/immersive/ImmersiveLessonPage.jsx` | ✅ | ⬜ pending |
| 23-01-02 | 01 | 1 | MASK-01 (宽度自适应) | grep | `grep -n "measureSubtitleWidth\|sessionMaxWidthRatioRef" frontend/src/features/immersive/ImmersiveLessonPage.jsx` | ✅ | ⬜ pending |
| 23-01-03 | 01 | 1 | MASK-02 (启用状态) | grep | `grep -n "enabled !== false\|buildTranslationMaskUiPreference.*enabled\|persistTranslationMaskPreference" frontend/src/features/immersive/ImmersiveLessonPage.jsx` | ✅ | ⬜ pending |
| 23-02-01 | 02 | 1 | MASK-04 (入口) | grep | `grep -n "restoreChoiceOpen\|source_url\|AlertDialogContent\|isDesktop" frontend/src/features/lessons/LessonList.jsx` | ✅ | ⬜ pending |
| 23-02-02 | 02 | 1 | MASK-04 (缓存) | grep | `grep -n "handleLinkRestore\|submitLinkRestore\|hasLessonMedia\|requestDesktopLocalHelper" frontend/src/features/lessons/LessonList.jsx` | ✅ | ⬜ pending |
| 23-02-03 | 02 | 1 | MASK-04 (覆盖确认) | grep | `grep -n "overwriteConfirmOpen\|handleOverwriteConfirm" frontend/src/features/lessons/LessonList.jsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — all automated verifications use grep/shell commands that require no setup.

---

## Manual-Only Verifications

| Behavior | Plan | Why Manual | Test Instructions |
|----------|------|------------|-------------------|
| 遮挡板新 lesson 时水平居中 | 01 Task 1 | 需在沉浸学习中切换 lesson，肉眼验证位置 | 1. 打开有字幕遮挡板的 lesson A 2. 拖拽遮挡板到一侧 3. 退出并进入新 lesson B 4. 验证遮挡板在视频中央（58% 宽，距底12px） |
| 遮挡板宽度随句子变宽 | 01 Task 2 | 需在句子间切换，肉眼验证宽度扩展 | 1. 在句子切换过程中遇到长字幕 2. 验证遮挡板宽度扩展 3. 切回短字幕 4. 验证宽度不缩小 |
| "按链接恢复"仅桌面可见 | 02 Task 1 | 需在 web 和 desktop 分别测试 | 1. Web 端：验证"按链接恢复"按钮不出现 2. Desktop 端：验证按钮出现 |
| 覆盖确认弹窗 | 02 Task 3 | 需已缓存本地视频 | 1. 对有本地缓存的 lesson 选择"按链接恢复" 2. 验证覆盖确认弹窗出现 3. 选择"取消" 4. 验证视频未改变 |
| 下载失败不改变状态 | 02 Task 2 | 需模拟网络错误 | 1. 断开网络 2. 选择"按链接恢复" 3. 验证错误提示出现 4. 验证 lesson 视频状态未改变 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify (grep commands) ✓
- [ ] Sampling continuity: grep commands run per-task ✓
- [ ] Wave 0 covers all MISSING references: N/A (no MISSING refs) ✓
- [ ] No watch-mode flags ✓
- [ ] Feedback latency < 5s (grep-only) ✓
- [ ] `nyquist_compliant: true` set in frontmatter — pending until all tasks verified

**Approval:** pending

---

## Nyquist Gap Note

> The frontend project lacks automated test coverage for UI components. Phase 23's `<automated>` commands use grep verification which is fast and reliable. All phase behaviors are also covered by manual verifications above. This is the appropriate strategy given the project's current test infrastructure state.

*Phase: 23-subtitle-mask-and-link-restore*
*Generated: 2026-04-03*
