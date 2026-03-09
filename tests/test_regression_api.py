from __future__ import annotations

import io
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from app.api.deps.auth import get_admin_user
from app.db import Base, create_database_engine, get_db
from app.main import create_app
from app.models import BillingModelRate, Lesson, LessonProgress, LessonSentence, MediaAsset, SubtitleSetting, TranslationRequestLog, User, WalletLedger
from app.services.billing_service import ensure_default_billing_rates, get_or_create_wallet_account, get_subtitle_settings, settle_reserved_points
from app.services.lesson_service import LessonService
from app.services.lesson_builder import normalize_learning_english_text, tokenize_learning_sentence

QWEN_ASR_MODEL = "qwen3-asr-flash-filetrans"


def _frontend_build_marker_from_index() -> str:
    html = (Path(__file__).resolve().parents[1] / "app" / "static" / "index.html").read_text(encoding="utf-8")
    match = re.search(r'/static/assets/([^"\']+)', html)
    assert match
    return str(match.group(1))


def _word_entry(text: str, begin_ms: int, end_ms: int, *, punctuation: str = "", surface: str | None = None) -> dict[str, object]:
    return {
        "text": text,
        "surface": surface or (f"{text}{punctuation}" if punctuation else text),
        "punctuation": punctuation,
        "begin_time": begin_ms,
        "end_time": end_ms,
    }


def _translation_batch_result(texts: list[str], *, failed_count: int = 0, total_tokens: int = 0, latest_error_summary: str = ""):
    success_count = max(0, len(texts) - failed_count)
    return SimpleNamespace(
        texts=list(texts),
        failed_count=failed_count,
        attempt_records=[],
        total_requests=len(texts),
        success_request_count=success_count,
        success_prompt_tokens=0,
        success_completion_tokens=0,
        success_total_tokens=total_tokens,
        latest_error_summary=latest_error_summary,
    )


def test_normalize_learning_english_text_spells_usd_amounts():
    assert normalize_learning_english_text("$40?") == "forty dollars?"
    assert normalize_learning_english_text("It is $1.") == "It is one dollar."
    assert normalize_learning_english_text("$0.50") == "fifty cents"
    assert normalize_learning_english_text("We spent $40.50 today.") == "We spent forty dollars and fifty cents today."
    assert normalize_learning_english_text("Room 40") == "Room 40"
    assert normalize_learning_english_text("$FOO") == "$FOO"
    assert tokenize_learning_sentence("$40?") == ["forty", "dollars"]


@pytest.fixture()
def test_client(tmp_path, monkeypatch):
    db_file = tmp_path / "test_app.db"
    engine = create_database_engine(f"sqlite:///{db_file}")
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, future=True)

    Base.metadata.create_all(bind=engine)

    seed = TestingSessionLocal()
    try:
        ensure_default_billing_rates(seed)
    finally:
        seed.close()

    app = create_app(enable_lifespan=False)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as client:
        yield client, TestingSessionLocal, monkeypatch


def test_ensure_default_billing_rates_rebuilds_legacy_sqlite_constraint(tmp_path):
    db_file = tmp_path / "legacy_billing.db"
    engine = create_database_engine(f"sqlite:///{db_file}")
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, future=True)
    User.__table__.create(bind=engine, checkfirst=True)

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE billing_model_rates (
                    model_name VARCHAR(100) NOT NULL PRIMARY KEY,
                    points_per_minute INTEGER NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_by_user_id INTEGER,
                    CONSTRAINT ck_billing_rate_positive CHECK (points_per_minute > 0)
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO billing_model_rates (model_name, points_per_minute, is_active, updated_at)
                VALUES ('qwen3-asr-flash-filetrans', 130, 1, CURRENT_TIMESTAMP)
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE wallet_ledger (
                    id INTEGER NOT NULL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    operator_user_id INTEGER,
                    event_type VARCHAR(32) NOT NULL,
                    delta_points BIGINT NOT NULL,
                    balance_after BIGINT NOT NULL,
                    model_name VARCHAR(100),
                    duration_ms INTEGER,
                    lesson_id INTEGER,
                    note TEXT NOT NULL DEFAULT '',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT ck_wallet_ledger_event_type CHECK (event_type IN ('reserve','consume','refund','manual_adjust'))
                )
                """
            )
        )

    seed = TestingSessionLocal()
    try:
        ensure_default_billing_rates(seed)
    finally:
        seed.close()

    with engine.connect() as conn:
        ddl = str(
            conn.execute(
                text("SELECT sql FROM sqlite_master WHERE type='table' AND name='billing_model_rates'")
            ).scalar()
            or ""
        ).lower()
        wallet_ddl = str(
            conn.execute(
                text("SELECT sql FROM sqlite_master WHERE type='table' AND name='wallet_ledger'")
            ).scalar()
            or ""
        ).lower()
        mt_rate = conn.execute(
            text(
                """
                SELECT model_name, points_per_minute, points_per_1k_tokens, billing_unit
                FROM billing_model_rates
                WHERE model_name = 'qwen-mt-plus'
                """
            )
        ).mappings().one()

    assert "points_per_minute > 0" not in ddl
    assert "points_per_minute >= 0" in ddl
    assert "ck_billing_rate_token_non_negative" in ddl
    assert "consume_translate" in wallet_ddl
    assert "refund_translate" in wallet_ddl
    assert mt_rate["model_name"] == "qwen-mt-plus"
    assert mt_rate["points_per_minute"] == 0
    assert mt_rate["points_per_1k_tokens"] > 0
    assert mt_rate["billing_unit"] == "1k_tokens"


def _register_and_login(client: TestClient, email: str = "admin@example.com", password: str = "123456") -> str:
    reg = client.post("/api/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 200
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    return login.json()["access_token"]


def test_health_endpoint(test_client):
    client, _, _ = test_client
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["service"]


def test_health_ready_endpoint(test_client):
    client, _, _ = test_client
    resp = client.get("/health/ready")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["status"]["db_ready"] is True


def test_startup_without_dashscope_key_keeps_health_alive(monkeypatch, tmp_path):
    from app import main as app_main

    tmp_base = tmp_path / "startup"
    monkeypatch.setattr(app_main, "BASE_TMP_DIR", tmp_base)
    monkeypatch.setattr(app_main, "BASE_DATA_DIR", tmp_base / "data")
    monkeypatch.setattr(app_main, "DASHSCOPE_API_KEY", "")
    monkeypatch.setattr(app_main, "_refresh_optional_runtime_status", lambda _app: None)

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
    assert resp.json()["ready"] is True


def test_health_ready_returns_503_when_database_unavailable(monkeypatch):
    from app import main as app_main

    monkeypatch.setattr(app_main, "_probe_database_ready", lambda: (False, "db offline"))

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


def test_admin_billing_rates_endpoint_handles_legacy_schema_defaults(tmp_path):
    db_file = tmp_path / "legacy_admin_rates.db"
    engine = create_database_engine(f"sqlite:///{db_file}")
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, future=True)

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE billing_model_rates (
                    model_name VARCHAR(100) NOT NULL PRIMARY KEY,
                    points_per_minute INTEGER NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_by_user_id INTEGER
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO billing_model_rates (model_name, points_per_minute, is_active, updated_at)
                VALUES ('qwen3-asr-flash-filetrans', 130, 1, CURRENT_TIMESTAMP)
                """
            )
        )

    app = create_app(enable_lifespan=False)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_admin_user] = lambda: SimpleNamespace(id=1, email="admin@example.com")

    with TestClient(app) as client:
        resp = client.get("/api/admin/billing-rates")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["rates"][0]["points_per_1k_tokens"] == 0
    assert payload["rates"][0]["billing_unit"] == "minute"
    assert payload["rates"][0]["parallel_enabled"] is False


def test_admin_translation_logs_endpoint_returns_empty_when_table_missing(tmp_path):
    db_file = tmp_path / "legacy_translation_logs.db"
    engine = create_database_engine(f"sqlite:///{db_file}")
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, future=True)

    User.__table__.create(bind=engine, checkfirst=True)

    app = create_app(enable_lifespan=False)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_admin_user] = lambda: SimpleNamespace(id=1, email="admin@example.com")

    with TestClient(app) as client:
        resp = client.get("/api/admin/translation-logs")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["total"] == 0
    assert payload["items"] == []


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

    monkeypatch.setattr(app_main, "init_db", lambda: None)
    monkeypatch.setattr(app_main, "schema_name_for_url", lambda _url: "app")
    monkeypatch.setattr(app_main, "engine", DummyEngine())
    monkeypatch.setattr(app_main, "inspect", lambda _conn: DummyInspector())
    monkeypatch.setattr(app_main, "BUSINESS_TABLES", ("billing_model_rates",))

    ready, error = app_main._probe_database_ready()
    assert ready is False
    assert error.startswith("missing critical columns:")
    assert "billing_model_rates.billing_unit" in error


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
                {"name": "is_active"},
                {"name": "parallel_enabled"},
                {"name": "parallel_threshold_seconds"},
                {"name": "segment_seconds"},
                {"name": "max_concurrency"},
                {"name": "updated_at"},
                {"name": "updated_by_user_id"},
            ]

    monkeypatch.setattr(app_main, "init_db", lambda: None)
    monkeypatch.setattr(app_main, "schema_name_for_url", lambda _url: "app")
    monkeypatch.setattr(app_main, "engine", DummyEngine())
    monkeypatch.setattr(app_main, "inspect", lambda _conn: DummyInspector())
    monkeypatch.setattr(app_main, "BUSINESS_TABLES", ("billing_model_rates", "subtitle_settings"))

    ready, error = app_main._probe_database_ready()
    assert ready is False
    assert error == "missing business tables: subtitle_settings"


def test_transcribe_audio_requires_dashscope_api_key(monkeypatch, tmp_path):
    from app.infra import asr_dashscope

    audio_file = tmp_path / "sample.opus"
    audio_file.write_bytes(b"dummy")
    monkeypatch.setattr(asr_dashscope.dashscope, "api_key", "", raising=False)
    with pytest.raises(asr_dashscope.AsrError) as exc:
        asr_dashscope.transcribe_audio_file(str(audio_file), model=asr_dashscope.DEFAULT_MODEL)
    assert exc.value.code == "ASR_API_KEY_MISSING"


def test_transcribe_file_endpoint_with_stubbed_service(test_client, monkeypatch, tmp_path):
    client, _, _ = test_client
    from app.api.routers import transcribe as transcribe_router

    monkeypatch.setattr(transcribe_router, "BASE_TMP_DIR", tmp_path)

    def fake_transcribe_uploaded_file(upload_file, req_dir, model):
        return {
            "model": model,
            "task_id": "task_stub_001",
            "task_status": "SUCCEEDED",
            "transcription_url": "https://example.com/result.json",
            "preview_text": "hello world",
            "asr_result_json": {"sentences": [{"text": "hello world"}]},
        }

    monkeypatch.setattr(transcribe_router, "transcribe_uploaded_file", fake_transcribe_uploaded_file)

    files = {"video_file": ("demo.mp4", io.BytesIO(b"dummy"), "video/mp4")}
    resp = client.post("/api/transcribe/file", files=files, data={"model": QWEN_ASR_MODEL})
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["task_status"] == "SUCCEEDED"
    assert body["source_type"] == "file"
    assert body["model"] == QWEN_ASR_MODEL


def test_create_lesson_rejects_para_model(test_client):
    client, _, _ = test_client
    token = _register_and_login(client, email="reject-model@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.post(
        "/api/lessons",
        headers=headers,
        files={"video_file": ("demo.mp4", io.BytesIO(b"dummy"), "video/mp4")},
        data={"asr_model": "paraformer-v2"},
    )
    assert resp.status_code == 400
    data = resp.json()
    assert data["error_code"] == "INVALID_MODEL"
    assert "supported_models" in data.get("detail", {})
    assert data["detail"]["supported_models"] == [QWEN_ASR_MODEL]


def test_auth_register_and_login(test_client):
    client, _, _ = test_client
    token = _register_and_login(client, email="user1@example.com")
    assert token


def test_wallet_and_admin_endpoints(test_client):
    client, _, monkeypatch = test_client
    token = _register_and_login(client, email="admin@example.com")
    monkeypatch.setenv("ADMIN_EMAILS", "admin@example.com")

    headers = {"Authorization": f"Bearer {token}"}

    wallet = client.get("/api/wallet/me", headers=headers)
    assert wallet.status_code == 200
    assert "balance_points" in wallet.json()

    rates = client.get("/api/admin/billing-rates", headers=headers)
    assert rates.status_code == 200
    assert isinstance(rates.json().get("rates"), list)
    assert any("points_per_1k_tokens" in item and "billing_unit" in item for item in rates.json().get("rates", []))

    users = client.get("/api/admin/users", headers=headers)
    assert users.status_code == 200
    assert "items" in users.json()

    logs = client.get("/api/admin/wallet-logs", headers=headers)
    assert logs.status_code == 200
    assert "items" in logs.json()

    translation_logs = client.get("/api/admin/translation-logs", headers=headers)
    assert translation_logs.status_code == 200
    assert "items" in translation_logs.json()

    public_rates = client.get("/api/billing/rates", headers=headers)
    assert public_rates.status_code == 200
    assert "subtitle_settings" in public_rates.json()
    assert public_rates.json()["subtitle_settings"]["semantic_split_default_enabled"] is False
    assert any("points_per_1k_tokens" in item and "billing_unit" in item for item in public_rates.json()["rates"])

    subtitle_settings = client.get("/api/admin/subtitle-settings", headers=headers)
    assert subtitle_settings.status_code == 200
    assert subtitle_settings.json()["settings"]["subtitle_split_enabled"] is True


def test_admin_subtitle_settings_roundtrip(test_client):
    client, _, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "subtitle-admin@example.com")
    admin_token = _register_and_login(client, email="subtitle-admin@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    update_resp = client.put(
        "/api/admin/subtitle-settings",
        headers=admin_headers,
        json={
            "semantic_split_default_enabled": True,
            "subtitle_split_enabled": True,
            "subtitle_split_target_words": 16,
            "subtitle_split_max_words": 26,
            "semantic_split_max_words_threshold": 20,
            "semantic_split_model": "qwen-plus",
            "semantic_split_timeout_seconds": 35,
        },
    )
    assert update_resp.status_code == 200
    payload = update_resp.json()["settings"]
    assert payload["semantic_split_default_enabled"] is True
    assert payload["subtitle_split_target_words"] == 16
    assert payload["semantic_split_max_words_threshold"] == 20

    fetch_resp = client.get("/api/admin/subtitle-settings", headers=admin_headers)
    assert fetch_resp.status_code == 200
    assert fetch_resp.json()["settings"]["semantic_split_timeout_seconds"] == 35


def test_admin_translation_logs_endpoint_filters_by_task_and_success(test_client, monkeypatch):
    client, session_factory, _ = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "translation-admin@example.com")
    admin_token = _register_and_login(client, email="translation-admin@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "translation-admin@example.com").one()
        session.add_all(
            [
                TranslationRequestLog(
                    trace_id="trace-a",
                    task_id="task-demo",
                    lesson_id=None,
                    user_id=user.id,
                    sentence_idx=0,
                    attempt_no=1,
                    provider="dashscope_compatible",
                    model_name="qwen-mt-plus",
                    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
                    input_text_preview="hello world",
                    provider_request_id="req_success",
                    status_code=200,
                    finish_reason="stop",
                    prompt_tokens=10,
                    completion_tokens=4,
                    total_tokens=14,
                    success=True,
                    error_code=None,
                    error_message="",
                    started_at=datetime.utcnow(),
                    finished_at=datetime.utcnow(),
                    created_at=datetime.utcnow(),
                ),
                TranslationRequestLog(
                    trace_id="trace-b",
                    task_id="task-other",
                    lesson_id=None,
                    user_id=user.id,
                    sentence_idx=1,
                    attempt_no=1,
                    provider="dashscope_compatible",
                    model_name="qwen-mt-plus",
                    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
                    input_text_preview="second line",
                    provider_request_id="req_failed",
                    status_code=429,
                    finish_reason=None,
                    prompt_tokens=0,
                    completion_tokens=0,
                    total_tokens=0,
                    success=False,
                    error_code="REQUEST_FAILED",
                    error_message="rate limit",
                    started_at=datetime.utcnow(),
                    finished_at=datetime.utcnow(),
                    created_at=datetime.utcnow(),
                ),
            ]
        )
        session.commit()
    finally:
        session.close()

    resp = client.get(
        "/api/admin/translation-logs",
        params={"task_id": "task-demo", "success": "success"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["total"] == 1
    assert payload["items"][0]["task_id"] == "task-demo"
    assert payload["items"][0]["success"] is True


def test_public_billing_rates_self_heals_missing_subtitle_settings_table(test_client):
    client, session_factory, _ = test_client

    session = session_factory()
    try:
        session.execute(text("DROP TABLE subtitle_settings"))
        session.commit()
    finally:
        session.close()

    resp = client.get("/api/billing/rates")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["subtitle_settings"]["semantic_split_default_enabled"] is False

    verify = session_factory()
    try:
        row = get_subtitle_settings(verify)
        assert isinstance(row, SubtitleSetting)
        assert row.id == 1
    finally:
        verify.close()


def test_admin_subtitle_settings_update_self_heals_missing_table(test_client):
    client, session_factory, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "self-heal-admin@example.com")
    admin_token = _register_and_login(client, email="self-heal-admin@example.com")
    headers = {"Authorization": f"Bearer {admin_token}"}

    session = session_factory()
    try:
        session.execute(text("DROP TABLE subtitle_settings"))
        session.commit()
    finally:
        session.close()

    resp = client.put(
        "/api/admin/subtitle-settings",
        headers=headers,
        json={
            "semantic_split_default_enabled": True,
            "subtitle_split_enabled": True,
            "subtitle_split_target_words": 17,
            "subtitle_split_max_words": 29,
            "semantic_split_max_words_threshold": 21,
            "semantic_split_model": "qwen-plus",
            "semantic_split_timeout_seconds": 50,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["settings"]["semantic_split_default_enabled"] is True
    assert body["settings"]["semantic_split_timeout_seconds"] == 50


def test_redeem_code_admin_and_wallet_flow(test_client):
    client, _, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "redeem-admin@example.com")

    user_token = _register_and_login(client, email="redeem-user@example.com")
    admin_token = _register_and_login(client, email="redeem-admin@example.com")
    user_headers = {"Authorization": f"Bearer {user_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    now = datetime.utcnow()
    batch_resp = client.post(
        "/api/admin/redeem-batches",
        headers=admin_headers,
        json={
            "batch_name": "regression_batch",
            "face_value_points": 66,
            "generate_quantity": 2,
            "active_from": now.isoformat(),
            "expire_at": (now + timedelta(days=2)).isoformat(),
            "daily_limit_per_user": 1,
            "remark": "regression",
        },
    )
    assert batch_resp.status_code == 200
    batch_data = batch_resp.json()
    assert batch_data["batch"]["generated_count"] == 2
    generated_codes = batch_data["generated_codes"]
    assert len(generated_codes) == 2

    wallet_before = client.get("/api/wallet/me", headers=user_headers)
    assert wallet_before.status_code == 200
    before_points = wallet_before.json()["balance_points"]

    redeem_ok = client.post("/api/wallet/redeem-code", headers=user_headers, json={"code": generated_codes[0]})
    assert redeem_ok.status_code == 200
    assert redeem_ok.json()["redeemed_points"] == 66
    assert redeem_ok.json()["balance_points"] == before_points + 66

    redeem_used = client.post("/api/wallet/redeem-code", headers=user_headers, json={"code": generated_codes[0]})
    assert redeem_used.status_code == 400
    assert redeem_used.json()["error_code"] == "REDEEM_CODE_ALREADY_USED"

    redeem_limit = client.post("/api/wallet/redeem-code", headers=user_headers, json={"code": generated_codes[1]})
    assert redeem_limit.status_code == 400
    assert redeem_limit.json()["error_code"] == "REDEEM_CODE_DAILY_LIMIT_EXCEEDED"

    logs = client.get(
        "/api/admin/wallet-logs",
        headers=admin_headers,
        params={"user_email": "redeem-user@example.com", "event_type": "redeem_code"},
    )
    assert logs.status_code == 200
    assert logs.json()["total"] >= 1
    assert any(item["event_type"] == "redeem_code" for item in logs.json()["items"])

    audit = client.get("/api/admin/redeem-audit", headers=admin_headers, params={"user_email": "redeem-user@example.com"})
    assert audit.status_code == 200
    assert audit.json()["total"] >= 3
    assert any(item["success"] is True for item in audit.json()["items"])
    assert any(item["success"] is False for item in audit.json()["items"])

    forbidden = client.post(
        "/api/admin/redeem-batches",
        headers=user_headers,
        json={
            "batch_name": "forbidden",
            "face_value_points": 50,
            "generate_quantity": 1,
        },
    )
    assert forbidden.status_code == 403


def test_lessons_progress_and_check(test_client):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="learner@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "learner@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="demo",
            source_filename="demo.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            duration_ms=10000,
            media_storage="server",
            source_duration_ms=10000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        session.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=1000,
                text_en="hello world",
                text_zh="你好 世界",
                tokens_json=["hello", "world"],
                audio_clip_path="/tmp/not_exists.opus",
            )
        )
        session.add(
            LessonProgress(
                lesson_id=lesson.id,
                user_id=user.id,
                current_sentence_idx=0,
                completed_indexes_json=[],
                last_played_at_ms=0,
            )
        )
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    get_progress = client.get(f"/api/lessons/{lesson_id}/progress", headers=headers)
    assert get_progress.status_code == 200

    update_progress = client.post(
        f"/api/lessons/{lesson_id}/progress",
        headers=headers,
        json={"current_sentence_index": 0, "completed_sentence_indexes": [0], "last_played_at_ms": 500},
    )
    assert update_progress.status_code == 200

    check = client.post(
        f"/api/lessons/{lesson_id}/check",
        headers=headers,
        json={"sentence_index": 0, "user_tokens": ["hello", "world"]},
    )
    assert check.status_code == 200
    assert check.json()["passed"] is True


def test_legacy_lesson_detail_and_check_spell_usd_amounts(test_client):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="legacy-money@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "legacy-money@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="legacy money",
            source_filename="legacy_money.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=1000,
            media_storage="client_indexeddb",
            source_duration_ms=1000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        session.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=1000,
                text_en="$40?",
                text_zh="40美元？",
                tokens_json=["$40"],
                audio_clip_path=None,
            )
        )
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    detail_resp = client.get(f"/api/lessons/{lesson_id}", headers=headers)
    assert detail_resp.status_code == 200
    detail_data = detail_resp.json()
    assert detail_data["sentences"][0]["text_en"] == "forty dollars?"
    assert detail_data["sentences"][0]["tokens"] == ["forty", "dollars"]

    check_resp = client.post(
        f"/api/lessons/{lesson_id}/check",
        headers=headers,
        json={"sentence_index": 0, "user_tokens": ["forty", "dollars"]},
    )
    assert check_resp.status_code == 200
    check_data = check_resp.json()
    assert check_data["passed"] is True
    assert check_data["expected_tokens"] == ["forty", "dollars"]


def test_lesson_rename_and_delete_endpoints(test_client):
    client, session_factory, _ = test_client
    owner_token = _register_and_login(client, email="rename-owner@example.com")
    other_token = _register_and_login(client, email="rename-other@example.com")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    other_headers = {"Authorization": f"Bearer {other_token}"}

    session = session_factory()
    try:
        owner = session.query(User).filter(User.email == "rename-owner@example.com").one()
        lesson = Lesson(
            user_id=owner.id,
            title="old title",
            source_filename="rename.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            duration_ms=3000,
            media_storage="client_indexeddb",
            source_duration_ms=3000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        lesson_id = lesson.id
        session.commit()
    finally:
        session.close()

    rename_ok = client.patch(f"/api/lessons/{lesson_id}", headers=owner_headers, json={"title": "  New Lesson Title  "})
    assert rename_ok.status_code == 200
    assert rename_ok.json()["title"] == "New Lesson Title"

    rename_empty = client.patch(f"/api/lessons/{lesson_id}", headers=owner_headers, json={"title": "   "})
    assert rename_empty.status_code == 400
    assert rename_empty.json()["error_code"] == "INVALID_TITLE"

    rename_too_long = client.patch(f"/api/lessons/{lesson_id}", headers=owner_headers, json={"title": "x" * 256})
    assert rename_too_long.status_code == 400
    assert rename_too_long.json()["error_code"] == "INVALID_TITLE"

    delete_cross_user = client.delete(f"/api/lessons/{lesson_id}", headers=other_headers)
    assert delete_cross_user.status_code == 404

    delete_ok = client.delete(f"/api/lessons/{lesson_id}", headers=owner_headers)
    assert delete_ok.status_code == 200
    assert delete_ok.json()["ok"] is True
    assert delete_ok.json()["lesson_id"] == lesson_id

    get_deleted = client.get(f"/api/lessons/{lesson_id}", headers=owner_headers)
    assert get_deleted.status_code == 404


def test_delete_lesson_clears_wallet_ledger_reference(test_client):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="delete-ledger-owner@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        owner = session.query(User).filter(User.email == "delete-ledger-owner@example.com").one()
        lesson = Lesson(
            user_id=owner.id,
            title="ledger linked lesson",
            source_filename="ledger.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            duration_ms=2000,
            media_storage="client_indexeddb",
            source_duration_ms=2000,
            status="ready",
        )
        session.add(lesson)
        session.flush()

        ledger = WalletLedger(
            user_id=owner.id,
            operator_user_id=None,
            event_type="consume",
            delta_points=0,
            balance_after=0,
            model_name="qwen3-asr-flash-filetrans",
            duration_ms=lesson.duration_ms,
            lesson_id=lesson.id,
            note="regression: lesson delete should clear reference",
        )
        session.add(ledger)
        session.flush()
        lesson_id = lesson.id
        ledger_id = ledger.id
        session.commit()
    finally:
        session.close()

    delete_ok = client.delete(f"/api/lessons/{lesson_id}", headers=headers)
    assert delete_ok.status_code == 200
    assert delete_ok.json()["ok"] is True
    assert delete_ok.json()["lesson_id"] == lesson_id

    verify = session_factory()
    try:
        ledger_after = verify.query(WalletLedger).filter(WalletLedger.id == ledger_id).one()
        assert ledger_after.lesson_id is None
    finally:
        verify.close()


def test_create_lesson_endpoint_with_stubbed_service(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="creator@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.api.routers import lessons as lesson_router
    monkeypatch.setattr(lesson_router, "BASE_TMP_DIR", tmp_path)

    captured = {}

    def fake_generate(upload_file, req_dir, owner_id, asr_model, db, progress_callback=None, semantic_split_enabled=None):
        captured["semantic_split_enabled"] = semantic_split_enabled
        lesson = Lesson(
            user_id=owner_id,
            title="fake lesson",
            source_filename="fake.mp4",
            asr_model=asr_model,
            duration_ms=1000,
            media_storage="client_indexeddb",
            source_duration_ms=1234,
            status="ready",
        )
        db.add(lesson)
        db.flush()
        db.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=900,
                text_en="hello",
                text_zh="你好",
                tokens_json=["hello"],
                audio_clip_path=None,
            )
        )
        db.add(
            LessonProgress(
                lesson_id=lesson.id,
                user_id=owner_id,
                current_sentence_idx=0,
                completed_indexes_json=[],
                last_played_at_ms=0,
            )
        )
        db.commit()
        db.refresh(lesson)
        lesson.subtitle_cache_seed = {
            "semantic_split_enabled": True,
            "split_mode": "word_level_split+semantic",
            "source_word_count": 2,
            "asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 300), _word_entry("world", 300, 900)]}]},
            "sentences": [
                {
                    "idx": 0,
                    "begin_ms": 0,
                    "end_ms": 900,
                    "text_en": "hello",
                    "text_zh": "你好",
                    "tokens": ["hello"],
                    "audio_url": None,
                }
            ],
        }
        return lesson

    monkeypatch.setattr(lesson_router.LessonService, "generate_from_upload", fake_generate)

    files = {"video_file": ("demo.mp4", io.BytesIO(b"dummy"), "video/mp4")}
    data = {"asr_model": QWEN_ASR_MODEL, "semantic_split_enabled": "true"}
    resp = client.post("/api/lessons", headers=headers, files=files, data=data)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["lesson"]["title"] == "fake lesson"
    assert body["lesson"]["media_storage"] == "client_indexeddb"
    assert body["lesson"]["source_duration_ms"] == 1234
    assert body["lesson"]["sentences"][0]["audio_url"] is None
    assert body["lesson"]["subtitle_cache_seed"]["semantic_split_enabled"] is True
    assert body["lesson"]["subtitle_cache_seed"]["split_mode"] == "word_level_split+semantic"
    assert body["lesson"]["subtitle_cache_seed"]["asr_payload"]["transcripts"][0]["words"][0]["text"] == "hello"
    assert captured["semantic_split_enabled"] is True


def test_lesson_media_prefers_source_filename_content_type(test_client, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="media-learner@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    media_path = tmp_path / "stored_media_without_ext"
    media_path.write_bytes(b"fake-video-binary")

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "media-learner@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="media mime test",
            source_filename="lesson-video.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            duration_ms=5000,
            media_storage="server",
            source_duration_ms=5000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        session.add(
            MediaAsset(
                lesson_id=lesson.id,
                original_path=str(media_path),
                opus_path=str(media_path),
            )
        )
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    resp = client.get(f"/api/lessons/{lesson_id}/media", headers=headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("video/mp4")


def test_local_media_mode_requires_client_binding(test_client):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="local-media@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "local-media@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="local-only",
            source_filename="local.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=2000,
            media_storage="client_indexeddb",
            source_duration_ms=2000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        session.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=1000,
                text_en="hello world",
                text_zh="你好 世界",
                tokens_json=["hello", "world"],
                audio_clip_path=None,
            )
        )
        session.add(
            LessonProgress(
                lesson_id=lesson.id,
                user_id=user.id,
                current_sentence_idx=0,
                completed_indexes_json=[],
                last_played_at_ms=0,
            )
        )
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    detail_resp = client.get(f"/api/lessons/{lesson_id}", headers=headers)
    assert detail_resp.status_code == 200
    detail_data = detail_resp.json()
    assert detail_data["media_storage"] == "client_indexeddb"
    assert detail_data["source_duration_ms"] == 2000
    assert detail_data["sentences"][0]["audio_url"] is None

    media_resp = client.get(f"/api/lessons/{lesson_id}/media", headers=headers)
    assert media_resp.status_code == 409
    assert media_resp.json()["error_code"] == "LOCAL_MEDIA_REQUIRED"

    clip_resp = client.get(f"/api/lessons/{lesson_id}/sentences/0/audio", headers=headers)
    assert clip_resp.status_code == 409
    assert clip_resp.json()["error_code"] == "LOCAL_MEDIA_REQUIRED"


def test_create_lesson_task_and_poll_success(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="task-user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.api.routers import lessons as lesson_router

    monkeypatch.setattr(lesson_router, "BASE_TMP_DIR", tmp_path)
    monkeypatch.setattr(lesson_router, "SessionLocal", session_factory)

    class InlineThread:
        def __init__(self, *, target, kwargs=None, daemon=None):
            self._target = target
            self._kwargs = kwargs or {}

        def start(self):
            self._target(**self._kwargs)

    monkeypatch.setattr(lesson_router.threading, "Thread", InlineThread)

    captured = {}

    def fake_generate_from_saved_file(
        *,
        source_path,
        source_filename,
        req_dir,
        owner_id,
        asr_model,
        db,
        progress_callback=None,
        task_id=None,
        semantic_split_enabled=None,
    ):
        captured["semantic_split_enabled"] = semantic_split_enabled
        captured["task_id"] = task_id
        if progress_callback:
            progress_callback({"stage_key": "convert_audio", "stage_status": "completed", "overall_percent": 20, "current_text": "转换音频格式完成"})
            progress_callback({"stage_key": "asr_transcribe", "stage_status": "completed", "overall_percent": 60, "current_text": "转写字幕 3/约3", "counters": {"asr_done": 3, "asr_estimated": 3}})
            progress_callback(
                {
                    "stage_key": "translate_zh",
                    "stage_status": "completed",
                    "overall_percent": 90,
                    "current_text": "翻译字幕 3/3",
                    "counters": {"translate_done": 3, "translate_total": 3},
                    "translation_debug": {
                        "total_sentences": 3,
                        "failed_sentences": 1,
                        "request_count": 3,
                        "success_request_count": 2,
                        "usage": {"prompt_tokens": 30, "completion_tokens": 12, "total_tokens": 42, "charged_points": 1},
                        "latest_error_summary": "第2句失败：REQUEST_FAILED rate limit",
                    },
                }
            )
            progress_callback({"stage_key": "write_lesson", "stage_status": "completed", "overall_percent": 100, "current_text": "课程生成完成"})

        lesson = Lesson(
            user_id=owner_id,
            title="task lesson",
            source_filename=source_filename,
            asr_model=asr_model,
            duration_ms=1200,
            media_storage="client_indexeddb",
            source_duration_ms=1200,
            status="ready",
        )
        db.add(lesson)
        db.flush()
        db.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=900,
                text_en="hello world",
                text_zh="你好世界",
                tokens_json=["hello", "world"],
                audio_clip_path=None,
            )
        )
        db.add(
            LessonProgress(
                lesson_id=lesson.id,
                user_id=owner_id,
                current_sentence_idx=0,
                completed_indexes_json=[],
                last_played_at_ms=0,
            )
        )
        db.commit()
        db.refresh(lesson)
        lesson.subtitle_cache_seed = {
            "semantic_split_enabled": True,
            "split_mode": "word_level_split+semantic",
            "source_word_count": 2,
            "asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 300), _word_entry("world", 300, 900)]}]},
            "sentences": [
                {
                    "idx": 0,
                    "begin_ms": 0,
                    "end_ms": 900,
                    "text_en": "hello",
                    "text_zh": "你好",
                    "tokens": ["hello"],
                    "audio_url": None,
                }
            ],
        }
        return lesson

    monkeypatch.setattr(lesson_router.LessonService, "generate_from_saved_file", fake_generate_from_saved_file)

    create_resp = client.post(
        "/api/lessons/tasks",
        headers=headers,
        files={"video_file": ("task.mp4", io.BytesIO(b"dummy"), "video/mp4")},
        data={"asr_model": QWEN_ASR_MODEL, "semantic_split_enabled": "false"},
    )
    assert create_resp.status_code == 200
    assert captured["semantic_split_enabled"] is False
    task_id = create_resp.json()["task_id"]

    poll_resp = client.get(f"/api/lessons/tasks/{task_id}", headers=headers)
    assert poll_resp.status_code == 200
    payload = poll_resp.json()
    assert payload["status"] == "succeeded"
    assert payload["overall_percent"] == 100
    assert payload["lesson"]["title"] == "task lesson"
    assert payload["subtitle_cache_seed"]["semantic_split_enabled"] is True
    assert payload["lesson"]["subtitle_cache_seed"]["split_mode"] == "word_level_split+semantic"
    assert payload["counters"]["translate_done"] == 3
    assert payload["translation_debug"]["failed_sentences"] == 1
    assert payload["translation_debug"]["request_count"] == 3
    assert payload["translation_debug"]["usage"]["total_tokens"] == 42
    assert payload["translation_debug"]["latest_error_summary"] == "第2句失败：REQUEST_FAILED rate limit"
    assert all(item["status"] == "completed" for item in payload["stages"])



def test_generate_from_saved_file_records_mt_usage_and_consume(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="billing-user@example.com")

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "billing-user@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        session.add(account)
        session.commit()

        from app.services import lesson_service as lesson_service_module

        req_dir = tmp_path / "req"
        req_dir.mkdir(parents=True, exist_ok=True)
        source_path = tmp_path / "source.mp4"
        source_path.write_bytes(b"video")

        monkeypatch.setattr(lesson_service_module, "extract_audio_for_asr", lambda _src, dst: dst.write_bytes(b"opus"))
        monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda _path: 60_000)
        monkeypatch.setattr(
            lesson_service_module.LessonService,
            "_transcribe_with_optional_parallel",
            staticmethod(lambda **kwargs: {"asr_payload": {"transcripts": [{"sentences": []}]}, "usage_seconds": 60}),
        )
        monkeypatch.setattr(
            lesson_service_module.LessonService,
            "build_subtitle_variant",
            staticmethod(
                lambda **kwargs: {
                    "semantic_split_enabled": False,
                    "split_mode": "word_level_split",
                    "source_word_count": 2,
                    "sentences": [
                        {
                            "idx": 0,
                            "begin_ms": 0,
                            "end_ms": 900,
                            "text_en": "hello world",
                            "text_zh": "你好世界",
                            "tokens": ["hello", "world"],
                        }
                    ],
                    "translate_failed_count": 0,
                    "translation_attempt_records": [
                        {
                            "sentence_idx": 0,
                            "attempt_no": 1,
                            "provider": "dashscope_compatible",
                            "model_name": "qwen-mt-plus",
                            "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                            "input_text_preview": "hello world",
                            "provider_request_id": "req_test",
                            "status_code": 200,
                            "finish_reason": "stop",
                            "prompt_tokens": 40,
                            "completion_tokens": 20,
                            "total_tokens": 60,
                            "success": True,
                            "error_code": "",
                            "error_message": "",
                            "started_at": datetime.utcnow(),
                            "finished_at": datetime.utcnow(),
                        }
                    ],
                    "translation_request_count": 1,
                    "translation_success_request_count": 1,
                    "translation_usage": {"prompt_tokens": 40, "completion_tokens": 20, "total_tokens": 60, "charged_points": 0},
                    "latest_translate_error_summary": "",
                }
            ),
        )

        lesson = LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="source.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
            task_id="task_billing_test",
            semantic_split_enabled=False,
        )

        mt_ledger = (
            session.query(WalletLedger)
            .filter(WalletLedger.lesson_id == lesson.id, WalletLedger.event_type == "consume_translate")
            .one()
        )
        assert mt_ledger.model_name == "qwen-mt-plus"
        assert mt_ledger.delta_points == -1

        translation_log = session.query(TranslationRequestLog).filter(TranslationRequestLog.task_id == "task_billing_test").one()
        assert translation_log.lesson_id == lesson.id
        assert translation_log.success is True
        assert translation_log.total_tokens == 60
    finally:
        session.close()


def test_regenerate_lesson_subtitle_variant_endpoint(test_client, monkeypatch):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="variant-user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "variant-user@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="variant lesson",
            source_filename="variant.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=1600,
            media_storage="client_indexeddb",
            source_duration_ms=1600,
            status="ready",
        )
        session.add(lesson)
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    from app.api.routers import lessons as lesson_router

    captured = {}

    def fake_build_subtitle_variant(*, asr_payload, db, task_id=None, semantic_split_enabled=None, before_translate_callback=None, translation_progress_callback=None):
        captured["asr_payload"] = asr_payload
        captured["semantic_split_enabled"] = semantic_split_enabled
        captured["task_id"] = task_id
        return {
            "semantic_split_enabled": True,
            "split_mode": "word_level_split+semantic",
            "source_word_count": 3,
            "sentences": [
                {
                    "idx": 0,
                    "begin_ms": 0,
                    "end_ms": 1200,
                    "text_en": "hello world again",
                    "text_zh": "你好世界再次",
                    "tokens": ["hello", "world", "again"],
                    "audio_url": None,
                }
            ],
            "translate_failed_count": 0,
        }

    monkeypatch.setattr(lesson_router.LessonService, "build_subtitle_variant", fake_build_subtitle_variant)

    resp = client.post(
        f"/api/lessons/{lesson_id}/subtitle-variants",
        headers=headers,
        json={
            "asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 400)]}]},
            "semantic_split_enabled": True,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["lesson_id"] == lesson_id
    assert body["semantic_split_enabled"] is True
    assert body["split_mode"] == "word_level_split+semantic"
    assert body["source_word_count"] == 3
    assert body["sentences"][0]["text_en"] == "hello world again"
    assert captured["semantic_split_enabled"] is True
    assert captured["asr_payload"]["transcripts"][0]["words"][0]["text"] == "hello"
def test_parallel_asr_trigger_by_duration(monkeypatch, tmp_path):
    from app.services import lesson_service as lesson_service_module

    single_calls = {"count": 0}

    def fake_single_transcribe(path: str, model: str):
        single_calls["count"] += 1
        return {
            "asr_result_json": {
                "properties": {"original_duration_in_milliseconds": 4000},
                "transcripts": [{"channel_id": 0, "sentences": [{"sentence_id": 0, "begin_time": 0, "end_time": 900, "text": "single"}]}],
            }
        }

    monkeypatch.setattr(lesson_service_module, "transcribe_audio_file", fake_single_transcribe)
    result_single = lesson_service_module.LessonService._transcribe_with_optional_parallel(
        opus_path=tmp_path / "single.opus",
        req_dir=tmp_path,
        asr_model=QWEN_ASR_MODEL,
        source_duration_ms=4000,
        parallel_enabled=True,
        parallel_threshold_seconds=10,
        segment_target_seconds=2,
        max_concurrency=4,
        progress_callback=None,
    )
    payload_single = result_single["asr_payload"]
    assert single_calls["count"] == 1
    assert payload_single["transcripts"][0]["sentences"][0]["text"] == "single"

    monkeypatch.setattr(
        lesson_service_module,
        "_split_audio_segments",
        lambda source_audio, segments_dir, target_seconds, search_window_seconds, duration_ms: [
            (0, 0, tmp_path / "seg0.opus"),
            (1, 5000, tmp_path / "seg1.opus"),
        ],
    )
    monkeypatch.setattr(
        lesson_service_module,
        "_transcribe_segment",
        lambda segment_index, segment_start_ms, segment_path, asr_model: (
            segment_index,
            [
                {
                    "text": f"seg-{segment_index}",
                    "surface": f"seg-{segment_index}",
                    "punctuation": "",
                    "begin_ms": segment_start_ms,
                    "end_ms": segment_start_ms + 1000,
                }
            ],
            [{"text": f"seg-{segment_index}", "begin_ms": segment_start_ms, "end_ms": segment_start_ms + 1000}],
            None,
        ),
    )
    result_parallel = lesson_service_module.LessonService._transcribe_with_optional_parallel(
        opus_path=tmp_path / "parallel.opus",
        req_dir=tmp_path,
        asr_model=QWEN_ASR_MODEL,
        source_duration_ms=15000,
        parallel_enabled=True,
        parallel_threshold_seconds=10,
        segment_target_seconds=5,
        max_concurrency=4,
        progress_callback=None,
    )
    payload_parallel = result_parallel["asr_payload"]
    assert payload_parallel["transcripts"][0]["words"][0]["text"] == "seg-0"
    assert payload_parallel["transcripts"][0]["words"][1]["text"] == "seg-1"


def test_build_lesson_sentences_prefers_word_level_split():
    from app.services import lesson_builder as lesson_builder_module

    payload = {
        "transcripts": [
            {
                "words": [
                    _word_entry("Hello", 0, 200),
                    _word_entry("world", 200, 500, punctuation="."),
                    _word_entry("This", 600, 800),
                    _word_entry("is", 800, 900),
                    _word_entry("a", 900, 950),
                    _word_entry("test", 950, 1300, punctuation="."),
                ]
            }
        ]
    }

    result = lesson_builder_module.build_lesson_sentences(payload, split_enabled=True, target_words=8, max_words=12)

    assert result["mode"] == "word_level_split"
    assert [item["text"] for item in result["sentences"]] == ["Hello world.", "This is a test."]


def test_build_lesson_sentences_falls_back_when_words_missing():
    from app.services import lesson_builder as lesson_builder_module

    payload = {
        "transcripts": [
            {
                "sentences": [
                    {"text": "fallback line", "begin_time": 0, "end_time": 900},
                ]
            }
        ]
    }

    result = lesson_builder_module.build_lesson_sentences(payload, split_enabled=True)

    assert result["mode"] == "asr_sentences_no_words"
    assert result["sentences"][0]["text"] == "fallback line"


def test_build_lesson_sentences_splits_on_connectors():
    from app.services import lesson_builder as lesson_builder_module

    payload = {
        "transcripts": [
            {
                "words": [
                    _word_entry("I", 0, 100),
                    _word_entry("stayed", 100, 250),
                    _word_entry("home", 250, 400),
                    _word_entry("last", 400, 520),
                    _word_entry("night", 520, 700),
                    _word_entry("because", 700, 900),
                    _word_entry("the", 900, 1000),
                    _word_entry("storm", 1000, 1150),
                    _word_entry("was", 1150, 1250),
                    _word_entry("getting", 1250, 1400),
                    _word_entry("worse", 1400, 1650),
                ]
            }
        ]
    }

    result = lesson_builder_module.build_lesson_sentences(payload, split_enabled=True, target_words=12, max_words=20)

    assert result["mode"] == "word_level_split"
    assert len(result["sentences"]) == 2
    assert result["sentences"][1]["text"].startswith("because")


def test_split_audio_segments_prefers_silence(monkeypatch, tmp_path):
    from app.services import lesson_service as lesson_service_module

    monkeypatch.setattr(
        lesson_service_module,
        "_detect_silence_ranges",
        lambda source_audio, search_start_sec, search_end_sec: [(5.2, 5.9)],
    )

    def fake_run_cmd(cmd, **kwargs):
        output_path = Path(cmd[-1])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"segment")

    monkeypatch.setattr(lesson_service_module, "run_cmd", fake_run_cmd)

    segments = lesson_service_module._split_audio_segments(
        tmp_path / "source.opus",
        tmp_path / "segments",
        target_seconds=5,
        search_window_seconds=2,
        duration_ms=9000,
    )

    assert len(segments) == 2
    assert segments[0][1] == 0
    assert segments[1][1] == 5700


def test_settle_reserved_points_allows_negative_balance(test_client):
    client, session_factory, _ = test_client
    _register_and_login(client, email="settle-negative@example.com")

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "settle-negative@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 10
        session.add(account)
        session.commit()

        ledger = settle_reserved_points(
            session,
            user_id=user.id,
            model_name=QWEN_ASR_MODEL,
            reserved_points=10,
            actual_points=25,
            duration_ms=120000,
            note="regression settle negative",
        )
        session.commit()
        session.refresh(account)
        assert ledger is not None
        assert ledger.event_type == "consume"
        assert ledger.delta_points == -15
        assert account.balance_points == -5
    finally:
        session.close()


def test_generate_lesson_settles_with_usage_seconds(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="usage-settle@example.com")

    from app.services import lesson_service as lesson_service_module

    monkeypatch.setattr(
        lesson_service_module,
        "extract_audio_for_asr",
        lambda source_path, opus_path: opus_path.write_bytes(b"opus"),
    )
    monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda opus_path: 120000)
    monkeypatch.setattr(
        lesson_service_module,
        "translate_sentences_to_zh",
        lambda texts, api_key, progress_callback=None: _translation_batch_result(["你好"] * len(texts)),
    )
    monkeypatch.setattr(
        lesson_service_module,
        "estimate_duration_ms",
        lambda payload, sentences: 999999,
    )
    monkeypatch.setattr(
        lesson_service_module,
        "build_lesson_sentences",
        lambda payload, **kwargs: {
            "sentences": [{"text": "hello world", "begin_ms": 0, "end_ms": 1000}],
            "mode": "word_level_split",
        },
    )
    monkeypatch.setattr(
        lesson_service_module,
        "extract_word_items",
        lambda payload: [_word_entry("hello", 0, 500), _word_entry("world", 500, 1000)],
    )
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: {"asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 500)]}]}, "usage_seconds": 60},
    )

    source_path = tmp_path / "usage.mp4"
    req_dir = tmp_path / "req_usage"
    source_path.write_bytes(b"source")
    req_dir.mkdir(parents=True, exist_ok=True)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "usage-settle@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 1000
        session.add(account)
        session.commit()

        lesson = lesson_service_module.LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="usage.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
        )
        session.refresh(account)
        assert lesson.id > 0
        assert account.balance_points == 870

        ledgers = (
            session.query(WalletLedger)
            .filter(WalletLedger.user_id == user.id)
            .order_by(WalletLedger.id.asc())
            .all()
        )
        assert [item.event_type for item in ledgers[-3:]] == ["reserve", "refund", "consume"]
        assert ledgers[-2].delta_points == 130
        assert ledgers[-1].delta_points == 0
    finally:
        session.close()


def test_generate_lesson_settles_with_fallback_and_can_go_negative(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="fallback-settle@example.com")

    from app.services import lesson_service as lesson_service_module

    monkeypatch.setattr(
        lesson_service_module,
        "extract_audio_for_asr",
        lambda source_path, opus_path: opus_path.write_bytes(b"opus"),
    )
    monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda opus_path: 120000)
    monkeypatch.setattr(
        lesson_service_module,
        "translate_sentences_to_zh",
        lambda texts, api_key, progress_callback=None: _translation_batch_result(["你好"] * len(texts)),
    )
    monkeypatch.setattr(
        lesson_service_module,
        "estimate_duration_ms",
        lambda payload, sentences: 300000,
    )
    monkeypatch.setattr(
        lesson_service_module,
        "build_lesson_sentences",
        lambda payload, **kwargs: {
            "sentences": [{"text": "hello world", "begin_ms": 0, "end_ms": 1000}],
            "mode": "word_level_split",
        },
    )
    monkeypatch.setattr(
        lesson_service_module,
        "extract_word_items",
        lambda payload: [_word_entry("hello", 0, 500), _word_entry("world", 500, 1000)],
    )
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: {"asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 500)]}]}, "usage_seconds": None},
    )

    source_path = tmp_path / "fallback.mp4"
    req_dir = tmp_path / "req_fallback"
    source_path.write_bytes(b"source")
    req_dir.mkdir(parents=True, exist_ok=True)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "fallback-settle@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 400
        session.add(account)
        session.commit()

        lesson = lesson_service_module.LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="fallback.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
        )
        session.refresh(account)
        assert lesson.id > 0
        assert account.balance_points == -250

        ledgers = (
            session.query(WalletLedger)
            .filter(WalletLedger.user_id == user.id)
            .order_by(WalletLedger.id.asc())
            .all()
        )
        assert [item.event_type for item in ledgers[-3:]] == ["reserve", "consume", "consume"]
        assert ledgers[-2].delta_points == -390
        assert ledgers[-1].delta_points == 0
    finally:
        session.close()


def test_generate_lesson_stores_spoken_usd_amounts(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="spoken-money@example.com")

    from app.services import lesson_service as lesson_service_module

    monkeypatch.setattr(
        lesson_service_module,
        "extract_audio_for_asr",
        lambda source_path, opus_path: opus_path.write_bytes(b"opus"),
    )
    monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda opus_path: 1000)
    monkeypatch.setattr(
        lesson_service_module,
        "translate_sentences_to_zh",
        lambda texts, api_key, progress_callback=None: _translation_batch_result(["40美元？"] * len(texts)),
    )
    monkeypatch.setattr(lesson_service_module, "estimate_duration_ms", lambda payload, sentences: 1000)
    monkeypatch.setattr(
        lesson_service_module,
        "build_lesson_sentences",
        lambda payload, **kwargs: {
            "sentences": [{"text": "$40?", "begin_ms": 0, "end_ms": 1000}],
            "mode": "word_level_split",
        },
    )
    monkeypatch.setattr(
        lesson_service_module,
        "extract_word_items",
        lambda payload: [_word_entry("$40", 0, 1000, punctuation="?", surface="$40?")],
    )
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: {"asr_payload": {"transcripts": [{"words": [_word_entry("$40", 0, 1000, punctuation="?")]}]}, "usage_seconds": 1},
    )

    source_path = tmp_path / "spoken_money.mp4"
    req_dir = tmp_path / "req_spoken_money"
    source_path.write_bytes(b"source")
    req_dir.mkdir(parents=True, exist_ok=True)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "spoken-money@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 100
        session.add(account)
        session.commit()

        lesson = lesson_service_module.LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="spoken_money.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
        )

        stored = session.query(LessonSentence).filter(LessonSentence.lesson_id == lesson.id).order_by(LessonSentence.idx.asc()).all()
        assert len(stored) == 1
        assert stored[0].text_en == "forty dollars?"
        assert stored[0].tokens_json == ["forty", "dollars"]
    finally:
        session.close()


def test_generate_lesson_applies_semantic_split_when_enabled(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="semantic-ok@example.com")

    from app.services import lesson_service as lesson_service_module
    from app.services.billing_service import get_or_create_wallet_account, get_subtitle_settings

    word_chunk = [
        {"text": "alpha", "surface": "alpha", "punctuation": "", "begin_ms": 0, "end_ms": 500},
        {"text": "beta", "surface": "beta", "punctuation": "", "begin_ms": 500, "end_ms": 1000},
        {"text": "gamma", "surface": "gamma", "punctuation": "", "begin_ms": 1000, "end_ms": 1500},
        {"text": "delta", "surface": "delta", "punctuation": "", "begin_ms": 1500, "end_ms": 2000},
        {"text": "epsilon", "surface": "epsilon", "punctuation": "", "begin_ms": 2000, "end_ms": 2500},
        {"text": "zeta", "surface": "zeta", "punctuation": "", "begin_ms": 2500, "end_ms": 3000},
    ]

    monkeypatch.setattr(
        lesson_service_module,
        "extract_audio_for_asr",
        lambda source_path, opus_path: opus_path.write_bytes(b"opus"),
    )
    monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda opus_path: 120000)
    monkeypatch.setattr(
        lesson_service_module,
        "translate_sentences_to_zh",
        lambda texts, api_key, progress_callback=None: _translation_batch_result([f"中:{item}" for item in texts]),
    )
    monkeypatch.setattr(lesson_service_module, "estimate_duration_ms", lambda payload, sentences: 3000)
    monkeypatch.setattr(
        lesson_service_module,
        "build_lesson_sentences",
        lambda payload, **kwargs: {
            "sentences": [{"text": "alpha beta gamma delta epsilon zeta", "begin_ms": 0, "end_ms": 3000}],
            "chunks": [word_chunk],
            "mode": "word_level_split",
        },
    )
    monkeypatch.setattr(
        lesson_service_module,
        "extract_word_items",
        lambda payload: [_word_entry("alpha", 0, 500), _word_entry("zeta", 2500, 3000)],
    )
    monkeypatch.setattr(
        lesson_service_module,
        "split_sentence_by_semantic",
        lambda text, **kwargs: ["alpha beta gamma", "delta epsilon zeta"],
    )
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: {"asr_payload": {"transcripts": [{"words": [_word_entry("alpha", 0, 500)]}]}, "usage_seconds": None},
    )

    source_path = tmp_path / "semantic_ok.mp4"
    req_dir = tmp_path / "req_semantic_ok"
    source_path.write_bytes(b"source")
    req_dir.mkdir(parents=True, exist_ok=True)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "semantic-ok@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        settings = get_subtitle_settings(session)
        settings.semantic_split_max_words_threshold = 3
        session.add_all([account, settings])
        session.commit()

        lesson = lesson_service_module.LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="semantic_ok.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
            semantic_split_enabled=True,
        )

        stored = session.query(LessonSentence).filter(LessonSentence.lesson_id == lesson.id).order_by(LessonSentence.idx.asc()).all()
        assert [item.text_en for item in stored] == ["alpha beta gamma", "delta epsilon zeta"]
        assert [item.begin_ms for item in stored] == [0, 1500]
        assert [item.end_ms for item in stored] == [1500, 3000]
    finally:
        session.close()


def test_generate_lesson_semantic_split_failure_falls_back_to_rule_split(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="semantic-fallback@example.com")

    from app.services import lesson_service as lesson_service_module
    from app.services.billing_service import get_or_create_wallet_account, get_subtitle_settings
    from app.services.translation_qwen_mt import SemanticSplitError

    word_chunk = [
        {"text": "alpha", "surface": "alpha", "punctuation": "", "begin_ms": 0, "end_ms": 500},
        {"text": "beta", "surface": "beta", "punctuation": "", "begin_ms": 500, "end_ms": 1000},
        {"text": "gamma", "surface": "gamma", "punctuation": "", "begin_ms": 1000, "end_ms": 1500},
        {"text": "delta", "surface": "delta", "punctuation": "", "begin_ms": 1500, "end_ms": 2000},
    ]

    monkeypatch.setattr(
        lesson_service_module,
        "extract_audio_for_asr",
        lambda source_path, opus_path: opus_path.write_bytes(b"opus"),
    )
    monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda opus_path: 120000)
    monkeypatch.setattr(
        lesson_service_module,
        "translate_sentences_to_zh",
        lambda texts, api_key, progress_callback=None: _translation_batch_result([f"中:{item}" for item in texts]),
    )
    monkeypatch.setattr(lesson_service_module, "estimate_duration_ms", lambda payload, sentences: 2000)
    monkeypatch.setattr(
        lesson_service_module,
        "build_lesson_sentences",
        lambda payload, **kwargs: {
            "sentences": [{"text": "alpha beta gamma delta", "begin_ms": 0, "end_ms": 2000}],
            "chunks": [word_chunk],
            "mode": "word_level_split",
        },
    )
    monkeypatch.setattr(
        lesson_service_module,
        "extract_word_items",
        lambda payload: [_word_entry("alpha", 0, 500), _word_entry("delta", 1500, 2000)],
    )
    monkeypatch.setattr(
        lesson_service_module,
        "split_sentence_by_semantic",
        lambda text, **kwargs: (_ for _ in ()).throw(SemanticSplitError("boom")),
    )
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: {"asr_payload": {"transcripts": [{"words": [_word_entry("alpha", 0, 500)]}]}, "usage_seconds": None},
    )

    source_path = tmp_path / "semantic_fallback.mp4"
    req_dir = tmp_path / "req_semantic_fallback"
    source_path.write_bytes(b"source")
    req_dir.mkdir(parents=True, exist_ok=True)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "semantic-fallback@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        settings = get_subtitle_settings(session)
        settings.semantic_split_max_words_threshold = 3
        session.add_all([account, settings])
        session.commit()

        lesson = lesson_service_module.LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="semantic_fallback.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
            semantic_split_enabled=True,
        )

        stored = session.query(LessonSentence).filter(LessonSentence.lesson_id == lesson.id).order_by(LessonSentence.idx.asc()).all()
        assert len(stored) == 1
        assert stored[0].text_en == "alpha beta gamma delta"
    finally:
        session.close()


def test_generate_lesson_failure_still_refunds_reserved_points(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="settle-fail@example.com")

    from app.services import lesson_service as lesson_service_module

    monkeypatch.setattr(
        lesson_service_module,
        "extract_audio_for_asr",
        lambda source_path, opus_path: opus_path.write_bytes(b"opus"),
    )
    monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda opus_path: 120000)
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("asr failed")),
    )

    source_path = tmp_path / "fail.mp4"
    req_dir = tmp_path / "req_fail"
    source_path.write_bytes(b"source")
    req_dir.mkdir(parents=True, exist_ok=True)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "settle-fail@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        session.add(account)
        session.commit()

        with pytest.raises(RuntimeError):
            lesson_service_module.LessonService.generate_from_saved_file(
                source_path=source_path,
                source_filename="fail.mp4",
                req_dir=req_dir,
                owner_id=user.id,
                asr_model=QWEN_ASR_MODEL,
                db=session,
            )

        session.refresh(account)
        assert account.balance_points == 500
        ledgers = (
            session.query(WalletLedger)
            .filter(WalletLedger.user_id == user.id)
            .order_by(WalletLedger.id.asc())
            .all()
        )
        assert [item.event_type for item in ledgers[-2:]] == ["reserve", "refund"]
        assert ledgers[-2].delta_points == -260
        assert ledgers[-1].delta_points == 260
    finally:
        session.close()





