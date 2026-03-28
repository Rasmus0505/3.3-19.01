---
status: passed
phase: 09-wordbook-account-and-web-bottle-boundary
updated: 2026-03-28T23:20:00+08:00
requirements:
  - WBK-01
  - WBK-02
  - WBK-03
  - WBK-04
  - ACC-01
  - ACC-02
  - ACC-03
  - ACC-04
---

# Phase 09 Verification

## Goal Check

Phase 09 goal was to upgrade the wordbook into a real review entry point, add unique usernames and lightweight account management, and tighten the Bottle 1.0 / Bottle 2.0 web boundary.

Result: **passed**

## Automated Checks

1. `pytest tests/contracts/test_auth_contract.py -q` passed
2. `pytest tests/contracts/test_phase09_surface_contract.py -q` passed
3. `pytest tests/integration/api/test_wordbook_api.py -q` passed
4. `npm --prefix frontend run build` passed
5. `npm --prefix frontend run build:app-static` passed

## Requirement Coverage

- **WBK-01:** Wordbook collection still preserves latest sentence context and source lineage.
- **WBK-02:** Wordbook list now shows next review time, review count, wrong count, memory score, and source count.
- **WBK-03:** The panel exposes a dedicated `开始复习` entry and a due-review queue API.
- **WBK-04:** Review actions now accept `again / hard / good / easy`, update scheduler state, and drive the next review time.
- **ACC-01:** Registration now requires a unique username stored on the canonical user model.
- **ACC-02:** Logged-in users can rename from the new `个人中心` panel.
- **ACC-03:** Login remains email/password-only; username is not accepted as a login credential.
- **ACC-04:** The shared auth card now clearly separates `登录` and `注册`, with username only on registration.

## Human Verification

None required beyond normal product QA follow-up.

## Gaps Found

None
