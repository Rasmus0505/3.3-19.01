phase: 13-desktop-release-pipeline-and-signed-installer
plan: "03"
subsystem: desktop-installer-formalization

- Kept the installer default-complete-install contract intact while updating Phase 13 verification artifacts for stable-only distribution.
- Rewrote `13-RELEASE-CHECKLIST.md`, `13-RELEASE-RUNBOOK.md`, and `13-VALIDATION.md` to describe Feijipan redirect distribution and preview removal.
- Left installer UX expectations focused on complete install, hidden technical options, and persisted install state.

Verification:
- `python -m pytest tests/contracts/test_desktop_installer_contract.py tests/contracts/test_desktop_runtime_contract.py tests/contracts/test_desktop_release_surface_contract.py -q`

Residual manual check:
- Execute the revised release checklist on a real stable installer and confirm the public website no longer exposes a rendered download page or preview channel.
