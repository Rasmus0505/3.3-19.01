phase: 13-desktop-release-pipeline-and-signed-installer
plan: "02"
subsystem: desktop-release-pipeline

- Simplified `desktop-client/scripts/release-win.mjs` to a stable-only release flow and made the Feijipan URL the default public installer entry.
- Simplified `desktop-client/scripts/write-runtime-defaults.mjs` and `desktop-client/scripts/package-win.mjs` so packaged defaults always target stable metadata and the stable public download URL.
- Updated desktop contract tests to lock the stable-only release pipeline assumptions.

Verification:
- `python -m pytest tests/contracts/test_desktop_installer_contract.py tests/contracts/test_desktop_runtime_contract.py -q`

Residual manual check:
- Run `release-win.mjs` with a real Windows signing certificate and confirm the generated stable metadata plus installer match the Feijipan release record.
