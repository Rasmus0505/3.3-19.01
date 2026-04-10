---
phase: 38
slug: brand-rename
status: approved
shadcn_initialized: false
preset: none
created: 2026-04-10
---

# Phase 38 — UI Design Contract

> Visual and interaction contract for Phase 38: Brand Rename.
> This phase has NO new interactive surfaces — it is a string replacement and icon swap phase.
> The design contract is limited to the new logo icon shape, favicon SVG, and metadata copy.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (Radix UI primitives used directly) |
| Preset | not applicable |
| Component library | Radix UI |
| Icon library | lucide-react |
| Font | Geist Variable |

---

## Spacing Scale

No new spacing introduced in this phase — existing components are unchanged.
All spacing follows existing 4px multiples in Tailwind CSS v4.

---

## Typography

No new typography introduced. Existing body/label/heading scales apply.

Page title in `<title>` tag: `"Unlock — 解锁英语学习"` (plain text, no styling)
OG description: `"将任意英语材料转化为个性化学习包"` (plain text)

---

## Color

### Brand Gradient (preserved from existing BottleMark)

| Role | Value | Usage |
|------|-------|-------|
| Gradient start | `#0F766E` | Logo background top-left |
| Gradient mid | `#0EA5A4` | Logo background center |
| Gradient end | `#67E8F9` | Logo background bottom-right |
| Icon fill | `#ECFEFF` / `#0F172A` | Padlock body / shackle |

These are preserved from the existing BottleMark gradient — brand continuity is maintained.

---

## UnlockMark Icon — Design Contract

**File:** `frontend/src/features/auth/shared/UnlockMark.tsx` (renamed from BottleMark.tsx)

### ViewBox and Size
- viewBox: `0 0 64 64` (unchanged)
- Default size: `44` (unchanged)
- Props interface: `{ size?, className?, title? }` (unchanged)

### Background
- Rounded rectangle: `x="2" y="2" width="60" height="60" rx="20"` filled with gradient
- Gradient: same `#0F766E → #0EA5A4 → #67E8F9` (id changes from `bottle-bg` to `unlock-bg`)

### Padlock Shape Contract

Open padlock icon (shackle on right side, open = unlocked):

```
Shackle (arc):
  - Shackle body: center ~(32, 24), outer radius ~14, inner radius ~9
  - Arc spans ~200° (open on upper-right side — indicates unlocked state)
  - Stroke: #0F172A, strokeWidth: 4, strokeLinecap: round
  - Fill: none

Lock body:
  - Rounded rectangle: x="18" y="30" width="28" height="22" rx="5"
  - Fill: #ECFEFF (light cyan, same as bottle body was)
  - Stroke: #155E75, strokeWidth: 2.4

Keyhole:
  - Circle: cx="32" cy="39" r="4", fill="#0EA5A4"
  - Rectangle below circle: x="30" y="42" width="4" height="5" rx="1", fill="#0EA5A4"
```

### Contrast
- Icon on gradient background: white/light fills on dark teal = sufficient contrast

---

## Favicon — Design Contract

**File:** `frontend/public/favicon.svg`

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="url(#fbg)"/>
  <!-- simplified padlock for small size -->
  <rect x="9" y="15" width="14" height="12" rx="3" fill="#ECFEFF" stroke="#155E75" stroke-width="1.2"/>
  <path d="M12 15 Q12 8 20 8 Q28 8 28 15" fill="none" stroke="#0F172A" stroke-width="3" stroke-linecap="round"/>
  <circle cx="16" cy="20" r="2" fill="#0EA5A4"/>
  <defs>
    <linearGradient id="fbg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0F766E"/>
      <stop offset="0.52" stop-color="#0EA5A4"/>
      <stop offset="1" stop-color="#67E8F9"/>
    </linearGradient>
  </defs>
</svg>
```

Note: The shackle arc at favicon size (32px) must remain legible. Use simplified open arc path.

---

## Open Graph Metadata Copy

| Tag | Value |
|-----|-------|
| `og:title` | `Unlock — 解锁英语学习` |
| `og:description` | `将任意英语材料转化为个性化学习包` |
| `og:type` | `website` |
| `og:image` | (omit or leave as placeholder — no OG image asset in scope) |

---

## String Rename Map

| Surface | Old String | New String |
|---------|-----------|-----------|
| Page title | `English ASR Uploader` | `Unlock — 解锁英语学习` |
| Admin title | `English Admin` | `Unlock Admin` |
| ASR mode card (local) | `Bottle 1.0` | `Unlock 本地` |
| ASR mode card (cloud) | `Bottle 2.0` | `Unlock 云端` |
| Error messages | `Bottle 2.0 当前不可用...` | `Unlock 云端当前不可用...` |
| Desktop-only message | `Bottle 1.0 仅支持在客户端使用...` | `Unlock 本地版仅支持在客户端使用...` |
| Admin system | `Bottle 运行就绪度` | `Unlock 运行就绪度` |
| Admin monitoring | `Bottle 运行状态` | `Unlock 运行状态` |
| Admin billing description | `Bottle 1.0 / Bottle 2.0` | `Unlock 本地 / Unlock 云端` |

---

## Copywriting Tone

- **短、直接**: "Unlock 云端" not "Unlock 2.0 云端识别引擎"
- **无版本号**: Drop "1.0" / "2.0" suffixes — they confuse learners
- **本地/云端 binary**: The only distinction learners need is where processing happens

---

## Interaction Changes

**None.** This phase touches no interactive components, no new states, no new animations, no new flows. All changes are:
1. Text string substitutions
2. SVG component swap (same interface, different shape)
3. HTML metadata additions (non-interactive)

---

## Hover / Focus / Active States

No changes — existing component states are preserved.

---

## Responsive Behavior

No changes — existing responsive layouts are preserved.

---

## Accessibility

- `UnlockMark` retains `role="img"` and `aria-label={title}` from the existing BottleMark
- New padlock SVG must have descriptive title: `"Unlock 品牌图标"`
- Favicon does not require ARIA (browser chrome, not page content)

---

## Anti-Patterns to Avoid

- Do NOT add animation or hover effects to the new logo (not in scope)
- Do NOT change layout, spacing, or component structure (not in scope)
- Do NOT replace the gradient background with a different palette
- Do NOT introduce a wordmark or text alongside the icon (not in scope)

---

## Checker Dimensions

| Dimension | Status | Notes |
|-----------|--------|-------|
| 1. Design system alignment | PASS | Uses existing Tailwind/Radix stack, no new deps |
| 2. Spacing consistency | PASS | No new spacing introduced |
| 3. Typography | PASS | No new typography, copy strings specified |
| 4. Color | PASS | Brand gradient preserved, icon fills documented |
| 5. Interaction states | PASS | No new interactions |
| 6. Accessibility | PASS | aria-label preserved, role="img" maintained |

## UI-SPEC VERIFIED

All 6 dimensions passed for Phase 38. No blocking issues.
