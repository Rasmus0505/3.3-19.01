# v2.2 Research: Features

**Date:** 2026-03-31
**Milestone:** v2.2 桌面发布与体验收口

## Desktop Distribution and Updates

### Table Stakes

- User can download a signed Windows installer from an official release channel.
- Installer version and app version are traceable to one release record.
- Desktop app can check whether a newer app version exists.
- Desktop app can present release notes / update name before installation.
- App update flow has clear fallback when update fails: retry, manual download, logs.
- ASR model/resource update can detect local vs remote version and only fetch changed files.

### Differentiators

- Unified release surface where app version update and model update feel like one coherent “Bottle desktop upgrade” experience.
- Desktop diagnostics panel exposes updater status, versions, and failure reason in user-readable terms.
- Rollout control can be added later through release metadata without redesigning the whole updater.

### Anti-Features

- Forcing users to re-download the whole installer for every model adjustment.
- Shipping unsigned installers for public users.
- Treating “check update” and “actually update” as hidden or unverifiable background magic.

## Admin Announcements

### Table Stakes

- Admin can create announcement/update log entries.
- Each announcement can be marked as changelog, banner, or modal.
- Admin can sort, pin/top, and delete announcements.
- Announcements can be rendered on user-facing surfaces with basic visibility control.

### Differentiators

- One announcement can support both release-note content and UI placement rules.
- Release records and announcements can be linked so desktop updates and site communication stay aligned.

### Anti-Features

- Building a full marketing automation system.
- Adding excessive targeting/rules before basic publishing quality is stable.

## Wordbook Review Experience

### Table Stakes

- Review flow is focused and low-noise, with collected word, meaning/context, and review action all visible without clutter.
- Mastery/progress is visible per word.
- Due review queue is prioritized over passive list browsing.
- Bulk operations exist for cleanup and curation.
- User can reopen example sentence and source lesson context.

### Differentiators

- Forgetting-curve inspired scheduling feels noticeably smarter than the current due-only queue.
- Selection-based translation from stored context supports “only translate the uncertain fragment” instead of re-reading the whole sentence.
- UI visually matches the rest of the polished app rather than looking like an internal tool.

### Candidate / Feasibility-Gated

- Pronunciation playback
- Phonetic symbols / IPA

These are useful but should stay gated until implementation source, quality, and licensing path are clear.

## UX Hints and Interaction Polish

### Table Stakes

- High-confusion buttons expose lightweight hover/focus hints.
- Hints auto-dismiss and do not permanently block the screen.
- Mobile and desktop behavior stays consistent enough to avoid surprise.

### Differentiators

- A small, reusable hint system that can support first-use education, blocked states, and inline recovery guidance.
- Hints are tied to actual user confusion hotspots, not sprayed across every button.

## Primary Sources

- [electron-builder Auto Update](https://www.electron.build/auto-update.html)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [shadcn/ui Components](https://ui.shadcn.com/docs/components)
- [shadcn/ui Tooltip](https://ui.shadcn.com/docs/components/base/tooltip)
