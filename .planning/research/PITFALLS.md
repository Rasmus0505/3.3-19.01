# v2.2 Research: Pitfalls

**Date:** 2026-03-31
**Milestone:** v2.2 桌面发布与体验收口

## 1. Building A “Fake” Updater

### Risk

The codebase already has custom version-check state. It is easy to mistake that for a complete updater and ship a product that can only tell users “a new version exists” without safely downloading/installing it.

### Prevention

- Treat version check, artifact hosting, installer signing, update download, install, rollback messaging, and diagnostics as one release system.
- Use `electron-updater` on top of the existing status UI instead of keeping two update mechanisms.

## 2. Testing Updates Only In Dev Mode

### Risk

Electron Builder docs explicitly warn that update UX should be tested on installed applications, especially on Windows. Dev-mode updater checks are not enough.

### Prevention

- Require installed-build update verification in milestone acceptance.
- Test both:
  - app binary update
  - model/resource delta update

## 3. Shipping Unsigned Or Weakly Trusted Windows Builds

### Risk

Unsigned or poorly signed builds will trigger SmartScreen / trust warnings and make the “可发布给用户使用” goal fail in practice even if the installer technically works.

### Prevention

- Make signing part of the release pipeline, not a manual afterthought.
- Define release readiness to include signing verification.

## 4. Overpromising Desktop Code Secrecy

### Risk

Electron apps package JavaScript and assets; they can be inspected. A milestone promise of “prevent code leakage” becomes impossible if stated as absolute protection.

### Prevention

- Reframe as “raise extraction and reuse cost”.
- Focus on:
  - release signing
  - privilege minimization
  - API surface reduction
  - asset placement review
  - build/runtime hardening

## 5. Keeping Weak Renderer Boundaries

### Risk

Current desktop window config still uses `sandbox: false`, and `webSecurity` is disabled when loading the bundled file renderer. That leaves security debt in the exact area the milestone is trying to harden.

### Prevention

- Audit whether packaged renderer can move to safer defaults.
- Explicitly review preload-exposed APIs and URL opening flows.

## 6. Turning Announcements Into A Mini-CMS

### Risk

If changelog, banner, popup, targeting, analytics, localization, scheduling, and audience rules all land in one phase, the feature will expand far beyond the milestone goal.

### Prevention

- Keep v2.2 announcement scope to:
  - create
  - render as changelog/banner/modal
  - sort / pin
  - delete
  - basic active visibility

## 7. Making Wordbook Rich But Not Efficient

### Risk

It is easy to add more metadata, controls, and decoration while making review slower and noisier.

### Prevention

- Treat “专注复习” as a hard product requirement.
- Put review speed, context recall, and mastery feedback ahead of collection-management density.

## 8. Underestimating Pronunciation / IPA

### Risk

Pronunciation audio and phonetic symbols can drag in dictionary sourcing, licensing, API cost, or low-quality fallback behavior.

### Prevention

- Keep pronunciation / IPA behind a feasibility gate.
- Only promote to hard scope after source, UX, and cost are validated.

## 9. Forgetting Web Static Sync

### Risk

This project already has a hard delivery contract: web-facing frontend changes are not complete until `app/static` is synced and verified.

### Prevention

- Include `app/static` sync/verification in any roadmap phase that touches web UX or admin frontend routes.

## Primary Sources

- [electron-builder Auto Update](https://www.electron.build/auto-update.html)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Electron Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
