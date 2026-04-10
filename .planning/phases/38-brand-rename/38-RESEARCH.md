# Phase 38: Brand Rename — Research

## RESEARCH COMPLETE

**Phase:** 38 — Brand Rename
**Goal:** Users perceive the product as "Unlock" across every touchpoint — no "Bottle" references remain in user-visible surfaces.

---

## 1. Scope of "Bottle" References

### User-Visible References (MUST change)

| File | Line(s) | Current Text | Action |
|------|---------|--------------|--------|
| `frontend/index.html` | 6 | `<title>English ASR Uploader</title>` | → `<title>Unlock — 解锁英语学习</title>` + add favicon + OG meta |
| `frontend/index.admin.html` | 6 | `<title>English Admin</title>` | → `<title>Unlock Admin</title>` |
| `app/static/index.html` | 6 | `<title>English ASR Uploader</title>` | → sync with frontend/index.html |
| `frontend/src/features/upload/uploadConstants.js` | 11 | `BOTTLE1_DESKTOP_ONLY_MESSAGE = "Bottle 1.0 仅支持..."` | → `"Unlock 本地版仅支持在客户端使用..."` |
| `frontend/src/features/upload/uploadConstants.js` | 50, 60 | `title: "Bottle 1.0"` (×2) | → `title: "Unlock 本地"` |
| `frontend/src/features/upload/uploadConstants.js` | 69 | `title: "Bottle 2.0"` | → `title: "Unlock 云端"` |
| `frontend/src/features/upload/uploadConstants.js` | 37–38 | `BOTTLE2_CLOUD_DESKTOP_RECOMMEND_SIZE_BYTES`, `BOTTLE2_CLOUD_DESKTOP_RECOMMEND_DURATION_SECONDS` | Rename constants to `UNLOCK_CLOUD_DESKTOP_RECOMMEND_SIZE_BYTES` etc. (exported, may break callers) |
| `frontend/src/features/upload/asrStrategy.js` | 193–228 | `"Bottle 2.0 当前不可用..."` (×6 error messages) | → `"Unlock 云端当前不可用..."` |
| `frontend/src/features/upload/CloudUploadPanel.tsx` | 78 | `"请先登录后再使用 Bottle 2.0"` | → `"请先登录后再使用 Unlock 云端"` |
| `frontend/src/features/upload/CloudUploadPanel.tsx` | 136 | `<strong>Bottle 2.0 网页流程</strong>` | → `<strong>Unlock 云端流程</strong>` |
| `frontend/src/features/upload/components/DesktopGuidanceDialog.tsx` | 41 | `"Bottle 2.0 当前仍支持..."` | → `"Unlock 云端当前仍支持..."` |
| `frontend/src/features/upload/UploadPanel.jsx` | 269, 1491, 1495, 1505, 2278, 3752, 4649, 4670, 6004, 6157, 6183 | Various `"Bottle 1.0"` / `"Bottle 2.0"` UI strings | → `"Unlock 本地"` / `"Unlock 云端"` throughout |
| `frontend/src/shared/lib/asrModels.js` | 13, 22 | `display_name: "Bottle 2.0"`, `note: "Bottle 2.0 通过..."` | → `"Unlock 云端"`, `"Unlock 云端通过..."` |
| `frontend/src/features/admin-rates/AdminRatesTab.jsx` | 56–57 | `if (displayName === "Bottle 1.0")`, `"Bottle 2.0"` sort keys | → `"Unlock 本地"` / `"Unlock 云端"` |
| `frontend/src/features/admin-rates/AdminRatesTab.jsx` | 315 | CardDescription mentioning `Bottle 1.0 / Bottle 2.0` | → `Unlock ��地 / Unlock 云端` |
| `frontend/src/features/admin-system/AdminSystemTab.jsx` | 118 | `"加载 Bottle 运行就绪度"` | → `"加载 Unlock 运行就绪度"` |
| `frontend/src/features/admin-workspaces/AdminMonitoringWorkspace.jsx` | 17 | `"Bottle 运行状态"` | → `"Unlock 运行状态"` |
| `frontend/src/features/auth/shared/BottleMark.tsx` | whole file | Bottle-shape SVG icon | → Replace SVG shape with open padlock icon; rename component to `UnlockMark`; rename file |
| `frontend/src/features/auth/shared/SharedAuthPanel.tsx` | 3, 223 | `import { BottleMark }`, `<BottleMark .../>` | → `import { UnlockMark }`, `<UnlockMark .../>` |

### Internal-Only References (skip in this phase)

These names are NOT shown to users — skip renaming to minimize churn:
- `buildBottleLessonFilename`, `buildBottleLessonPayload`, `__bottleExportPayload` (export helper functions in lessonListHelpers.js)
- `isBottle2CloudFlow`, `getBottle2CloudStageDisplayItems`, `getBottle2CloudProgressHeadline`, `shouldRecommendDesktopForBottle2Cloud` (local state/view model names)
- `BOTTLE2_CLOUD_DESKTOP_RECOMMEND_SIZE_BYTES` / `BOTTLE2_CLOUD_DESKTOP_RECOMMEND_DURATION_SECONDS` — exported constants, skip renaming (would cascade to many call sites for zero visual gain)
- `buildBottle2CloudStageItem` (internal helper in uploadTaskViewModel.js)
- Code comments describing the Bottle 2.0 flow in CloudUploadPanel.tsx
- `BOTTLE1_DESKTOP_ONLY_MESSAGE` constant name (rename the value but keep the constant name to avoid cascading import changes)

---

## 2. Logo / Icon Replacement Strategy

**Current:** `BottleMark.tsx` renders a bottle-shaped SVG (64×64 viewBox, teal/cyan gradient background)

**Decision:** Replace bottle silhouette with open padlock SVG. Keep:
- Same 64×64 viewBox
- Same teal/cyan gradient background (`#0F766E → #0EA5A4 → #67E8F9`)
- Same size/className/title props interface

**Rename:** `BottleMark.tsx` → `UnlockMark.tsx`, export `UnlockMark` instead of `BottleMark`.

**Import update:** `SharedAuthPanel.tsx` imports from `"./BottleMark"` → update to `"./UnlockMark"`.

---

## 3. Page Title and Metadata

**`frontend/index.html`** needs:
```html
<title>Unlock — 解锁英语学习</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta property="og:title" content="Unlock — 解锁英语学习" />
<meta property="og:description" content="将任意英语材料转化为个性化学习包" />
<meta property="og:type" content="website" />
```

**Favicon strategy:** Create `/frontend/public/favicon.svg` — a 32×32 SVG with the open padlock icon on a teal background (mirrors UnlockMark).

**`frontend/index.admin.html`:** Update title only — `<title>Unlock Admin</title>`.

**`app/static/index.html`:** This is the production-served copy. Must sync changes from `frontend/index.html`. The Web Delivery Contract requires that `app/static` be updated when web-facing HTML changes.

---

## 4. Admin String Mapping

| Current | Replacement |
|---------|-------------|
| `"Bottle 1.0"` (display_name sort key) | `"Unlock 本地"` |
| `"Bottle 2.0"` (display_name sort key) | `"Unlock 云端"` |
| `"Bottle 1.0 / Bottle 2.0"` in CardDescription | `"Unlock 本地 / Unlock 云端"` |
| `"加载 Bottle 运行就绪度"` | `"加载 Unlock 运行就绪度"` |
| `"Bottle 运行状态"` | `"Unlock 运行状态"` |

**Critical dependency:** `billingDisplayRank()` in `AdminRatesTab.jsx` compares `displayName` against `"Bottle 1.0"` / `"Bottle 2.0"` to sort admin billing models. After this phase renames the display strings in `asrModels.js` and the DB-backed model names, the sort function must also be updated to use `"Unlock 本地"` / `"Unlock 云端"` — otherwise admin billing list loses its sort order.

---

## 5. Dependency Graph

```
asrModels.js (display_name) ─┐
uploadConstants.js (titles)  ├─► UploadPanel.jsx (renders model cards)
                              └─► AdminRatesTab.jsx (billingDisplayRank sort)

CloudUploadPanel.tsx ── independent string changes
asrStrategy.js ── independent error message changes
DesktopGuidanceDialog.tsx ── independent string change
AdminSystemTab.jsx ── independent string change
AdminMonitoringWorkspace.jsx ── independent string change

BottleMark.tsx ─► UnlockMark.tsx (rename + SVG swap)
  └─► SharedAuthPanel.tsx (update import)

favicon.svg (new file in public/)
index.html (title + meta tags + favicon link)
index.admin.html (title only)
app/static/index.html (sync with index.html)
```

**Plan split recommendation:** All changes are low-risk text substitutions and one SVG component replacement. A single plan handles all surfaces cleanly.

---

## 6. Risks and Constraints

1. **Admin display_name sort:** `billingDisplayRank()` is keyed on exact display string — must update sort keys in same PR as `asrModels.js` rename, or admin billing list loses sorting. These two files must change in the same plan/task.

2. **Web Delivery Contract:** `app/static/index.html` must be updated in the same plan as `frontend/index.html` — no frontend-only change counts as done without syncing static.

3. **Vite build:** After file rename (`BottleMark.tsx → UnlockMark.tsx`), `SharedAuthPanel.tsx` import path must be updated before build — otherwise the app won't compile.

4. **No backend changes needed:** All "Bottle" references are purely frontend strings. Backend API routes, DB fields, and Python code do not surface "Bottle" to users.

5. **admin/dist rebuild:** `frontend/dist-admin/` is built output — it regenerates on next build. No need to manually patch built files.

---

## 7. Validation Architecture

### Test Strategy
- **Grep verification:** After changes, `grep -r "Bottle" frontend/src --include="*.tsx" --include="*.jsx" --include="*.ts" --include="*.js" | grep -v "lessonListHelpers\|uploadTaskViewModel\|uploadHelpers\|uploadRuntime\|BottleMark\|CloudUploadPanel.*Bottle server"` should return zero user-visible string matches.
- **Build verification:** `npm run build` (or `vite build`) must pass without TypeScript errors after the BottleMark→UnlockMark rename and import update.
- **Admin sort test:** Admin billing page should render with "Unlock 本地" first, "Unlock 云端" second.
- **Auth page visual:** Login/register page should display the new padlock icon instead of the bottle icon.
- **Tab title:** Browser tab should show "Unlock — 解锁英语学习".

### BRAND-01 Verification
- Browser tab: "Unlock" (not "English ASR Uploader", not "Bottle")
- Nav bar / headers: no "Bottle" visible
- Upload panel model cards: "Unlock 本地" and "Unlock 云端"
- Error messages: "Unlock 云端" not "Bottle 2.0"

### BRAND-02 Verification
- Favicon visible in browser tab (padlock SVG)
- `<meta property="og:title">` present in page source
- Share preview shows "Unlock" branding (can verify via meta tag presence)
