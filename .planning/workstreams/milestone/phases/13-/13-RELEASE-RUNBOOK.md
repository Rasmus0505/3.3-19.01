# Phase 13 Release Runbook

## Purpose

This runbook turns Phase 13 into a stable-only Windows release flow.

It covers:
- stable installer packaging and signing
- stable release metadata generation
- Feijipan public distribution
- post-release manual verification

It does not cover:
- in-app auto-update execution
- preview/internal release distribution

---

## Release Outputs

Each release produces:

1. a signed Windows installer
2. stable release metadata
3. a stable-only `desktop-releases.json`
4. a release verification record

Repository locations:

- installer: `desktop-client/dist/`
- stable metadata: `desktop-client/dist/release/stable.json`
- registry: `desktop-client/dist/release/desktop-releases.json`
- manual checklist: `13-RELEASE-CHECKLIST.md`

---

## Required Environment Variables

PowerShell:

```powershell
$env:DESKTOP_RELEASE_VERSION="2.2.0"
$env:DESKTOP_RELEASE_APP_URL="https://你的正式网站域名"
$env:DESKTOP_RELEASE_API_BASE_URL="https://你的正式网站域名"
$env:DESKTOP_RELEASE_NOTES="这里写本次桌面版本的更新说明摘要"
$env:DESKTOP_RELEASE_ENTRY_URL="https://share.feijipan.com/s/1n2mH6fh"
$env:DESKTOP_SIGN_CERT_FILE="D:\\certs\\bottle-desktop.pfx"
$env:DESKTOP_SIGN_CERT_PASSWORD="你的证书密码"
```

Optional:

```powershell
$env:DESKTOP_SIGN_CERT_SUBJECT_NAME="你的证书主题名"
```

Notes:
- public distribution is now stable-only
- `DESKTOP_RELEASE_ENTRY_URL` should point at the Feijipan stable link
- `release-win.mjs` rejects non-stable channels

---

## Stable Release Command

```powershell
$env:DESKTOP_RELEASE_VERSION="2.2.0"
$env:DESKTOP_RELEASE_APP_URL="https://你的网站域名"
$env:DESKTOP_RELEASE_API_BASE_URL="https://你的网站域名"
$env:DESKTOP_RELEASE_NOTES="Bottle 桌面端正式发布版本"
$env:DESKTOP_RELEASE_ENTRY_URL="https://share.feijipan.com/s/1n2mH6fh"
$env:DESKTOP_SIGN_CERT_FILE="D:\\certs\\bottle-desktop.pfx"
$env:DESKTOP_SIGN_CERT_PASSWORD="你的证书密码"
node .\desktop-client\scripts\release-win.mjs --target nsis
```

Expected outputs:
- `desktop-client/dist/release/stable.json`
- `desktop-client/dist/release/desktop-releases.json`
- signed stable installer under `desktop-client/dist/`

---

## Deployment Steps

### 1. Upload installer to Feijipan

- upload the produced stable installer to Feijipan
- confirm the public link remains `https://share.feijipan.com/s/1n2mH6fh`

### 2. Deploy stable metadata to the server

- place `desktop-client/dist/release/desktop-releases.json` on the server
- configure `DESKTOP_CLIENT_RELEASES_FILE` to that file
- restart the app service

The website keeps `/download/desktop` as the official entrypoint, but it now redirects to Feijipan instead of rendering a download page.

---

## Verification Order

1. Open `/desktop/client/latest.json`
2. Open `/desktop/client/channels/stable.json`
3. Confirm `/desktop/client/channels/preview.json` returns `404`
4. Open `/download/desktop` and confirm immediate redirect to Feijipan
5. Download the stable installer from Feijipan
6. Verify file signature
7. Install and confirm no technical asset choices appear
8. Launch the client and confirm release diagnostics still point at stable metadata

Use `13-RELEASE-CHECKLIST.md` as the final sign-off list.

---

## Rollback

If a stable release is bad:

1. keep the prior installer available
2. roll back the server-side `desktop-releases.json` stable record
3. keep `/download/desktop` live so web CTAs still resolve through one entrypoint
4. replace the Feijipan target with the previous good installer if needed

---

## Phase Complete When

1. `release-win.mjs` produces a signed stable package
2. `desktop-releases.json` contains only stable
3. `/download/desktop` redirects to Feijipan
4. `13-RELEASE-CHECKLIST.md` is fully complete
