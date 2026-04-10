---
phase: 38
slug: brand-rename
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend) |
| **Config file** | `frontend/vite.config.js` |
| **Quick run command** | `cd frontend && npm run build 2>&1 | tail -20` |
| **Full suite command** | `cd frontend && npm run build && grep -r "Bottle" src --include="*.tsx" --include="*.jsx" --include="*.ts" --include="*.js" \| grep -v "lessonListHelpers\|uploadTaskViewModel\|buildBottle\|isBottle2\|getBottle2\|shouldRecommendDesktopForBottle2\|BOTTLE1_DESKTOP_ONLY_MESSAGE\|BOTTLE2_CLOUD"` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm run build 2>&1 | tail -5`
- **After every plan wave:** Run full suite (build + grep verification)
- **Before `/gsd-verify-work`:** Full suite must be green (no user-visible "Bottle" strings, build passes)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | BRAND-01 | — | N/A | grep | `grep -r "Bottle 1.0\|Bottle 2.0" frontend/src/features/upload/uploadConstants.js` must return 0 matches | ✅ | ⬜ pending |
| 38-01-02 | 01 | 1 | BRAND-01 | — | N/A | grep | `grep -r "Bottle 2.0" frontend/src/shared/lib/asrModels.js` must return 0 matches | ✅ | ⬜ pending |
| 38-01-03 | 01 | 1 | BRAND-01 | — | N/A | grep | `grep -rn "Bottle" frontend/src/features/upload/asrStrategy.js` must return 0 matches | ✅ | ⬜ pending |
| 38-01-04 | 01 | 1 | BRAND-01 | — | N/A | grep | `grep -n "Bottle" frontend/src/features/upload/CloudUploadPanel.tsx` must return 0 user-string matches | ✅ | ⬜ pending |
| 38-01-05 | 01 | 1 | BRAND-01 | — | N/A | grep | `grep -n "Bottle" frontend/src/features/upload/UploadPanel.jsx \| grep -v "//\|isBottle\|getBottle\|buildBottle\|shouldRecommend"` must return 0 matches | ✅ | ⬜ pending |
| 38-01-06 | 01 | 1 | BRAND-01 | — | N/A | grep | `grep -n "Bottle" frontend/src/features/admin-rates/AdminRatesTab.jsx` must return 0 matches | ✅ | ⬜ pending |
| 38-01-07 | 01 | 1 | BRAND-01 | — | N/A | grep | `grep -n "Bottle" frontend/src/features/admin-system/AdminSystemTab.jsx frontend/src/features/admin-workspaces/AdminMonitoringWorkspace.jsx` must return 0 matches | ✅ | ⬜ pending |
| 38-01-08 | 01 | 1 | BRAND-02 | — | N/A | file | `ls frontend/public/favicon.svg` must succeed | ❌ W0 | ⬜ pending |
| 38-01-09 | 01 | 1 | BRAND-02 | — | N/A | grep | `grep "og:title" frontend/index.html app/static/index.html` must match "Unlock" | ✅ | ⬜ pending |
| 38-01-10 | 01 | 1 | BRAND-01 | — | N/A | build | `cd frontend && npm run build` exits 0 (UnlockMark import resolves) | ✅ | ⬜ pending |
| 38-01-11 | 01 | 1 | BRAND-01 | — | N/A | grep | `grep "UnlockMark\|BottleMark" frontend/src/features/auth/shared/SharedAuthPanel.tsx` must contain "UnlockMark" and NOT "BottleMark" | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/public/favicon.svg` — new SVG favicon file (no existing favicon found)

*All other files already exist — only the favicon needs creation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser tab shows "Unlock — 解锁英语学习" | BRAND-01 | Requires browser | Open app in browser, verify tab title |
| Login page shows padlock icon (not bottle) | BRAND-01 | Requires visual | Open /login, verify icon shape |
| Favicon appears in browser tab | BRAND-02 | Requires browser | Check browser tab for padlock favicon |
| Admin billing sort: "Unlock 本地" before "Unlock 云端" | BRAND-01 | Requires admin UI | Open admin rates page, verify sort order |
| OG preview shows "Unlock" title | BRAND-02 | Requires social share preview | Check with opengraph.xyz or similar tool |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
