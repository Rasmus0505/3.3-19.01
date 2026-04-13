"""
Unit tests for Phase: Remove local model dependencies

Verifies:
- FASTER_WHISPER_ASR_MODEL is removed from billing constants
- Faster Whisper settings endpoints remain removed
- Billing rates endpoints work correctly without faster-whisper
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api.deps.auth import get_admin_user, get_current_user
from app.db import get_db
from app.main import create_app
from app.services.billing import ADMIN_BILLING_MODEL_ORDER, PUBLIC_BILLING_MODEL_ORDER


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def client(db_session, admin_user):
    """Authenticated TestClient with admin user, using the app's real DB setup."""
    app = create_app(enable_lifespan=False)

    def _override_get_db():
        yield db_session

    def _override_get_admin():
        return admin_user

    def _override_get_current():
        return admin_user

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_admin_user] = _override_get_admin
    app.dependency_overrides[get_current_user] = _override_get_current

    with TestClient(app, base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def public_client():
    """Unauthenticated TestClient for public billing endpoint (no auth required)."""
    app = create_app(enable_lifespan=False)

    def _override_get_db():
        import os
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from sqlalchemy.pool import StaticPool
        from app.db.base import sqlite_schema_translate_map
        from app.db import Base

        database_url = os.getenv("TEST_DATABASE_URL", "sqlite:///:memory:")
        is_sqlite = database_url.startswith("sqlite")
        execution_options = {}
        if is_sqlite:
            execution_options["schema_translate_map"] = sqlite_schema_translate_map(database_url)
        engine = create_engine(
            database_url,
            connect_args={"check_same_thread": False} if is_sqlite else {},
            poolclass=StaticPool if database_url == "sqlite:///:memory:" else None,
            execution_options=execution_options,
        )
        Base.metadata.create_all(bind=engine)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        session = SessionLocal()

        try:
            yield session
        finally:
            session.close()
        engine.dispose()

    app.dependency_overrides[get_db] = _override_get_db

    with TestClient(app, base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Test 1: FASTER_WHISPER_ASR_MODEL removed from billing constants
# ---------------------------------------------------------------------------

def test_faster_whisper_removed_from_admin_model_order():
    """Verify FASTER_WHISPER_ASR_MODEL is NOT in ADMIN_BILLING_MODEL_ORDER tuple."""
    assert "faster-whisper-medium" not in ADMIN_BILLING_MODEL_ORDER, (
        f"faster-whisper-medium should not be in ADMIN_BILLING_MODEL_ORDER {ADMIN_BILLING_MODEL_ORDER}"
    )


def test_admin_billing_model_order_count():
    """Verify ADMIN_BILLING_MODEL_ORDER contains correct number of models after cleanup."""
    assert len(ADMIN_BILLING_MODEL_ORDER) == 3, (
        f"ADMIN_BILLING_MODEL_ORDER should have 3 models, got {len(ADMIN_BILLING_MODEL_ORDER)}: {ADMIN_BILLING_MODEL_ORDER}"
    )


def test_public_billing_model_order_count():
    """Verify PUBLIC_BILLING_MODEL_ORDER contains only qwen-asr after cleanup."""
    assert len(PUBLIC_BILLING_MODEL_ORDER) == 1, (
        f"PUBLIC_BILLING_MODEL_ORDER should have 1 model, got {len(PUBLIC_BILLING_MODEL_ORDER)}: {PUBLIC_BILLING_MODEL_ORDER}"
    )


# ---------------------------------------------------------------------------
# Test 2: Faster Whisper settings endpoints removed
# ---------------------------------------------------------------------------

def test_faster_whisper_get_endpoint_removed(client: TestClient):
    """
    Verify GET /api/admin/faster-whisper-settings returns 404.
    This endpoint was deleted in Phase 02.1 Plan 01.
    """
    response = client.get("/api/admin/faster-whisper-settings")
    assert response.status_code == 404, (
        f"GET /api/admin/faster-whisper-settings should return 404, got {response.status_code}"
    )


def test_faster_whisper_history_endpoint_removed(client: TestClient):
    """
    Verify GET /api/admin/faster-whisper-settings/history returns 404.
    This endpoint was deleted in Phase 02.1 Plan 01.
    """
    response = client.get("/api/admin/faster-whisper-settings/history")
    assert response.status_code == 404, (
        f"GET /api/admin/faster-whisper-settings/history should return 404, got {response.status_code}"
    )


def test_faster_whisper_put_endpoint_removed(client: TestClient):
    """
    Verify PUT /api/admin/faster-whisper-settings returns 405 (not 404).
    FastAPI returns 405 because the path partially matches subtitle-settings routes
    (/api/admin/subtitle-settings) which exist. The method (PUT) is not allowed on
    the partial path match, confirming faster-whisper-settings routes are gone.
    """
    response = client.put("/api/admin/faster-whisper-settings", json={})
    assert response.status_code == 405, (
        f"PUT /api/admin/faster-whisper-settings should return 405, got {response.status_code}"
    )


def test_faster_whisper_rollback_endpoint_removed(client: TestClient):
    """
    Verify POST /api/admin/faster-whisper-settings/rollback returns 405 (not 404).
    FastAPI returns 405 because the path partially matches subtitle-settings routes.
    This confirms faster-whisper-settings routes are gone.
    """
    response = client.post("/api/admin/faster-whisper-settings/rollback")
    assert response.status_code == 405, (
        f"POST /api/admin/faster-whisper-settings/rollback should return 405, got {response.status_code}"
    )


# ---------------------------------------------------------------------------
# Test 3: Billing rates endpoints work without faster-whisper
# ---------------------------------------------------------------------------

def test_admin_billing_rates_no_faster_whisper(client: TestClient):
    """
    Verify GET /api/admin/billing-rates does not contain faster-whisper-medium.
    """
    response = client.get("/api/admin/billing-rates")
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"

    data = response.json()
    assert data.get("ok") is True, f"Response ok should be True: {data}"

    rates = data.get("rates", [])
    model_names = {rate.get("model_name") for rate in rates}

    assert "faster-whisper-medium" not in model_names, (
        f"faster-whisper-medium should NOT be in /api/admin/billing-rates response. "
        f"Got models: {model_names}"
    )


def test_admin_billing_rates_count(client: TestClient):
    """Verify /api/admin/billing-rates returns correct number of rates."""
    response = client.get("/api/admin/billing-rates")
    assert response.status_code == 200

    rates = response.json().get("rates", [])
    assert len(rates) == 3, f"Expected 3 billing rates, got {len(rates)}: {[r.get('model_name') for r in rates]}"


def test_admin_billing_rates_response_omits_runtime_tuning_fields(client: TestClient):
    response = client.get("/api/admin/billing-rates")
    assert response.status_code == 200

    first_rate = response.json()["rates"][0]
    assert "parallel_enabled" not in first_rate
    assert "parallel_threshold_seconds" not in first_rate
    assert "segment_seconds" not in first_rate
    assert "max_concurrency" not in first_rate


def test_public_billing_rates_no_faster_whisper(public_client: TestClient):
    """
    Verify GET /api/billing/rates does not contain faster-whisper-medium.
    """
    response = public_client.get("/api/billing/rates")
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"

    data = response.json()
    assert data.get("ok") is True, f"Response ok should be True: {data}"

    rates = data.get("rates", [])
    model_names = {rate.get("model_name") for rate in rates}

    assert "faster-whisper-medium" not in model_names, (
        f"faster-whisper-medium should NOT be in /api/billing/rates response. "
        f"Got models: {model_names}"
    )


def test_public_billing_rates_count(public_client: TestClient):
    """Verify /api/billing/rates returns only 1 model rate after cleanup."""
    response = public_client.get("/api/billing/rates")
    assert response.status_code == 200

    rates = response.json().get("rates", [])
    assert len(rates) == 1, f"Expected 1 billing rate, got {len(rates)}: {[r.get('model_name') for r in rates]}"
