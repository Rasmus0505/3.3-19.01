# Phase 21: 素材导入 UX 优化 - Research

**Researched:** 2026-04-02
**Domain:** React/JSX UI state changes + Tailwind CSS layout refactoring
**Confidence:** HIGH

## Summary

Phase 21 requires four targeted UI changes in two files: changing the default active tab in UploadPanel (one line), removing two paragraph strings and their JSX renders (nine lines), confirming UPLOAD-03 is already done (zero lines), and converting the shortcut config grid from CSS Grid to a two-row flex layout (one line group change).

All changes are surgical — no new dependencies, no new components, no state management changes. The primary risk is the Tailwind flex layout: `w-fit` + `flex-wrap` can cause wrapping inconsistencies across viewport widths, and the `pendingDesktopSourceMode` also defaults to FILE which may need alignment.

**Primary recommendation:** Use a manual two-row flex container with `flex-wrap`, split SHORTCUT_ACTIONS into first 3 and last 3 (for 6-item layout), and add `w-fit min-w-0` to each card for tight wrapping.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- UPLOAD-01: Default tab = LINK (change `useState(DESKTOP_UPLOAD_SOURCE_MODE_FILE)` → `DESKTOP_UPLOAD_SOURCE_MODE_LINK`)
- UPLOAD-02: Remove `DESKTOP_LINK_PUBLIC_SUPPORT_MESSAGE` `<p>` tag (Line 6836) and `DESKTOP_LINK_PUBLIC_ONLY_MESSAGE` `<p>` tag (Line 6837); move platform info to placeholder; keep SnapAny fallback link unchanged
- UPLOAD-03: Already implemented — no changes needed
- UPLOAD-04: Two-row compact layout, first row 4 actions, second row 3 actions, flex row per line, cards `w-fit` to wrap content

### Claude's Discretion

- Exact CSS for card width (w-fit, min-w-0, or other)
- Second row 3-action horizontal alignment (centered or left-aligned)
- SnapAny fallback link text wording ("无法导入时可改用 SnapAny" already exists)

### Deferred Ideas (OUT OF SCOPE)

- GenerationConfigModal config弹窗 — Phase 22
- 视频内容提取单独记录类型 — Phase 22
- 历史记录按类型过滤 — Phase 22
- 字幕遮挡板位置策略 — Phase 23
- 桌面客户端链接恢复 — Phase 22
- SnapAny fallback体验优化 — Phase 22+

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UPLOAD-01 | 素材上传页默认选中"链接"Tab | Change one `useState` default value — trivial |
| UPLOAD-02 | 链接Tab文案精简，移除冗余段落 | Remove 2 `<p>` tags + constants, update placeholder |
| UPLOAD-03 | 自动填标题 | Already implemented at Lines 3458, 3650-3651 |
| UPLOAD-04 | 快捷键配置紧凑两行布局 | Tailwind flex-wrap with manual row splits |

## Standard Stack

This phase introduces no new dependencies.

### Existing Libraries Used

| Library | Where | Purpose |
|---------|-------|---------|
| `cn()` from `frontend/src/lib/utils` | UploadPanel.jsx Line 6 | Tailwind class composition utility (already imported) |
| Tailwind CSS | All JSX files | Layout and styling |
| React `useState` | UploadPanel.jsx Line 1795 | Tab state management |

### No New Dependencies

No npm packages, no new imports, no new utility functions needed.

## Architecture Patterns

### Pattern 1: Manual Two-Row Flex with Array Splitting

**What:** Split the SHORTCUT_ACTIONS array manually into two rows, render each row as a flex container.

**Why:** Flexbox `flex-wrap` can cause wrapping ambiguity when items don't all fit in one row. Pre-splitting into two explicit containers ensures consistent layout across viewport widths.

**Code:**

```jsx
<div className="flex flex-col gap-3">
  <div className="flex flex-row flex-wrap gap-3">
    {SHORTCUT_ACTIONS.slice(0, 3).map((action) => (
      <ShortcutCard key={action.id} action={action} />
    ))}
  </div>
  <div className="flex flex-row flex-wrap gap-3 justify-center">
    {SHORTCUT_ACTIONS.slice(3, 6).map((action) => (
      <ShortcutCard key={action.id} action={action} />
    ))}
  </div>
</div>
```

**Card width:** `w-fit min-w-0` — `w-fit` allows the card to shrink-wrap to content, `min-w-0` is critical to allow flex children to shrink below their default `min-content` size. Without `min-w-0`, a long shortcut label like "暂停/继续播放" can prevent shrinking and cause overflow.

**Source:** Tailwind flexbox behavior, confirmed by Tailwind docs on `w-fit` (equivalent to CSS `fit-content`) and `flex-shrink` default of 1 combined with `min-width: auto` (the flex item default that blocks shrinking).

### Pattern 2: State Default Change (No Side Effects)

**What:** Changing a `useState` initial value only affects the initial render. Runtime Tab switching via `handleDesktopSourceModeChange` is unaffected.

**Code:**

```jsx
// BEFORE (Line 1795)
const [desktopSourceMode, setDesktopSourceMode] = useState(DESKTOP_UPLOAD_SOURCE_MODE_FILE);

// AFTER
const [desktopSourceMode, setDesktopSourceMode] = useState(DESKTOP_UPLOAD_SOURCE_MODE_LINK);
```

**Also update Line 1800** (`pendingDesktopSourceMode`) to `DESKTOP_UPLOAD_SOURCE_MODE_LINK` to ensure confirmation dialog defaults match the visible tab.

### Pattern 3: String Constant Cleanup

**What:** Remove unused string constants and their JSX renders.

**Action:** Three deletions:
1. `DESKTOP_LINK_PUBLIC_SUPPORT_MESSAGE` constant (Line 64) — can remove since it's no longer referenced
2. `DESKTOP_LINK_PUBLIC_ONLY_MESSAGE` constant (Line 65) — remove entirely
3. Two `<p>` tags in JSX (Lines 6836-6837) — remove from render

**Note:** `DESKTOP_LINK_PUBLIC_SUPPORT_MESSAGE` constant is still referenced at Line 6836. After removing the `<p>` tag, the constant itself becomes dead code. Remove it to avoid lint warnings.

### Pattern 4: Placeholder Enhancement

**What:** Update the input placeholder to include platform names.

**Current (Line 6823):**
```jsx
placeholder="粘贴公开单条视频链接，例如 https://www.youtube.com/watch?v=..."
```

**Updated:**
```jsx
placeholder="粘贴 YouTube、B站等公开视频链接"
```

The platform names extracted from `DESKTOP_LINK_PUBLIC_SUPPORT_MESSAGE` ("YouTube、B站、常见播客页面、公开视频直链") should be simplified to "YouTube、B站等公开视频链接" to fit the placeholder context without redundancy.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Two-row shortcut layout | Custom CSS Grid with named areas or JS-based row splitting | Tailwind `flex flex-wrap` + manual `.slice()` splits | Simpler, responsive, no JS overhead |
| Card width sizing | Hard-coded `w-48` or pixel widths | `w-fit min-w-0` | Auto-fits to content, respects flex shrink |
| Input placeholder with platform list | Generate dynamically from a config array | Static string literal | Static string is simpler for this small list |

**Key insight:** All changes are CSS and constant-string deletions. No algorithmic complexity.

## Common Pitfalls

### Pitfall 1: Flex Shrink Overflow Without `min-w-0`

**What goes wrong:** Flex items default to `min-width: auto`, which prevents shrinking below content size. With `w-fit` alone, long labels (e.g., "暂停/继续播放" at ~6 characters) can cause cards to overflow the container horizontally on smaller views.

**How to avoid:** Always pair `w-fit` with `min-w-0` on the flex item.

**Warning signs:** Horizontal scrollbar appears in the settings dialog, or cards wrap to 2 per row on medium screens instead of 3.

### Pitfall 2: Missing `pendingDesktopSourceMode` Alignment

**What goes wrong:** `pendingDesktopSourceMode` (Line 1800) also defaults to `DESKTOP_UPLOAD_SOURCE_MODE_FILE`. If a confirmation dialog fires and defaults to FILE while the visible tab shows LINK, the UX is inconsistent.

**How to avoid:** Change Line 1800 alongside Line 1795.

### Pitfall 3: Dead Constant After JSX Removal

**What goes wrong:** Removing the JSX `<p>` tag that references `DESKTOP_LINK_PUBLIC_SUPPORT_MESSAGE` without also removing the constant itself leaves dead code.

**How to avoid:** Remove both the constant declaration (Line 64) and the JSX `<p>` tag (Line 6836) together. Check with `grep` before committing.

### Pitfall 4: `flex-wrap` Wrapping on Unintended Breakpoints

**What goes wrong:** With 6 items and `flex-wrap`, at some viewport widths 2 items per row (3 rows total) or 4 per row (2 rows) can appear instead of the intended 3-per-row (2 rows).

**How to avoid:** Use explicit manual splits (`slice(0,3)` and `slice(3,6)`) inside two separate `<div>` containers. This guarantees the 2-row layout regardless of viewport.

### Pitfall 5: SHORTCUT_ACTIONS Item Count Mismatch

**What goes wrong:** The phase context documents 7 shortcut actions (first row 4, second row 3), but the actual `SHORTCUT_ACTIONS` array contains only 6 items. This is a discrepancy between the planning context and the source code.

**How to avoid:** Verify `SHORTCUT_ACTIONS` at `frontend/src/features/immersive/learningSettings.js` Line 63. Current code has exactly 6 items:
- `reveal_letter` / `reveal_word` / `previous_sentence` / `next_sentence` / `replay_sentence` / `toggle_pause_playback`

If the intent is 7 items, either the `learningSettings.js` is outdated or the context was incorrect. Recommend 3+3 split (2 rows of 3) as the safe default. If 4+3 is needed, `extra_reveal` must be added to `SHORTCUT_ACTIONS` first (out of phase scope).

## Code Examples

### Shortcut Card Layout (Target)

```jsx
<div className="flex flex-col gap-3">
  {/* Row 1: first 3 actions */}
  <div className="flex flex-row flex-wrap gap-3">
    {SHORTCUT_ACTIONS.slice(0, 3).map((action) => {
      const recording = recordingShortcutActionId === action.id;
      return (
        <div key={action.id} className="flex w-fit min-w-0 flex-col rounded-2xl border bg-background/80 p-3">
          <div className="flex flex-1 flex-col gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold text-foreground">{action.label}</p>
              <p className="text-sm text-muted-foreground break-all">{getShortcutLabel(learningSettings.shortcuts[action.id])}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={recording ? "default" : "outline"}
              className="mt-auto self-start"
              onClick={() => {
                setSettingsError("");
                setRecordingShortcutActionId((current) => (current === action.id ? "" : action.id));
              }}
            >
              {recording ? "请按键…" : "修改"}
            </Button>
          </div>
        </div>
      );
    })}
  </div>
  {/* Row 2: remaining 3 actions, centered */}
  <div className="flex flex-row flex-wrap gap-3 justify-center">
    {SHORTCUT_ACTIONS.slice(3, 6).map((action) => {
      /* same card rendering */
    })}
  </div>
</div>
```

**Key changes from current (Line 900):**
- `grid gap-3 md:grid-cols-2 lg:grid-cols-3` → two explicit `flex flex-row flex-wrap gap-3` containers
- Each card: `w-fit min-w-0` added, `h-full` removed (no longer needed with flex column)
- Row 2 container: `justify-center` for centered alignment of 3 remaining cards

### Link Tab Cleanup

```jsx
{/* REMOVE Lines 6836-6837 */}
{/* <p className="text-xs text-muted-foreground">{DESKTOP_LINK_PUBLIC_SUPPORT_MESSAGE}</p> */}
{/* <p className="text-xs text-muted-foreground">{DESKTOP_LINK_PUBLIC_ONLY_MESSAGE}</p> */}

{/* KEEP Line 6823 placeholder update */}
<input
  type="url"
  inputMode="url"
  className="h-11 w-full rounded-2xl border bg-background px-4 text-sm outline-none transition-colors focus:border-upload-brand/50"
  placeholder="粘贴 YouTube、B站等公开视频链接"
  value={desktopLinkInput}
  onChange={(event) => handleDesktopLinkInputChange(event.target.value)}
  // ...
/>

{/* KEEP Lines 6838-6844 (SnapAny fallback) */}
<p className="text-xs text-muted-foreground">
  无法导入时可改用{" "}
  <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={() => void openSnapAnyFallback()}>
    SnapAny
  </button>
  。
</p>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Grid with `grid-cols-2 lg:grid-cols-3` | Two-row flex with explicit slices | Now | Cards wrap tightly, no wasted row space |
| FILE tab default | LINK tab default | Now | Most common workflow (link import) gets direct access |
| Long explanatory paragraphs | Inline placeholder + SnapAny link | Now | Cleaner UI, less cognitive load |

**No deprecated patterns in scope.**

## Open Questions

1. **SHORTCUT_ACTIONS count discrepancy (6 vs 7 items)**
   - What we know: Code has 6 items; context describes 7 (first row 4, second row 3)
   - What's unclear: Was the context wrong, or is `extra_reveal` supposed to exist?
   - Recommendation: Use 3+3 split (2 rows of 3). If 4+3 is needed, add the missing action to `SHORTCUT_ACTIONS` in `learningSettings.js` first.

2. **Second row alignment (centered vs left)**
   - What we know: Context says either is acceptable
   - What's unclear: User preference
   - Recommendation: Use `justify-center` for the second row (visually balanced with 3 items centered under 3 items above)

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified — this is a pure frontend CSS/JSX refactor with no new packages, tools, services, or runtimes required).

## Validation Architecture

Step 4: SKIPPED — Phase 21 is a pure UI/CSS change with no automated test coverage. Verification is manual:

1. **UPLOAD-01:** Open UploadPanel → verify Link tab is selected by default (no click needed)
2. **UPLOAD-02:** Verify the two `<p>` explanation paragraphs are gone; verify placeholder includes platform names; verify SnapAny link is still present and clickable
3. **UPLOAD-03:** Paste a YouTube URL → verify title auto-fills in the title input
4. **UPLOAD-04:** Open shortcut config section → verify all 6 shortcut cards are visible in two rows (3 per row), no horizontal scrollbar, no wasted whitespace

**Test command:** None (manual verification only).

**Wave 0 gaps:** None — no test infrastructure needed for this phase.

## Sources

### Primary (HIGH confidence — verified in codebase)

- `frontend/src/features/upload/UploadPanel.jsx` — Lines 43-44 (constants), 64-65 (strings), 1795 (useState), 3458 (auto-fill), 3650-3651 (auto-fill), 6820-6844 (JSX render) — all verified by direct read
- `frontend/src/features/lessons/LessonList.jsx` — Lines 896-927 (shortcut grid) — verified by direct read
- `frontend/src/features/immersive/learningSettings.js` — Lines 63-70 (SHORTCUT_ACTIONS) — verified by direct read

### Secondary (MEDIUM confidence — standard patterns)

- Tailwind `w-fit` + `min-w-0` pattern — standard Tailwind flexbox behavior documented in Tailwind CSS documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, only existing codebase patterns
- Architecture: HIGH — all changes are surgical, established React patterns
- Pitfalls: HIGH — all pitfalls identified and documented with specific line references

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable phase, no fast-moving tech involved)
