# v2.2 Research: Stack

**Date:** 2026-03-31
**Milestone:** v2.2 桌面发布与体验收口

## Current Stack Fit

- Desktop packaging already uses `electron-builder@25.1.8` with Windows `nsis` target in `desktop-client/package.json`. This is the right baseline for a user-facing Windows installer.
- Desktop runtime already contains custom client-update state and model-manifest delta update logic in `desktop-client/electron/main.mjs` and `desktop-client/electron/model-updater.mjs`.
- Frontend already includes Radix-based primitives and `@radix-ui/react-tooltip` / `@radix-ui/react-popover`, so UX hints can be standardized without introducing a second component foundation.
- Wordbook backend already exists with collection, review queue, status mutation, and source-link context tables. v2.2 should build on that instead of replacing it.

## Recommended Stack Additions

### Desktop Release and App Update

- Add `electron-updater` as a runtime dependency for packaged app update checks and installs.
- Keep `electron-builder` as the packaging tool and stay on `nsis` for Windows auto-update compatibility.
- Add `electron-log` (or equivalent file logger) for updater diagnostics in packaged builds.
- Use a simple HTTPS-hosted release channel first:
  - Generic HTTPS file host, object storage, or release CDN
  - `latest.yml` + installer artifacts published by CI
- Keep ASR model/resource incremental update as a separate manifest pipeline, but align it with the same release channel and version semantics.

### Release Security

- Add Windows code signing to the release pipeline before public distribution.
- Prefer a cloud-signing path that works in CI:
  - EV certificate with supported signing workflow
  - or Azure Trusted Signing if organization eligibility permits

### Admin Announcements

- Reuse existing FastAPI + admin surface.
- Add a first-party announcement model instead of embedding a CMS.
- Support announcement presentation variants in one system:
  - changelog/update log
  - dismissible banner
  - modal popup

### Wordbook UI

- Reuse the current React/Radix stack, but refactor the wordbook surface toward shadcn-style patterns:
  - `Tabs`
  - `Card`
  - `Dialog`
  - `Tooltip`
  - `Badge`
  - `Table` / `Data Table`
  - `Sheet` / `Drawer`
  - `Command` / search-driven interactions

## What Not To Add

- Do not replace `electron-builder` with a second release tool in the same milestone.
- Do not introduce a separate headless CMS just for announcements.
- Do not move core learning logic into a brand-new frontend stack.
- Do not promise native-code obfuscation or “uncrackable” desktop protection as the milestone goal.

## Why This Stack

- Official Electron Builder docs state that auto updates are supported on Windows with the `NSIS` target and are driven by `electron-updater`, release metadata, and hosted artifacts.
- Official Electron code-signing docs emphasize that public distribution should be signed to avoid Windows trust warnings.
- Official shadcn docs show the current library already covers the interaction primitives needed for wordbook redesign and contextual hints.

## Primary Sources

- [electron-builder Auto Update](https://www.electron.build/auto-update.html)
- [electron-builder electron-updater](https://www.electron.build/electron-updater/index.html)
- [Electron Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [electron-builder Windows Code Signing](https://www.electron.build/code-signing-win.html)
- [shadcn/ui Components](https://ui.shadcn.com/docs/components)
- [shadcn/ui Tooltip](https://ui.shadcn.com/docs/components/base/tooltip)
