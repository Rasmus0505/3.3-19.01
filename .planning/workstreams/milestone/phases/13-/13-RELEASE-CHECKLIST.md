# Phase 13 Release Checklist

## Public Download Entry

- [ ] Visiting `/download/desktop` immediately redirects to the Feijipan stable link: `https://share.feijipan.com/s/1n2mH6fh`
- [ ] `/download/desktop?channel=preview` no longer works and returns `404`
- [ ] Web desktop CTAs still point to `/download/desktop`, not a scattered direct link

## Release Metadata

- [ ] `GET /desktop/client/latest.json` returns stable version info
- [ ] `GET /desktop/client/channels/stable.json` returns the stable release record
- [ ] `GET /desktop/client/channels/preview.json` returns `404`
- [ ] Stable metadata includes `channel`, `version`, `releaseName`, `entryUrl`
- [ ] Stable metadata `entryUrl` is the Feijipan stable link

## Stable Release Pipeline

- [ ] `release-win` only emits stable release records
- [ ] Generated `desktop-releases.json` only contains the stable channel
- [ ] Stable release record still marks signing as required
- [ ] Stable installer signature/file properties still verify correctly

## Installer Experience

- [ ] Installer defaults to complete installation
- [ ] Installer does not expose `model / helper / ffmpeg / yt-dlp`
- [ ] Installation writes `desktop-install-state.json`
- [ ] Installed Bottle 1.0 local assets remain ready to use without extra user setup
