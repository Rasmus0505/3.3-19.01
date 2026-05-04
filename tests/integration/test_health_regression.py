from __future__ import annotations

import pytest

from fastapi.testclient import TestClient

from .conftest import _register_and_login
from ._regression_helpers import (
    frontend_build_marker_from_index as _frontend_build_marker_from_index,
)


def test_health_endpoint(test_client):
    client, _, _ = test_client
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["service"]


def test_health_ready_endpoint(test_client, monkeypatch):
    from app import main as app_main

    monkeypatch.setattr(app_main, "_probe_database_ready", lambda: (True, ""))
    monkeypatch.setattr(
        app_main,
        "_refresh_optional_runtime_status",
        lambda app: (
            setattr(app_main._ensure_runtime_status(app), "dashscope_configured", True),
            setattr(app_main._ensure_runtime_status(app), "ffmpeg_ready", True),
            setattr(app_main._ensure_runtime_status(app), "ffprobe_ready", True),
            setattr(app_main._ensure_runtime_status(app), "upload_asr_ready", True),
            setattr(app_main._ensure_runtime_status(app), "upload_asr_detail", "ready upload ASR models: Qwen ASR Flash"),
        ),
    )
    client, _, _ = test_client
    resp = client.get("/health/ready")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["status"]["db_ready"] is True


def test_probe_database_ready_does_not_open_session_for_schema_checks(monkeypatch):
    from app import main as app_main

    class DummyConnection:
        def execute(self, _sql):
            return None

    class DummyEngineConnection:
        def __enter__(self):
            return DummyConnection()

        def __exit__(self, exc_type, exc, tb):
            return False

    class DummyEngine:
        def connect(self):
            return DummyEngineConnection()

    class DummyInspector:
        def has_table(self, table_name, schema=None):
            return table_name == "billing_model_rates"

        def get_columns(self, table_name, schema=None):
            if table_name != "billing_model_rates":
                return []
            required = app_main.READINESS_REQUIRED_COLUMNS["billing_model_rates"]
            return [{"name": name} for name in required]

    monkeypatch.setattr(app_main, "engine", DummyEngine())
    monkeypatch.setattr(app_main, "inspect", lambda _connection: DummyInspector())
    monkeypatch.setattr(app_main, "BUSINESS_TABLES", ("billing_model_rates",))
    monkeypatch.setattr(
        app_main,
        "SessionLocal",
        lambda: (_ for _ in ()).throw(AssertionError("SessionLocal should not be used during readiness schema checks")),
    )

    ready, error = app_main._probe_database_ready()

    assert ready is True
    assert error == ""


def test_startup_without_dashscope_key_keeps_health_alive(monkeypatch, tmp_path):
    from app import main as app_main

    tmp_base = tmp_path / "startup"
    prefetch_called = {"count": 0}
    bundle_summary_called = {"count": 0}
    monkeypatch.setattr(app_main, "BASE_TMP_DIR", tmp_base)
    monkeypatch.setattr(app_main, "BASE_DATA_DIR", tmp_base / "data")
    monkeypatch.setattr(app_main, "DASHSCOPE_API_KEY", "")
    monkeypatch.setattr(app_main, "_refresh_optional_runtime_status", lambda _app: None)
    monkeypatch.setattr(
        app_main,
        "get_downloadable_model_bundle_summaries",
        lambda: bundle_summary_called.__setitem__("count", bundle_summary_called["count"] + 1) or [],
    )
    monkeypatch.setattr(
        app_main,
        "schedule_local_asr_asset_prefetch",
        lambda: prefetch_called.__setitem__("count", prefetch_called["count"] + 1) or True,
    )

    async def fake_bootstrap(app):
        runtime_status = app_main._ensure_runtime_status(app)
        runtime_status.db_ready = True
        runtime_status.checked_at = "2026-03-06T00:00:00+00:00"

    monkeypatch.setattr(app_main, "_bootstrap_runtime_state", fake_bootstrap)

    app = app_main.create_app(enable_lifespan=True)
    with TestClient(app) as client:
        resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert resp.json()["ready"] is False
    assert bundle_summary_called["count"] == 1
    assert prefetch_called["count"] == 1


def test_health_ready_returns_503_when_database_unavailable(monkeypatch):
    from app import main as app_main

    monkeypatch.setattr(app_main, "_probe_database_ready", lambda: (False, "db offline"))
    monkeypatch.setattr(
        app_main,
        "_refresh_optional_runtime_status",
        lambda app: (
            setattr(app_main._ensure_runtime_status(app), "dashscope_configured", True),
            setattr(app_main._ensure_runtime_status(app), "ffmpeg_ready", True),
            setattr(app_main._ensure_runtime_status(app), "ffprobe_ready", True),
            setattr(app_main._ensure_runtime_status(app), "upload_asr_ready", True),
            setattr(app_main._ensure_runtime_status(app), "upload_asr_detail", "ready upload ASR models: Qwen ASR Flash"),
        ),
    )

    app = app_main.create_app(enable_lifespan=False)
    with TestClient(app) as client:
        health = client.get("/health")
        ready = client.get("/health/ready")

    assert health.status_code == 200
    assert health.json()["ok"] is True
    assert ready.status_code == 503
    payload = ready.json()
    assert payload["ok"] is False
    assert payload["status"]["db_ready"] is False


def test_health_ready_returns_503_when_dashscope_is_missing(monkeypatch):
    from app import main as app_main

    monkeypatch.setattr(app_main, "_probe_database_ready", lambda: (True, ""))

    def fake_refresh(app):
        runtime_status = app_main._ensure_runtime_status(app)
        runtime_status.dashscope_configured = False
        runtime_status.ffmpeg_ready = True
        runtime_status.ffprobe_ready = True
        runtime_status.media_detail = ""
        runtime_status.upload_asr_ready = False
        runtime_status.upload_asr_detail = "no upload-capable ASR model is ready"

    monkeypatch.setattr(app_main, "_refresh_optional_runtime_status", fake_refresh)

    app = app_main.create_app(enable_lifespan=False)
    with TestClient(app) as client:
        resp = client.get("/health/ready")

    assert resp.status_code == 503
    payload = resp.json()
    assert payload["ok"] is False
    assert payload["status"]["db_ready"] is True
    assert payload["status"]["dashscope_configured"] is False
    assert "DASHSCOPE_API_KEY is not configured" in payload["status"]["readiness_issues"]


def test_auth_register_returns_db_migration_required_when_runtime_not_ready(test_client):
    from app.main import RuntimeStatus

    client, _, _ = test_client
    client.app.state.runtime_status = RuntimeStatus(
        db_ready=False,
        db_error="missing critical columns: users.is_admin",
        checked_at="2026-03-21T00:00:00+00:00",
    )

    resp = client.post("/api/auth/register", json={"email": "blocked@example.com", "password": "123456"})

    assert resp.status_code == 503
    payload = resp.json()
    assert payload["error_code"] == "DB_MIGRATION_REQUIRED"
    assert "users.is_admin" in str(payload["detail"])


def test_spa_shell_pages_disable_html_cache_and_expose_build_marker(test_client):
    client, _, _ = test_client
    build_marker = _frontend_build_marker_from_index()

    for path in ("/", "/admin", "/admin/users"):
        resp = client.get(path)
        assert resp.status_code == 200
        assert "no-store" in resp.headers["cache-control"].lower()
        assert resp.headers["pragma"] == "no-cache"
        assert resp.headers["expires"] == "0"
        assert resp.headers["x-frontend-build"] == build_marker


def test_static_assets_keep_cache_behavior_unmodified(test_client):
    client, _, _ = test_client
    build_marker = _frontend_build_marker_from_index()

    resp = client.get(f"/static/assets/{build_marker}")
    assert resp.status_code == 200
    assert "no-store" not in resp.headers.get("cache-control", "").lower()
    assert "x-frontend-build" not in resp.headers


def test_favicon_request_no_longer_returns_404(test_client):
    client, _, _ = test_client
    resp = client.get("/favicon.ico")
    assert resp.status_code in {200, 204}


def test_probe_database_ready_reports_missing_critical_columns(monkeypatch):
    from app import main as app_main

    class DummyConnection:
        def execute(self, _sql):
            return None

    class DummyEngineConnection:
        def __enter__(self):
            return DummyConnection()

        def __exit__(self, exc_type, exc, tb):
            return False

    class DummyEngine:
        def connect(self):
            return DummyEngineConnection()

    class DummyInspector:
        def has_table(self, table_name, schema=None):
            return table_name == "billing_model_rates"

        def get_columns(self, table_name, schema=None):
            if table_name != "billing_model_rates":
                return []
            return [
                {"name": "model_name"},
                {"name": "points_per_minute"},
                {"name": "points_per_1k_tokens"},
                {"name": "is_active"},
                {"name": "updated_at"},
                {"name": "updated_by_user_id"},
            ]

    monkeypatch.setattr(app_main, "schema_name_for_url", lambda _url: "app")
    monkeypatch.setattr(app_main, "engine", DummyEngine())
    monkeypatch.setattr(app_main, "inspect", lambda _conn: DummyInspector())
    monkeypatch.setattr(app_main, "BUSINESS_TABLES", ("billing_model_rates",))

    ready, error = app_main._probe_database_ready()
    assert ready is False
    assert error.startswith("missing critical columns:")
    assert "billing_model_rates.billing_unit" in error
    assert "billing_model_rates.price_per_minute_yuan" in error
    assert "billing_model_rates.cost_per_minute_yuan" in error


def test_probe_database_ready_reports_missing_subtitle_settings_table(monkeypatch):
    from app import main as app_main

    class DummyConnection:
        def execute(self, _sql):
            return None

    class DummyEngineConnection:
        def __enter__(self):
            return DummyConnection()

        def __exit__(self, exc_type, exc, tb):
            return False

    class DummyEngine:
        def connect(self):
            return DummyEngineConnection()

    class DummyInspector:
        def has_table(self, table_name, schema=None):
            return table_name == "billing_model_rates"

        def get_columns(self, table_name, schema=None):
            if table_name != "billing_model_rates":
                return []
            return [
                {"name": "model_name"},
                {"name": "points_per_minute"},
                {"name": "points_per_1k_tokens"},
                {"name": "billing_unit"},
                {"name": "cost_per_minute_cents"},
                {"name": "price_per_minute_yuan"},
                {"name": "cost_per_minute_yuan"},
                {"name": "is_active"},
                {"name": "parallel_enabled"},
                {"name": "parallel_threshold_seconds"},
                {"name": "segment_seconds"},
                {"name": "max_concurrency"},
                {"name": "updated_at"},
                {"name": "updated_by_user_id"},
            ]

    monkeypatch.setattr(app_main, "schema_name_for_url", lambda _url: "app")
    monkeypatch.setattr(app_main, "engine", DummyEngine())
    monkeypatch.setattr(app_main, "inspect", lambda _conn: DummyInspector())
    monkeypatch.setattr(app_main, "BUSINESS_TABLES", ("billing_model_rates", "subtitle_settings"))

    ready, error = app_main._probe_database_ready()
    assert ready is False
    assert error == "missing business tables: subtitle_settings"


def test_probe_database_ready_no_longer_requires_learning_stats_table(monkeypatch):
    from app import main as app_main

    class DummyConnection:
        def execute(self, _sql):
            return None

    class DummyEngineConnection:
        def __enter__(self):
            return DummyConnection()

        def __exit__(self, exc_type, exc, tb):
            return False

    class DummyEngine:
        def connect(self):
            return DummyEngineConnection()

    class DummyInspector:
        def has_table(self, table_name, schema=None):
            return table_name in {"billing_model_rates", "subtitle_settings"}

        def get_columns(self, table_name, schema=None):
            if table_name == "billing_model_rates":
                return [
                    {"name": "model_name"},
                    {"name": "points_per_minute"},
                    {"name": "points_per_1k_tokens"},
                    {"name": "billing_unit"},
                    {"name": "cost_per_minute_cents"},
                    {"name": "price_per_minute_yuan"},
                    {"name": "cost_per_minute_yuan"},
                    {"name": "is_active"},
                    {"name": "parallel_enabled"},
                    {"name": "parallel_threshold_seconds"},
                    {"name": "segment_seconds"},
                    {"name": "max_concurrency"},
                    {"name": "updated_at"},
                    {"name": "updated_by_user_id"},
                ]
            if table_name == "subtitle_settings":
                return [
                    {"name": "id"},
                    {"name": "semantic_split_default_enabled"},
                    {"name": "default_asr_model"},
                    {"name": "subtitle_split_enabled"},
                    {"name": "subtitle_split_target_words"},
                    {"name": "subtitle_split_max_words"},
                    {"name": "semantic_split_max_words_threshold"},
                    {"name": "semantic_split_timeout_seconds"},
                    {"name": "translation_batch_max_chars"},
                    {"name": "updated_at"},
                    {"name": "updated_by_user_id"},
                ]
            return []

    monkeypatch.setattr(app_main, "schema_name_for_url", lambda _url: "app")
    monkeypatch.setattr(app_main, "engine", DummyEngine())
    monkeypatch.setattr(app_main, "inspect", lambda _conn: DummyInspector())
    monkeypatch.setattr(app_main, "BUSINESS_TABLES", ("billing_model_rates", "subtitle_settings"))

    ready, error = app_main._probe_database_ready()
    assert ready is True
    assert error == ""


def test_auth_register_and_login(test_client):
    client, _, _ = test_client
    token = _register_and_login(client, email="user1@example.com")
    assert token
