phase: 13-desktop-release-pipeline-and-signed-installer
plan: "02"
subsystem: desktop-release-pipeline

- Removed the hardcoded preview deployment URL from `desktop-client/scripts/package-win.mjs`.
- Added channel-aware packaged runtime defaults in `desktop-client/scripts/write-runtime-defaults.mjs`.
- Added `desktop-client/scripts/release-win.mjs` and package script `release:win` so stable/preview releases can emit release records and enforce signing requirements for stable.
- Extended installer contract tests to lock the new signed-release workflow expectations.

Verification:
- `python -m pytest tests/contracts/test_desktop_installer_contract.py -q`

Residual manual check:
- Run `release-win.mjs` with a real Windows signing certificate and confirm the generated stable installer is signed correctly.
