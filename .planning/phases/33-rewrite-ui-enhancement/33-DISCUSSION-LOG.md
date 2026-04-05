# Phase 33: Rewrite UI Enhancement - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 33-rewrite-ui-enhancement
**Areas discussed:** Yellow highlight style, Tooltip interaction, Selection conflict, Original view CEFR underlines

---

## Yellow Highlight Style

| Option | Description | Selected |
|--------|-------------|----------|
| Underline only (current implementation) | `border-bottom` amber color, no background | ✗ |
| Full block background | `background-color` yellow, no underline | ✓ |

**User's choice:** Full block background (整块背景)
**Notes:** Phase 33 requirement explicitly states "yellow background blocks"

---

## Padding + Border-radius Design

User asked for visual comparison — generated image examples showing:

| Option | Description | Selected |
|--------|-------------|----------|
| Small padding (4px 8px) + border-radius 0px | Tight rectangular block | |
| Medium padding (4px 8px) + border-radius 4px | Comfortable rounded block — recommended | ✓ |
| Large padding (8px 16px) + border-radius 8px | Loose pill-like block | |

**User's choice:** Recommended defaults — padding 4px 8px + border-radius 4px (轻盈现代感)
**Notes:** User said "前端有什么区别给我画出来" — wanted to see visual examples before deciding

---

## Tooltip Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Hover | Mouse enter → tooltip shows; mouse leave → hides | ✓ |
| Click-to-hold | Press and hold → tooltip shows; release → hides | ✗ |

**User's choice:** Hover
**Notes:** User asked "hover 和 click-to-hold是什么" — explained both, user chose hover

---

## Tooltip Content

| Option | Description | Selected |
|--------|-------------|----------|
| Original word only | "原文: {original}" | ✓ |
| Original word + CEFR level | "原文: {original} ({cefrLevel})" | ✗ |

**User's choice:** Show original word only (显示原文词即可)

---

## Selection + Rewrite Conflict

| Option | Description | Selected |
|--------|-------------|----------|
| Only one class applies | rewrite-highlight OR selected, not both | ✗ |
| Yellow priority, blue accent on top | rewrite-highlight as base, article-word--selected as inner layer | ✓ |

**User's choice:** Yellow background priority, blue selected as inner accent (黄色背景优先，蓝色选中作为内层点缀)
**Notes:** Visual layering: yellow block first, then blue overlay on top of it

---

## Original View CEFR Underlines

User asked "mappings 是什么" — explained that mappings = rewriteMappings, the array of `{original, rewritten}` pairs from the simplify-words API.

| Option | Description | Selected |
|--------|-------------|----------|
| Rewritten words show CEFR underlines in original view | Normal CEFR i+1/above-i+1 coloring applied to rewritten words too | ✗ |
| Rewritten words get no CEFR underline, only yellow block | CEFR underline suppressed for rewritten words in original view; yellow block marks i+1 | ✓ |
| Rewritten words suppressed entirely | No visual marker for rewritten words in original view | ✗ |

**User's choice:** 被简化过的词不显示 CEFR 下划线，只需要黄色背景块标记 i+1；下划线只给非重写后的 i+1 单词标记
**Notes:** This means in original view, rewritten words get a yellow background block (marking them as i+1 without a CEFR underline), while non-rewritten i+1 words get the teal CEFR underline

---

## Deferred Ideas

None — all discussion items fell within Phase 33 scope.

