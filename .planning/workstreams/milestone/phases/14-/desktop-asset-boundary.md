# Desktop Asset Boundary Contract (SECU-03)

## Overview

This document defines the security boundary between **protected assets** (bundled with the installer, read-only at runtime) and **updateable assets** (user data that can be modified or replaced during model updates).

This contract is maintained as part of SECU-03: "桌面客户端代码保护与发布安全加固".

---

## Protected Assets (随正式包更新)

These assets are bundled in the installer and should NOT be modified at runtime. They are read-only baselines that ship with each stable release.

| Asset | Installer Path | Runtime Path | Notes |
|-------|--------------|--------------|-------|
| Electron main app | `app.asar` | `resources/app.asar` | Core application bundle |
| Desktop helper runtime | `resources/desktop-helper-runtime/BottleLocalHelper.exe` | `resources/desktop-helper-runtime/BottleLocalHelper.exe` | Local execution helper |
| FFmpeg binaries | `resources/runtime-tools/ffmpeg/` | `resources/runtime-tools/ffmpeg/` | Media processing tools |
| yt-dlp binary | `resources/runtime-tools/yt-dlp/yt-dlp.exe` | `resources/runtime-tools/yt-dlp/yt-dlp.exe` | Video/audio download tool |
| Preinstalled ASR model | `resources/preinstalled-models/faster-distil-small.en/` | `resources/preinstalled-models/faster-distil-small.en/` | Bottle 1.0 baseline model |
| Install state file | N/A (created on install) | `resources/desktop-install-state.json` | Installer metadata |
| Frontend dist bundle | `.cache/frontend-dist/` | `app.asar.unpacked/.cache/frontend-dist/` | Static web assets |

### Baseline Model Information

- **Model Key**: `faster-whisper-medium`
- **Bundle Name**: `faster-distil-small.en`
- **Baseline Hash**: To be recorded during release build
- **Baseline Version**: To be recorded during release build

---

## Updateable Assets (允许增量更新)

These assets can be created, modified, or replaced during runtime operations including model updates.

| Asset | Installer Path | Runtime Path | Notes |
|-------|--------------|--------------|-------|
| User data directory | N/A | `{userData}/` | User-specific runtime data |
| User Bottle 1.0 model | N/A | `{userData}/models/faster-whisper-medium/` | Copy of bundled model, can be updated |
| Runtime configuration | N/A | `{userData}/desktop-runtime.json` | Cloud API URLs, local paths |
| Auth session cache | N/A | `{userData}/desktop-auth-session.json` | Cached login session |
| Update downloads | N/A | `{userData}/updates/` | Downloaded update packages |
| Client update manifest | N/A | `{userData}/updates/checkpoint.json` | Update checkpoint state |
| Log files | N/A | `{userData}/logs/` | Runtime logs |

---

## Security Notes

### What IS Protected
- All executable code (`app.asar`, `BottleLocalHelper.exe`)
- System tools (`ffmpeg`, `yt-dlp`)
- Baseline ASR model (read-only baseline for delta updates)
- Installer metadata

### What IS NOT Protected
- User data in `{userData}/` directory
- Model files that are copied from bundled baseline to user data
- Configuration files that may contain user preferences
- Auth session cache (encrypted credentials)

### Why This Separation Matters

1. **Baseline Integrity**: The bundled model serves as a known-good baseline for delta computation. If this baseline is modified, incremental updates may compute incorrect deltas.

2. **Update Safety**: By separating protected and updateable assets, we ensure that:
   - A failed model update cannot corrupt the core application
   - Users can always restore to the baseline by reinstalling
   - Security-critical binaries cannot be replaced by malicious updates

3. **Delta Efficiency**: Model updates only download changed files, not the full model bundle.

---

## Release Checklist

Before publishing a stable release, verify:

- [ ] All protected assets are listed above and match `installer.nsh` contents
- [ ] No new assets were added to `resources/` that should be updateable
- [ ] Preinstalled model baseline hash recorded in this document
- [ ] `desktop-install-state.json` schema version matches current installer
- [ ] Baseline model version hash recorded in `14-ASSET-BASELINE.json`
- [ ] All bundled binaries have been scanned for malware
- [ ] Update code cannot write outside user-data directory
- [ ] Model update code cannot write to protected asset paths

---

## Decision Log

| Decision | Date | Rationale |
|----------|------|-----------|
| Bundled model is read-only baseline | 2026-03-28 | Ensures delta computation integrity |
| User-data is always write target for updates | 2026-03-28 | Protects bundled assets from corruption |
| Helper exe is bundled, not user-data | 2026-03-28 | Security: prevents helper substitution |
| FFmpeg/yt-dlp are bundled | 2026-03-28 | Consistent behavior across installs |
| Install state is created by installer | 2026-03-28 | Tracks installation metadata |

---

*Last updated: 2026-04-01*
*Maintained by: Phase 14 execution (14-03)*
