# Testing

## Test Layout

Configured in `pytest.ini`:

- `tests/unit`
- `tests/integration`
- `tests/e2e`
- `tests/contracts`
- `tests/fixtures`

Pytest setup:

- `pythonpath = .`
- test file pattern `test_*.py`

## Unit Tests

Unit coverage includes focused behavior such as:

- `tests/unit/test_dashscope_upload_router.py`
- `tests/unit/test_desktop_local_asr.py`
- `tests/unit/test_faster_whisper_asr.py`
- `tests/unit/test_security_hardening.py`
- `tests/unit/test_spa_route_fallback.py`
- `tests/unit/test_start_script_smoke.py`
- `tests/unit/test_translation_qwen_mt.py`

These tests heavily use monkeypatching and local SQLite/test clients.

## Integration Tests

Integration coverage includes:

- admin bootstrap and admin console APIs
- lesson task recovery and regression flows
- production migration script behavior
- lesson/practice/wordbook API routes

Representative files:

- `tests/integration/test_regression_api.py`
- `tests/integration/test_run_prod_migration.py`
- `tests/integration/api/test_lessons_api.py`

## End-to-End Tests

`tests/e2e/test_e2e_key_flows.py` exercises realistic flows such as:

- auth register/login
- lesson creation
- practice/progress updates
- wordbook collection and status changes
- admin wallet adjustment flows

The e2e layer still runs in-process with FastAPI `TestClient`; it is not browser-driven.

## Contract Tests

A distinct strength of this repo is contract testing for file-level integration assumptions.

Representative checks:

- `tests/contracts/test_desktop_runtime_contract.py`
- `tests/contracts/test_desktop_installer_contract.py`
- `tests/contracts/test_dependency_manifest_contract.py`
- `tests/contracts/test_build_context_contract.py`

These tests assert that critical strings, file paths, packaging assumptions, and renderer/main-process hooks remain aligned.

## Fixtures and Helpers

Reusable setup modules live in:

- `tests/fixtures/auth.py`
- `tests/fixtures/billing.py`
- `tests/fixtures/db.py`
- `tests/fixtures/lessons.py`
- `tests/conftest.py`

## Coverage Observations

Strong areas:

- backend API and service workflows
- desktop runtime packaging contracts
- startup and migration behavior

Weaker / less visible areas from current inspection:

- no browser automation suite for the React UI
- no dedicated frontend unit test runner observed for `frontend/src/` beyond one feature-local test file
- admin web nginx image path appears validated mainly through packaging/build assumptions rather than UI interaction tests
