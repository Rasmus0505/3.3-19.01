# Phase 4: Desktop Link Import - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 04-desktop-link-import
**Mode:** mixed (auto + user correction)
**Areas discussed:** Entry surface, Local ingestion strategy, User-visible behavior, Failure and recovery

---

## Entry surface

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse upload surface | Keep link import inside the existing desktop upload/generation UI | ✓ |
| Separate desktop import page | Create a dedicated desktop-only import page before generation | |
| Server-assisted import wizard | Add a backend-mediated import flow | |

**User's choice:** Reuse upload surface with always-visible source tabs
**Notes:** User wants the upload area to keep `本地文件` / `链接导入` as always-visible tab-style options, rather than hiding source choice behind a secondary button-only switch.

---

## Local ingestion strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Common public video page links first | Prioritize common public video page links, use desktop-local tooling, sanitize pasted URLs, and allow only one link at a time | ✓ |
| Server-side link fetch | Download/convert links through the server | |
| Browser parity import | Try to support link import in browser contexts too | |

**User's choice:** Common public video page links first
**Notes:** User clarified that Phase 4 should prioritize common public video page links over plain direct-file URLs, accept only one link at a time, sanitize noisy copied link text before import, keep the first recognized valid URL when share text is messy, and then continue automatically without extra confirmation.

---

## User-visible behavior

| Option | Description | Selected |
|--------|-------------|----------|
| One coherent import-to-generate flow with visible external fallback | Paste link, run built-in desktop import when supported, keep a lower-priority always-visible SnapAny fallback button on both desktop and web, and use `导入并生成课程` as the primary CTA | ✓ |
| Separate imported-lesson flow | Imported lessons follow a distinct history or learner entry path | |
| Link-source badges in normal learner flow | Keep imported lessons visibly distinguished in history/learning | |

**User's choice:** One coherent import-to-generate flow with visible external fallback
**Notes:** User wants `https://snapany.com/zh` available as an always-visible fallback button on both desktop and web, but not promoted above the built-in path. The primary button in the link tab should read `导入并生成课程`, and clicking it should immediately run the whole import-to-generate pipeline. If link metadata contains a usable title, that parsed title should become the default course title, the title should remain editable even while generation is still in progress, and edits made during generation should take effect immediately as the final title. If the user switches away from the link tab during active import, the product should ask whether to continue in the background or cancel. On success, the user should go straight into learning.

---

## Failure and recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Local-first failure handling with explicit fallback recommendation | Keep unsupported-link, download-failed, and cancel/retry behavior on the desktop upload surface, and on failure explicitly recommend SnapAny without auto-opening it | ✓ |
| Silent fallback to server processing | Hide import failure by pushing media work onto the backend | |
| Split local error UI from shared upload flow | Give link import a separate failure surface | |

**User's choice:** Local-first failure handling with explicit fallback recommendation
**Notes:** User chose a middle path: do not auto-open SnapAny on generic import failure, but when the pasted text cannot be recognized as a usable link, show the exact error `未识别到可导入链接。`, add a concrete example hint, and make `SnapAny` a clickable word that copies the URL and opens the fallback site. If import fails after entry, preserve the current link in the input so retry is low-friction. If the link appears to require login or is blocked by platform restrictions, show a dedicated restriction message and recommend SnapAny there as well. Anywhere the word `SnapAny` appears in this flow, it should be clickable with the same copy+open behavior.

---

## the agent's Discretion

- Exact copy for unsupported-link and retry/cancel states
- Which imported metadata should become the default lesson title/source label
- Exact styling and placement of the always-visible SnapAny fallback button, as long as it stays secondary
