phase: 13-desktop-release-pipeline-and-signed-installer
plan: "01"
subsystem: desktop-release-surface

- Upgraded `app/main.py` desktop release surface from placeholder fallback to structured stable/preview metadata plus an official `/download/desktop` page.
- Added `tests/contracts/test_desktop_release_surface_contract.py` to lock stable/preview release payloads and the official download page contract.
- Kept website desktop CTAs aligned to one official download destination by defaulting web download entry to `/download/desktop`.

Verification:
- `python -m pytest tests/contracts/test_desktop_release_surface_contract.py -q`

Residual manual check:
- Validate the rendered download page against real stable/preview deployment data after publishing release records.
