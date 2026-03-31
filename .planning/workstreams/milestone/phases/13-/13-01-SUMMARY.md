phase: 13-desktop-release-pipeline-and-signed-installer
plan: "01"
subsystem: desktop-release-surface

- Reworked `app/main.py` so `/download/desktop` stays as the one public entrypoint but now redirects to the stable Feijipan link instead of rendering a first-party download page.
- Kept `GET /desktop/client/latest.json` and `GET /desktop/client/channels/stable.json`, and disabled `preview.json` as an unsupported route.
- Kept website desktop CTAs aligned to `/download/desktop` so public download entry remains centralized.
- Updated `tests/contracts/test_desktop_release_surface_contract.py` to lock stable-only metadata plus Feijipan redirect behavior.

Verification:
- `python -m pytest tests/contracts/test_desktop_release_surface_contract.py -q`

Residual manual check:
- Confirm deployed `/download/desktop` immediately redirects to the Feijipan stable link.
