---
status: testing
phase: 13-desktop-release-pipeline-and-signed-installer
source:
  - 13-01-SUMMARY.md
  - 13-02-SUMMARY.md
  - 13-03-SUMMARY.md
started: 2026-04-01T00:42:10.1959248+08:00
updated: 2026-04-01T00:45:31.0000000+08:00
---

## Current Test

number: 6
name: Real Release Artifact Check
expected: |
  A signed stable installer shows valid Windows signature and file properties, installs with complete-install defaults, hides technical component toggles, and persists install state.
awaiting: user response

## Tests

### 1. Unified Desktop Entrypoint
expected: Website desktop entry actions continue to point to `/download/desktop`, not a scattered third-party direct link.
result: pass

### 2. Stable Download Redirect
expected: Visiting `/download/desktop` returns an immediate redirect to `https://share.feijipan.com/s/1n2mH6fh`.
result: pass

### 3. Preview Surface Disabled
expected: `/download/desktop?channel=preview` returns `404`, and `/desktop/client/channels/preview.json` returns `404`.
result: pass

### 4. Stable Metadata Exposure
expected: `/desktop/client/latest.json` and `/desktop/client/channels/stable.json` both expose stable-only metadata, including `channel=stable`, stable version fields, `releaseName`, `entryUrl` set to the Feijipan URL, and signing flags.
result: pass

### 5. Stable-Only Release Pipeline Contract
expected: Release and packaging defaults target only the stable channel and stable public entry URL, and no preview record is part of the supported Phase 13 surface.
result: pass

### 6. Real Release Artifact Check
expected: A signed stable installer shows valid Windows signature and file properties, installs with complete-install defaults, hides technical component toggles, and persists install state.
result: blocked
blocked_by: release-build
reason: "Code-level verification mode does not include a real signed stable installer artifact; this check remains blocked until a signed release package is produced."

### 7. Production Deployment Check
expected: The deployed `/download/desktop` route redirects to the Feijipan URL and production `preview.json` stays unavailable.
result: blocked
blocked_by: server
reason: "Code-level verification mode does not include a live deployed environment; this check remains blocked until the stable release is deployed."

## Summary

total: 7
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 2

## Gaps

none yet
