# Concerns

## Repository Hygiene

The repo currently contains a significant amount of generated or machine-local content:

- `frontend/node_modules/` is present in the working tree
- `frontend/dist/` and `frontend/dist-admin/` are present
- `desktop-client/.cache/` is present
- local SQLite files `app.db`, `app.db-shm`, `app.db-wal` are present
- many `__pycache__/` directories and `*.pyc` files are present across `app/`, `tests/`, `migrations/`, and `asr-test/`

Observed counts during mapping:

- `frontend_node_modules_files=21460`
- `desktop_cache_files=690`
- `frontend_dist_files=27`
- `__pycache__=32`
- `pyc=230`

This increases clone weight, review noise, and the risk of stale artifacts affecting debugging.

## Mixed Source and Generated Output

Multiple directories mix hand-written source with generated output or runtime caches:

- `frontend/` mixes source, local build output, and `node_modules`
- `desktop-client/` mixes source with `.cache/` helper/runtime/frontend artifacts
- `asr-test/` mixes scripts, large model files, benchmark runs, and result archives

This makes it harder to tell which files are canonical source of truth.

## Router / Module Shape Drift

The backend contains both legacy flat router files and nested router packages, for example:

- `app/api/routers/auth.py` and `app/api/routers/auth/router.py`
- `app/api/routers/admin.py` and `app/api/routers/admin/router.py`
- `app/api/routers/billing.py` and `app/api/routers/billing/router.py`
- `app/api/routers/lessons.py` and `app/api/routers/lessons/router.py`

This often indicates an in-progress refactor or compatibility layer and can confuse new contributors.

## Operational Complexity

The product surface spans:

- web app
- admin app
- desktop client
- local helper runtime
- cloud ASR path
- local ASR path
- migration-sensitive backend readiness

That breadth increases coordination cost and raises regression risk at boundaries, especially around auth/session, media handling, and packaging.

## Security / Safety Sensitivity

The app includes several sensitive operational controls:

- JWT auth in `app/security.py`
- admin bootstrap in `app/services/admin_bootstrap.py`
- export-confirmation guard in `app/core/config.py`
- SQL/admin console routes in `app/api/routers/admin_sql_console.py` and related modules

These areas deserve extra scrutiny in production because mistakes have outsized blast radius.

## Testing Gaps Relative to Product Surface

Backend testing is substantial, but UI/runtime integration breadth still exceeds what appears to be covered automatically:

- no browser-driven web UI test suite was observed
- desktop renderer behavior relies heavily on contract tests and string assertions
- admin web deployment path is separate from the main Docker build path, which can drift if not exercised regularly

## Deployment and Migration Risk

Readiness logic in `app/main.py` depends on schema completeness and strong production settings. That is good for safety, but it also means:

- partially migrated environments will fail readiness
- config drift on `DATABASE_URL`, `ADMIN_BOOTSTRAP_PASSWORD`, or `REDEEM_CODE_EXPORT_CONFIRM_TEXT` can block rollout
- startup behavior differs materially depending on `AUTO_MIGRATE_ON_START`
