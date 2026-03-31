phase: 13-desktop-release-pipeline-and-signed-installer
plan: "03"
subsystem: desktop-installer-formalization

- Removed the installer’s user-facing “preinstall model” checkbox and made official installs default to complete installation.
- Kept runtime install-state persistence intact through `desktop-install-state.json`.
- Updated UploadPanel bundled-runtime copy so it no longer implies official users opted out of preinstalled assets.
- Added `13-RELEASE-CHECKLIST.md` to cover official download page, metadata, channel separation, signing, and installer UX validation.

Verification:
- `python -m pytest tests/contracts/test_desktop_installer_contract.py tests/contracts/test_desktop_runtime_contract.py -q`

Residual manual check:
- Execute the release checklist on a real stable installer and confirm no technical resource choices appear during installation.
