# Phase 13: 桌面发布管线与签名安装包 - Research

**Researched:** 2026-03-31
**Domain:** Bottle desktop distribution surface + release metadata + Windows packaging/signing pipeline
**Confidence:** HIGH

## Summary

Phase 13 is not about inventing a second desktop product. The repository already has most of the raw ingredients:

- `app/main.py` already exposes:
  - `GET /desktop/client/latest.json`
  - `GET /desktop-client-version.json`
  - `GET /download/desktop`
- `desktop-client/package.json` already ships an `nsis` installer target and bundles:
  - helper runtime
  - `ffmpeg`
  - `yt-dlp`
  - preinstalled Bottle 1.0 model resources
- `desktop-client/scripts/package-win.mjs` already centralizes desktop packaging
- `desktop-client/scripts/write-runtime-defaults.mjs` already writes packaged `clientUpdate.metadataUrl` and `entryUrl`
- `desktop-client/build/installer.nsh` already customizes the installer flow
- `tests/contracts/test_desktop_installer_contract.py` and `tests/contracts/test_desktop_runtime_contract.py` already guard installer/runtime assumptions

The gap is productization:

1. release metadata still behaves like a thin version-check stub rather than a formal release record
2. public download is still a placeholder redirect/fallback, not a first-class official website surface
3. the packaging script still hardcodes preview URLs and does not define a repeatable signed-release path
4. the official installer still leaks technical resource choices that contradict the locked low-technical-friction product direction

**Primary recommendation:** split Phase 13 into three plans:

1. `13-01` — unify the official website download surface and release metadata
2. `13-02` — build a repeatable Windows release/signing pipeline that emits release records
3. `13-03` — formalize the installer UX and release verification contract

---

<user_constraints>
## User Constraints (from CONTEXT.md)

- Official desktop installer must live on the existing learning website, not an unrelated third-party page.
- Website download should be a unified official entry, not a replacement for high-frequency product navigation like history/upload.
- Official releases use one version truth shared by:
  - website download page
  - machine-readable release metadata
  - desktop client release diagnostics
- Public users get `stable`; internal validation can use `preview`.
- Official installer is a complete installer, not a lightweight shell that requires a second setup step.
- Official installer must not expose `model`, `helper`, `ffmpeg`, `yt-dlp`, or similar implementation terms.
</user_constraints>

---

## Existing Architecture

### Website release surface

`app/main.py`

Already has the route shape needed for Phase 13:
- `/download/desktop`
- `/desktop/client/latest.json`

Important finding:
- today `/download/desktop` is still a fallback HTML/redirect page, not a real release surface
- release payload is synthesized from scattered env vars, not a structured release record

This means Phase 13 should **upgrade the current backend release surface**, not create a parallel desktop-download system.

### Desktop runtime configuration

Relevant files:
- `desktop-client/scripts/write-runtime-defaults.mjs`
- `desktop-client/electron/runtime-config.mjs`
- `desktop-client/electron/main.mjs`

Important findings:
- packaged clients already consume `metadataUrl` and `entryUrl`
- current desktop client update behavior is still "check metadata, then open link"
- Phase 13 should keep this behavior compatible, but standardize its data source so Phase 14 can extend it cleanly

### Packaging and installer

Relevant files:
- `desktop-client/package.json`
- `desktop-client/scripts/package-win.mjs`
- `desktop-client/build/installer.nsh`
- `desktop-client/electron/helper-runtime.mjs`

Important findings:
- the current installer target and bundled resources already match the "complete installer" direction
- the installer currently writes `desktop-install-state.json` based on a user-facing "preinstall model" checkbox
- that checkbox conflicts with the product decision that official installers hide technical/runtime choices

### Frontend CTA reuse

Relevant files:
- `frontend/src/features/upload/UploadPanel.jsx`
- `frontend/src/app/bootstrap.jsx`
- `frontend/src/app/learning-shell/panelRoutes.js`
- `frontend/src/app/learning-shell/LearningShellSidebar.jsx`

Important findings:
- the product already contains desktop-only guidance and desktop entry URL wiring
- the main learning shell route structure is intentionally focused on high-frequency learning work
- Phase 13 should add a reusable website download destination without turning "download desktop" into a default learning-workbench panel

---

## Official Docs / External Guidance

### electron-builder / release metadata

Official docs indicate:
- `electron-builder` + `nsis` remain the normal Windows packaging path
- the ecosystem expects machine-readable release metadata and publish targets to remain stable
- app-binary updater design can build on top of that metadata later rather than replacing it

Primary references:
- [electron-builder auto update](https://www.electron.build/auto-update.html)
- [electron-updater overview](https://www.electron.build/electron-updater/index.html)

### Windows code signing

Official guidance indicates:
- signed Windows builds are required for user trust and are foundational for a serious public release flow
- signing must be part of the release pipeline, not an undocumented manual afterthought

Primary references:
- [Electron code signing guide](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [electron-builder code signing guidance](https://www.electron.build/code-signing.html)

### Security boundary implications

Official Electron security guidance reinforces that:
- `contextIsolation` should remain enabled
- preload exposure should stay explicit and narrow
- broader runtime hardening belongs to a dedicated boundary-tightening phase

Primary references:
- [Electron security tutorial](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron sandbox tutorial](https://www.electronjs.org/docs/latest/tutorial/sandbox)

This supports the roadmap split:
- Phase 13: release/distribution/signing
- Phase 15: renderer/preload/runtime tightening

---

## Recommended Structure

### Plan 13-01: 官方下载页与 release metadata

Target files:
- `app/main.py`
- `frontend/src/features/upload/UploadPanel.jsx`
- `tests/contracts/test_desktop_release_surface_contract.py` (new)

What it should do:
- replace the placeholder `/download/desktop` surface with a formal official download page
- introduce structured release metadata with explicit channel separation (`stable`, `preview`)
- keep `/desktop/client/latest.json` as backward-compatible stable metadata
- keep web CTA behavior pointed at one official download destination

### Plan 13-02: Windows 正式发布与签名流水线

Target files:
- `desktop-client/package.json`
- `desktop-client/scripts/package-win.mjs`
- `desktop-client/scripts/write-runtime-defaults.mjs`
- `desktop-client/scripts/release-win.mjs` (new)
- `tests/contracts/test_desktop_installer_contract.py`

What it should do:
- remove hardcoded preview deployment defaults from the release path
- define a repeatable release command that emits:
  - installer artifact
  - release record / metadata payload
  - channel-aware packaged runtime defaults
- require explicit signing inputs for official release mode
- preserve local developer packaging for unsigned `dir` / preview builds

### Plan 13-03: 正式安装器表达与发布验证

Target files:
- `desktop-client/build/installer.nsh`
- `desktop-client/electron/helper-runtime.mjs`
- `frontend/src/features/upload/UploadPanel.jsx`
- `tests/contracts/test_desktop_installer_contract.py`
- `tests/contracts/test_desktop_runtime_contract.py`
- `.planning/workstreams/milestone/phases/13-/13-RELEASE-CHECKLIST.md` (new)

What it should do:
- remove user-facing technical resource choices from the official installer
- make official install state default to complete installation
- align runtime copy so the product no longer speaks as if users opted out of bundled assets
- create a formal release checklist that verifies:
  - official website download page
  - release metadata alignment
  - signed installer output
  - stable/preview separation

---

## Patterns to Reuse

### Backend-first website entry

`app/main.py` already owns special routes like `/download/desktop` and metadata JSON responses.
Phase 13 should reuse this surface instead of creating a disconnected mini-site.

### Packaged runtime defaults

`write-runtime-defaults.mjs` is already the right place to inject channel-aware metadata URLs and entry URLs into the installer payload.

### Contract-test-first desktop hardening

The repository already treats desktop packaging and runtime boundaries as contract-test territory. Phase 13 should extend that pattern rather than rely on manual smoke checks alone.

### Static web sync requirement

`frontend/package.json` already provides `build:app-static`, and `frontend/scripts/sync-app-static.mjs` pushes the built frontend into `app/static/`.
Any website-facing frontend changes must explicitly include that sync path.

---

## Common Pitfalls

### Pitfall 1: keeping "release info" as ad-hoc env vars only

That makes version truth hard to audit and easy to drift across website, packaged runtime, and later updater flows.

### Pitfall 2: mixing `stable` and `preview`

If website default download or packaged `latest.json` points at preview builds, normal users can be upgraded into test releases.

### Pitfall 3: keeping the model checkbox in the official installer

That directly violates the locked product decision that official installers hide technical/runtime concepts.

### Pitfall 4: shipping a signing story that only works on one developer machine

Phase 13 needs a repeatable operator workflow, not "open Electron Builder locally and hope cert state is right".

### Pitfall 5: forgetting the web static sync

If the website download surface changes but `app/static` is not rebuilt, the deployed site can stay stale even when `frontend/src` looks correct.

---

## Validation Architecture

### Existing relevant tests

- `tests/contracts/test_desktop_installer_contract.py`
- `tests/contracts/test_desktop_runtime_contract.py`

### Gaps to close

1. website download page and metadata surface contract
2. stable/preview release separation
3. release pipeline output contract
4. official installer no longer exposing technical resource choices
5. release checklist existence and required sections

### Suggested commands

- `python -m pytest tests/contracts/test_desktop_installer_contract.py tests/contracts/test_desktop_runtime_contract.py -q`
- `python -m pytest tests/contracts/test_desktop_release_surface_contract.py -q`
- `npm --prefix frontend run build:app-static`

---

## Key Recommendation

Do not plan Phase 13 as "make auto update work".

Plan it as:
- formalize one official website download surface
- formalize one release metadata truth with `stable` / `preview`
- formalize one repeatable signed Windows release command
- remove installer/runtime wording that leaks implementation details to users

That keeps Phase 13 tightly aligned with `DESK-01` and `SECU-01`, while leaving in-app updating and asset delta logic to Phase 14.

---

*Research date: 2026-03-31*
*Phase: 13-desktop-release-pipeline-and-signed-installer*
