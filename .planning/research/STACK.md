# Stack Research

**Domain:** English Learning App — CEFR Vocabulary Level Feature
**Researched:** 2026-04-03
**Confidence:** HIGH

## Executive Summary

The existing frontend stack (React 18.3.1 + Vite 7.3.1 + Zustand 5 + Tailwind CSS 4) is **fully capable** of implementing all CEFR vocabulary features. No new runtime dependencies are required. The work is primarily:

1. **CSS extensions** — CEFR color tokens (green/yellow/warning palette)
2. **Zustand persistence layer** — user i-level setting via `persist` middleware
3. **localStorage caching strategy** — batch analysis results keyed by lesson ID
4. **Animation refinements** — CSS `transform: scale()` transitions for wordbook feedback

## Recommended Stack Additions

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| *(none required)* | — | — | Existing React/Zustand/Tailwind handles all requirements |

The existing stack already contains:
- **React 18.3.1** — sufficient for component-based word rendering
- **Zustand 5.0.11** — `persist` middleware provides localStorage-backed state for user i-level
- **Tailwind CSS 4.2.1** — utility classes for color, spacing, animations
- **Radix UI** — accessible component primitives if Select/Dialog needed for i-level picker
- **cefr_vocab.json** (50K words) — already embedded via `vocabAnalyzer.js`

### Supporting Libraries

| Library | Already Present | Purpose | Implementation Note |
|---------|-----------------|---------|---------------------|
| `zustand/middleware` | ✅ Yes | Persist user i-level to localStorage | Use `persist` with `partialize` to store only `userILevel` |
| `@radix-ui/react-select` | ✅ Yes | i-level picker in personal center | Use existing Radix Select for accessible dropdown |
| `@radix-ui/react-progress` | ✅ Yes | Lesson CEFR distribution bars in history | Existing component, reuse in new history view |
| CSS custom properties | Built-in | CEFR color tokens (green/yellow/...) | Extend `tailwind.config` with CEFR palette |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Browser DevTools | Verify localStorage cache writes | Check `localStorage` keys: `cefr-analysis:{lessonId}` |
| React DevTools | Debug Zustand state during i-level changes | Inspect `userILevel` store slice |

## Implementation Architecture

### CEFR Color System (CSS Extension)

Extend existing CSS with CEFR-level semantic colors:

```css
/* In tailwind config or CSS variables */
--cefr-a1: #86efac;      /* green — most common */
--cefr-a2: #4ade80;      /* green variant */
--cefr-b1: #22c55e;      /* green — user's i-level target */
--cefr-b2: #eab308;      /* yellow — above i+1 */
--cefr-c1: #f97316;      /* orange — well above */
--cefr-c2: #ef4444;      /* red — far above */
--cefr-super: #dc2626;   /* red variant — rarest words */

--cefr-i1-color: #22c55e;   /* green — i+1 (one level above user's level) */
--cefr-i2-color: #eab308;   /* yellow — above i+1 */
```

**Rationale:** Tailwind 4 supports CSS-first configuration. Define these as CSS custom properties under `:root` or extend the theme object. This keeps CEFR colors consistent with existing `.immersive-letter-cell--correct` (green) and `.immersive-letter-cell--revealed` (yellow) patterns already in `immersive.css`.

### Zustand Store Extension

```typescript
// stores/userStore.ts — extend existing user store
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  userILevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  setUserILevel: (level: UserState['userILevel']) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userILevel: 'B1', // default per PROJECT.md
      setUserILevel: (level) => set({ userILevel: level }),
    }),
    {
      name: 'bottle-user-prefs', // localStorage key
      partialize: (state) => ({ userILevel: state.userILevel }), // persist only i-level
    }
  )
);
```

**Rationale:** Zustand's `persist` middleware handles serialization, hydration timing, and SSR safety automatically. Using `partialize` prevents bloating localStorage with entire user session.

### localStorage Caching Strategy

```typescript
// utils/cefrCache.js — batch analysis caching
const CACHE_PREFIX = 'cefr-analysis:';
const CACHE_VERSION = 'v1'; // bump on schema changes

interface CachedAnalysis {
  version: string;
  timestamp: number;
  lessonId: string;
  sentences: Array<{
    index: number;
    tokens: Array<{
      word: string;
      cefr: string;
      rank: number;
    }>;
  }>;
}

export async function getCachedAnalysis(lessonId: string): Promise<CachedAnalysis | null> {
  const raw = localStorage.getItem(`${CACHE_PREFIX}${lessonId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.version !== CACHE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function cacheAnalysis(lessonId: string, data: Omit<CachedAnalysis, 'version' | 'timestamp'>): Promise<void> {
  const payload: CachedAnalysis = {
    ...data,
    version: CACHE_VERSION,
    timestamp: Date.now(),
    lessonId,
  };
  localStorage.setItem(`${CACHE_PREFIX}${lessonId}`, JSON.stringify(payload));
}
```

**Rationale:**
- Key by `lessonId` (not lesson URL) — same video imported multiple times = separate caches
- Version field enables schema migrations (if analysis format changes)
- Timestamp enables cache invalidation policies (e.g., invalidate after 30 days)
- Try/catch around JSON.parse handles corrupted localStorage gracefully

### Animation: Wordbook Selection Feedback

```css
/* Add to immersive.css */
.immersive-word-slot--selected-for-wordbook {
  animation: wordbook-select-pulse 400ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  background-color: var(--cefr-i1-color);
}

@keyframes wordbook-select-pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.18);
  }
  100% {
    transform: scale(1.08);
    opacity: 0.85;
  }
}
```

**Rationale:** CSS-only animation avoids JS animation library dependency. `cubic-bezier(0.34, 1.56, 0.64, 1)` is a spring-like overshoot curve matching Duolingo's tactile feedback style.

## Installation

No new packages required. All dependencies already present.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Caching | Zustand persist + custom cache utils | React Query / SWR | Overkill for local-only data; adds bundle size; this is not server-fetched data |
| Animation | CSS transitions | Framer Motion | Heavy for one animation; CSS is performant enough |
| i-level storage | Zustand persist | React Context + useEffect | Zustand persist handles hydration/ssr edge cases automatically |
| Color system | CSS custom properties | JS color objects | CSS variables work with Tailwind, don't require runtime recalculation |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `localforage`, `dexie` | IndexedDB wrappers add complexity; localStorage is sufficient for <5MB analysis cache | Direct `localStorage` with try/catch |
| `motion` (Framer Motion) | 40KB+ bundle cost for one pulse animation | CSS `@keyframes` |
| Additional state library | App already uses Zustand | Extend existing store |
| CSS-in-JS | Tailwind 4 handles all styling needs | Tailwind utilities + CSS custom properties |

## Stack Patterns by Variant

**Web app:**
- Same approach — all client-side, no server changes needed
- localStorage quota: ~5MB per domain (Chrome). 50K-word analysis per lesson is <500KB. Hundreds of lessons can be cached.

**Electron desktop:**
- Same approach — renderer process has same localStorage
- Consider: desktop could pre-analyze lessons on import and store alongside lesson data in IndexedDB (future optimization, not needed for MVP)

## Version Compatibility

| Existing Package | Compatible With | Notes |
|------------------|----------------|-------|
| Zustand 5.0.11 | All features | `persist` middleware stable since v4 |
| Tailwind CSS 4.2.1 | CEFR colors | Use `@theme` directive for custom tokens |
| React 18.3.1 | All features | No hooks changes needed |
| Radix UI 1.x | i-level Select | Already in package.json |

## Sources

- Zustand persist middleware: [https://zustand.docs.pmnd.rs/middleware/persist](https://zustand.docs.pmnd.rs/middleware/persist) — HIGH confidence
- Tailwind CSS 4 theme customization: [https://tailwindcss.com/docs/theme](https://tailwindcss.com/docs/theme) — HIGH confidence
- localStorage best practices: WebSearch 2026 — MEDIUM confidence
- CEFR level definitions: Based on COCA frequency thresholds in `cefr_vocab.json` — HIGH confidence (validated source data)

---
*Stack research for: CEFR vocabulary level preprocessing and display*
*Researched: 2026-04-03*
