# v2.2 Research Summary

**Date:** 2026-03-31
**Milestone:** v2.2 桌面发布与体验收口

## Stack Additions

- Keep `electron-builder` + `nsis` as the desktop release baseline.
- Add `electron-updater` for real app-binary updates instead of maintaining a custom version-check-only flow.
- Keep model/resource incremental update as a separate manifest-driven updater, but align it with the desktop release channel.
- Add release logging and code-signing support to the packaging pipeline.
- Reuse existing Radix/shadcn-capable frontend primitives for hints and wordbook redesign.

## Feature Table Stakes

- Signed Windows installer that real users can download and trust.
- Desktop app update flow with visible release info and safe failure recovery.
- Admin announcement system that supports changelog, banner, modal, sorting, pinning, and deletion.
- Wordbook redesigned around due review, mastery feedback, context recall, and bulk cleanup.
- Lightweight reusable hint system for confusing buttons and states.

## Integration Guidance

- Wrap current desktop update status UI around `electron-updater` rather than running two different update systems.
- Keep app updates and ASR model updates separate in implementation, unified in user experience.
- Use one backend announcement model for both web and desktop consumption.
- Build wordbook as review-first UI, not metadata-first UI.

## Watch Out For

- Shipping unsigned installers or a “check update” flow that cannot actually complete updates.
- Leaving desktop security debt untouched while claiming the app is hardened.
- Expanding announcements into a full CMS.
- Adding more wordbook detail while making review slower.
- Treating pronunciation / IPA as guaranteed scope before feasibility is clear.

## Immediate Planning Implications

- v2.2 requirements should split into at least these domains:
  - desktop distribution and updater
  - announcement publishing
  - desktop hardening
  - wordbook redesign
  - UX hint system
- Pronunciation / IPA and selection translation should be planned carefully:
  - selection translation is likely near-core if it reuses stored lesson context
  - pronunciation / IPA should remain gated unless implementation path proves simple

## Primary Sources

- [electron-builder Auto Update](https://www.electron.build/auto-update.html)
- [electron-builder electron-updater](https://www.electron.build/electron-updater/index.html)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Electron Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [shadcn/ui Components](https://ui.shadcn.com/docs/components)
- [shadcn/ui Tooltip](https://ui.shadcn.com/docs/components/base/tooltip)
