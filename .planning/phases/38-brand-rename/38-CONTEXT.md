# Phase 38: Brand Rename - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace all user-visible "Bottle" references with "Unlock" branding across the entire frontend. No "Bottle" should remain in any surface a user (or admin operator) can see. Internal code identifiers (variable names, function names, file names) that don't surface to users are lower priority and can be renamed opportunistically.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User delegated all decisions to Claude with "你看着弄吧". The following are Claude's recommended defaults:

### Logo / Icon Replacement
- **D-01:** Replace the bottle-shaped SVG in `BottleMark.tsx` with an unlock-themed icon (lock being opened / key). Keep the same teal/cyan gradient background, swap the bottle silhouette for an open padlock or key silhouette. Component should be renamed from `BottleMark` to `UnlockMark`.
- **D-02:** Generate a simple SVG inline (no external asset dependency). The icon should feel modern and clean — open padlock with rounded corners, fitting the existing 64×64 viewBox and gradient style.

### "Bottle 1.0 / 2.0" Terminology
- **D-03:** Rename user-visible ASR mode labels: "Bottle 1.0" → "Unlock 本地" (desktop local), "Bottle 2.0" → "Unlock 云端" (cloud). Drop version numbers — they confuse learners. Internal function names like `buildBottle2CloudStageItem` can keep their names (not user-visible).
- **D-04:** Error messages referencing "Bottle 1.0" / "Bottle 2.0" should use "Unlock 本地" / "Unlock 云端" consistently.

### Page Titles and Metadata
- **D-05:** `index.html` title: "Unlock — 解锁英语学习" (concise, bilingual).
- **D-06:** `index.admin.html` title: "Unlock Admin".
- **D-07:** Favicon: Generate a simple 32×32 / 16×16 SVG favicon matching the new UnlockMark icon (open padlock on teal background). Use inline SVG favicon in HTML `<link>` tag for simplicity.
- **D-08:** Open Graph metadata: Add `og:title`, `og:description`, `og:image` tags to `index.html`. Title: "Unlock — 解锁英语学习", Description: "将任意英语材料转化为个性化学习包". Image: a static OG image placeholder (can be replaced with a designed asset later).

### Admin Panel
- **D-09:** Replace all user-visible "Bottle" text in admin panels with "Unlock" equivalents. "Bottle 运行就绪度" → "Unlock 运行就绪度", "Bottle 1.0 / Bottle 2.0" in admin rates → "Unlock 本地 / Unlock 云端".
- **D-10:** Admin descriptions referencing "Bottle" concept (e.g., CardDescription in AdminRatesTab) should use "Unlock 本地 / Unlock 云端" naming.

### Scope Clarification
- **D-11:** `GettingStartedHelpPage.jsx` already uses "Unlock Anything" in document.title — no change needed there.
- **D-12:** Auth panels already pass `appName="Unlock Anything"` — no change needed for auth surfaces.
- **D-13:** Internal code identifiers (function names like `buildBottleLessonFilename`, `shouldRecommendDesktopForBottle2Cloud`, `getBottle2CloudStageDisplayItems`) are NOT user-visible and do NOT need renaming in this phase. Renaming them would create unnecessary churn with no user impact.
- **D-14:** Code comments referencing "Bottle" in technical context (e.g., `CloudUploadPanel.tsx` JSDoc) are developer-facing, not user-facing — skip in this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Brand Upgrade — BRAND-01 and BRAND-02 define acceptance criteria

### Existing Brand Components
- `frontend/src/features/auth/shared/BottleMark.tsx` — Current logo SVG component (to be replaced)
- `frontend/src/features/auth/shared/SharedAuthPanel.tsx` — Auth panel using BottleMark
- `frontend/src/features/auth/components/AuthPanel.jsx` — Already uses appName="Unlock Anything"

### Upload / ASR Surfaces (heaviest "Bottle" concentration)
- `frontend/src/features/upload/uploadConstants.js` — "Bottle 1.0" / "Bottle 2.0" title strings
- `frontend/src/features/upload/asrStrategy.js` — Error messages with "Bottle 2.0"
- `frontend/src/features/upload/CloudUploadPanel.tsx` — "Bottle 2.0 网页流程" label
- `frontend/src/features/upload/uploadRuntime.js` — "Bottle 1.0" status messages
- `frontend/src/features/upload/UploadPanel.jsx` — Main upload UI

### Admin Surfaces
- `frontend/src/features/admin-system/AdminSystemTab.jsx` — "Bottle 运行就绪度"
- `frontend/src/features/admin-workspaces/AdminMonitoringWorkspace.jsx` — "Bottle 运行状态"
- `frontend/src/features/admin-rates/AdminRatesTab.jsx` — "Bottle 1.0 / Bottle 2.0" sort logic and description

### HTML Entry Points
- `frontend/index.html` — Main app entry (title: "English ASR Uploader")
- `frontend/index.admin.html` — Admin entry (title: "English Admin")
- `app/static/index.html` — Production-served copy of main app HTML

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BottleMark.tsx`: Self-contained SVG component with props for size/className/title — same pattern works for new UnlockMark
- teal/cyan gradient already established as brand color palette (`#0F766E` → `#0EA5A4` → `#67E8F9`)
- Auth panel already has `appName` prop pattern — brand name is parameterized

### Established Patterns
- Brand assets are inline SVG (no external image files for logo)
- User-visible strings are hardcoded in component files and constants (no i18n layer)
- `app/static/` is a production copy of `frontend/` build output — must be synced

### Integration Points
- `app/static/index.html` must be updated to match `frontend/index.html` changes (Web Delivery Contract)
- `frontend/dist-admin/` contains built admin assets — may need rebuild after changes
- `BottleMark` is imported in `SharedAuthPanel.tsx` — import path changes when renamed

</code_context>

<specifics>
## Specific Ideas

No specific requirements — user delegated all decisions to Claude ("你看着弄吧"). All decisions above are Claude's recommended defaults based on codebase analysis and brand direction.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 38-brand-rename*
*Context gathered: 2026-04-10*
