from __future__ import annotations

import json
import os
import re
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from app.api.deps.auth import get_admin_user
from app.db import create_database_engine, get_db
from app.infra.translation_qwen_mt import SemanticSplitError
from app.main import create_app
from app.models import (
    BillingModelRate,
    LessonSentence,
    SubtitleSetting,
    TranslationRequestLog,
    User,
    WalletLedger,
)
from app.services.billing_service import (
    calculate_points,
    ensure_default_billing_rates,
    get_or_create_wallet_account,
    get_subtitle_settings,
    settle_reserved_points,
)
from app.services.lesson_service import LessonService

from ._regression_helpers import (
    translation_batch_result as _translation_batch_result,
    word_entry as _word_entry,
)
from .conftest import (
    _register_and_login,
    _seed_wallet_balance,
    _enable_upload_task_prereqs,
    _recreate_legacy_subtitle_settings,
    _enable_local_asr_model,
    FASTER_WHISPER_ASR_MODEL,
)

QWEN_ASR_MODEL = "qwen3-asr-flash-filetrans"


def test_admin_billing_rates_endpoint_handles_legacy_schema_defaults(tmp_path):
    db_file = tmp_path / "legacy_admin_rates.db"
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
    target = next(item for item in payload["rates"] if item["model_name"] == "qwen3-asr-flash-filetrans")
    assert target["price_per_minute_cents"] == 130
    assert target["price_per_minute_yuan"] == "1.3000"
    assert target["cost_per_minute_cents"] == 2
    assert target["cost_per_minute_yuan"] == "0.0132"
    assert target["billing_unit"] == "minute"
    assert "parallel_enabled" not in target


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


def test_admin_translation_logs_accepts_empty_lesson_id_and_rejects_invalid(test_client, monkeypatch):
    client, _, _ = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "translation-lesson-id-admin@example.com")
    token = _register_and_login(client, email="translation-lesson-id-admin@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    empty_resp = client.get("/api/admin/translation-logs", headers=headers, params={"lesson_id": ""})
    assert empty_resp.status_code == 200
    assert empty_resp.json()["ok"] is True

    invalid_resp = client.get("/api/admin/translation-logs", headers=headers, params={"lesson_id": "abc"})
    assert invalid_resp.status_code == 400
    assert invalid_resp.json()["error_code"] == "INVALID_LESSON_ID"


def test_wallet_and_admin_endpoints(test_client):
    client, session_factory, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "admin@example.com")
    token = _register_and_login(client, email="admin@example.com")

    headers = {"Authorization": f"Bearer {token}"}

    wallet = client.get("/api/wallet/me", headers=headers)
    assert wallet.status_code == 200
    assert "balance_amount_cents" in wallet.json()

    seed_dirty = session_factory()
    try:
        seed_dirty.merge(
            BillingModelRate(
                model_name="qwen-mt-custom",
                points_per_minute=0,
                points_per_1k_tokens=21,
                billing_unit="1k_tokens",
                is_active=True,
                parallel_enabled=False,
                parallel_threshold_seconds=600,
                segment_seconds=300,
                max_concurrency=1,
            )
        )
        seed_dirty.merge(
            BillingModelRate(
                model_name="local-sensevoice-small",
                points_per_minute=130,
                points_per_1k_tokens=0,
                billing_unit="minute",
                is_active=True,
                parallel_enabled=False,
                parallel_threshold_seconds=600,
                segment_seconds=300,
                max_concurrency=1,
            )
        )
        seed_dirty.commit()
    finally:
        seed_dirty.close()

    rates = client.get("/api/admin/billing-rates", headers=headers)
    assert rates.status_code == 200
    assert isinstance(rates.json().get("rates"), list)
    assert any(
        "price_per_minute_yuan" in item
        and "cost_per_minute_yuan" in item
        and "price_per_minute_cents" in item
        and "cost_per_minute_cents" in item
        for item in rates.json().get("rates", [])
    )
    admin_model_names = [str(item.get("model_name") or "") for item in rates.json().get("rates", [])]
    admin_mt_models = [name for name in admin_model_names if name.startswith("qwen-mt-")]
    assert admin_mt_models == ["qwen-mt-flash"]
    assert "local-sensevoice-small" not in admin_model_names

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
    assert all(
        "price_per_minute_yuan" in item
        and "cost_per_minute_yuan" in item
        and "price_per_minute_cents" in item
        and "cost_per_minute_cents" in item
        for item in public_rates.json()["rates"]
    )
    public_model_names = [str(item.get("model_name") or "") for item in public_rates.json().get("rates", [])]
    public_mt_models = [name for name in public_model_names if name.startswith("qwen-mt-")]
    assert public_mt_models == []

    verify_clean = session_factory()
    try:
        assert verify_clean.get(BillingModelRate, "qwen-mt-custom") is None
        assert verify_clean.get(BillingModelRate, "local-sensevoice-small") is None
    finally:
        verify_clean.close()


def test_admin_update_billing_rate_rejects_non_flash_mt_model(test_client):
    client, _, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "billing-admin@example.com")
    token = _register_and_login(client, email="billing-admin@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.put(
        "/api/admin/billing-rates/qwen-mt-custom",
        headers=headers,
        json={
            "points_per_minute": 0,
            "points_per_1k_tokens": 15,
            "billing_unit": "1k_tokens",
            "is_active": True,
        },
    )
    assert resp.status_code == 400
    payload = resp.json()
    assert payload["error_code"] == "MT_MODEL_DEPRECATED"


def test_admin_update_billing_rate_accepts_mt_flash_token_pricing(test_client):
    client, session_factory, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "billing-flash-admin@example.com")
    token = _register_and_login(client, email="billing-flash-admin@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.put(
        "/api/admin/billing-rates/qwen-mt-flash",
        headers=headers,
        json={
            "points_per_1k_tokens": 19,
            "cost_per_minute_yuan": "0.0110",
            "billing_unit": "1k_tokens",
            "is_active": True,
        },
    )
    assert resp.status_code == 200
    rate = resp.json()["rates"][0]
    assert rate["model_name"] == "qwen-mt-flash"
    assert rate["billing_unit"] == "1k_tokens"
    assert rate["points_per_1k_tokens"] == 19
    assert rate["cost_per_minute_yuan"] == "0.0110"
    assert rate["points_per_minute"] == 0

    session = session_factory()
    try:
        saved_rate = session.get(BillingModelRate, "qwen-mt-flash")
        assert saved_rate is not None
        assert saved_rate.points_per_1k_tokens == 19
        assert saved_rate.cost_per_minute_yuan == Decimal("0.0110")
    finally:
        session.close()


def test_admin_update_billing_rate_accepts_minute_yuan_pricing(test_client):
    client, session_factory, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "billing-yuan-admin@example.com")
    token = _register_and_login(client, email="billing-yuan-admin@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.put(
        "/api/admin/billing-rates/qwen3-asr-flash-filetrans",
        headers=headers,
        json={
            "price_per_minute_yuan": "2.2200",
            "cost_per_minute_yuan": "0.0132",
            "points_per_1k_tokens": 0,
            "billing_unit": "minute",
            "is_active": True,
        },
    )

    assert resp.status_code == 200
    rate = resp.json()["rates"][0]
    assert rate["model_name"] == QWEN_ASR_MODEL
    assert rate["price_per_minute_yuan"] == "2.2200"
    assert rate["cost_per_minute_yuan"] == "0.0132"
    assert rate["price_per_minute_cents"] == 222
    assert rate["points_per_minute"] == 222
    assert rate["cost_per_minute_cents"] == 2

    session = session_factory()
    try:
        saved_rate = session.get(BillingModelRate, QWEN_ASR_MODEL)
        assert saved_rate is not None
        assert saved_rate.price_per_minute_yuan == Decimal("2.2200")
        assert saved_rate.cost_per_minute_yuan == Decimal("0.0132")
        assert saved_rate.price_per_minute_cents_legacy == 222
        assert saved_rate.cost_per_minute_cents_legacy == 2
    finally:
        session.close()


def test_admin_update_billing_rate_accepts_legacy_minute_cents_payload(test_client):
    client, _, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "billing-legacy-cents-admin@example.com")
    token = _register_and_login(client, email="billing-legacy-cents-admin@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.put(
        "/api/admin/billing-rates/faster-whisper-medium",
        headers=headers,
        json={
            "points_per_minute": 180,
            "cost_per_minute_cents": 7,
            "points_per_1k_tokens": 0,
            "billing_unit": "minute",
            "is_active": True,
        },
    )

    assert resp.status_code == 200
    rate = resp.json()["rates"][0]
    assert rate["model_name"] == "faster-whisper-medium"
    assert rate["price_per_minute_yuan"] == "1.8000"
    assert rate["cost_per_minute_yuan"] == "0.0700"
    assert rate["price_per_minute_cents"] == 180
    assert rate["cost_per_minute_cents"] == 7


def test_admin_update_billing_rate_rejects_local_browser_model(test_client):
    client, _, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "billing-local-admin@example.com")
    token = _register_and_login(client, email="billing-local-admin@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.put(
        "/api/admin/billing-rates/local-sensevoice-small",
        headers=headers,
        json={
            "points_per_minute": 130,
            "billing_unit": "minute",
            "is_active": True,
        },
    )
    assert resp.status_code == 400
    payload = resp.json()
    assert payload["error_code"] == "BILLING_RATE_NOT_MANAGEABLE"


def test_calculate_points_uses_decimal_yuan_and_rounds_up_to_cents():
    assert calculate_points(60_000, price_per_minute_yuan=Decimal("0.0132")) == 2
    assert calculate_points(30_000, price_per_minute_yuan=Decimal("0.0132")) == 1


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
            "semantic_split_timeout_seconds": 35,
            "translation_batch_max_chars": 3200,
        },
    )
    assert update_resp.status_code == 200
    payload = update_resp.json()["settings"]
    assert payload["semantic_split_default_enabled"] is True
    assert payload["subtitle_split_target_words"] == 16
    assert payload["semantic_split_max_words_threshold"] == 20
    assert payload["translation_batch_max_chars"] == 3200

    fetch_resp = client.get("/api/admin/subtitle-settings", headers=admin_headers)
    assert fetch_resp.status_code == 200
    assert fetch_resp.json()["settings"]["semantic_split_timeout_seconds"] == 35
    assert fetch_resp.json()["settings"]["translation_batch_max_chars"] == 3200


def test_admin_removed_sensevoice_settings_endpoints_are_not_found(test_client):
    client, _, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "sensevoice-admin@example.com")
    admin_token = _register_and_login(client, email="sensevoice-admin@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    responses = [
        client.get("/api/admin/sensevoice-settings", headers=admin_headers),
        client.get("/api/admin/sensevoice-settings/history", headers=admin_headers),
        client.put(
            "/api/admin/sensevoice-settings",
            headers=admin_headers,
            json={
                "model_dir": "iic/SenseVoiceSmall",
                "trust_remote_code": True,
                "remote_code": "/srv/models/sensevoice/model.py",
                "device": "cpu",
                "language": "en",
                "vad_model": "fsmn-vad",
                "vad_max_single_segment_time": 45000,
                "use_itn": False,
                "batch_size_s": 80,
                "merge_vad": False,
                "merge_length_s": 20,
                "ban_emo_unk": True,
            },
        ),
        client.post("/api/admin/sensevoice-settings/rollback-last", headers=admin_headers),
    ]

    for response in responses:
        assert response.status_code in {404, 405}
        assert response.json()["detail"] in {"Not Found", "Method Not Allowed"}


def test_admin_faster_whisper_settings_roundtrip_and_rollback(test_client):
    client, _, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "faster-whisper-admin@example.com")
    admin_token = _register_and_login(client, email="faster-whisper-admin@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    initial_resp = client.get("/api/admin/faster-whisper-settings/history", headers=admin_headers)
    assert initial_resp.status_code == 200
    initial_settings = initial_resp.json()["current"]

    update_resp = client.put(
        "/api/admin/faster-whisper-settings",
        headers=admin_headers,
        json={
            "device": "cpu",
            "compute_type": "int8",
            "cpu_threads": 6,
            "num_workers": 3,
            "beam_size": 4,
            "vad_filter": False,
            "condition_on_previous_text": True,
        },
    )
    assert update_resp.status_code == 200
    payload = update_resp.json()["settings"]
    assert payload["device"] == "cpu"
    assert payload["cpu_threads"] == 6
    assert payload["num_workers"] == 3
    assert payload["beam_size"] == 4
    assert payload["vad_filter"] is False
    assert payload["condition_on_previous_text"] is True

    fetch_resp = client.get("/api/admin/faster-whisper-settings", headers=admin_headers)
    assert fetch_resp.status_code == 200
    assert fetch_resp.json()["settings"]["compute_type"] == "int8"

    rollback_resp = client.post("/api/admin/faster-whisper-settings/rollback-last", headers=admin_headers)
    assert rollback_resp.status_code == 200
    rollback_payload = rollback_resp.json()["settings"]
    assert rollback_payload["device"] == initial_settings["device"]
    assert rollback_payload["cpu_threads"] == initial_settings["cpu_threads"]
    assert rollback_payload["num_workers"] == initial_settings["num_workers"]


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
                    model_name="qwen-mt-flash",
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
                    model_name="qwen-mt-flash",
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


def test_subtitle_settings_backfill_uses_bool_binding_for_postgres(monkeypatch):
    from app.services import billing as billing_runtime

    class DummyBind:
        dialect = SimpleNamespace(name="postgresql")

    class DummySession:
        def __init__(self):
            self.executed: list[tuple[str, dict]] = []
            self.commit_count = 0

        def get_bind(self):
            return DummyBind()

        def execute(self, stmt, params=None):
            sql = str(stmt)
            self.executed.append((sql, dict(params or {})))
            if sql.strip().upper().startswith("SELECT 1 FROM"):
                return SimpleNamespace(scalar=lambda: 1)
            return SimpleNamespace(rowcount=1)

        def commit(self):
            self.commit_count += 1

    dummy = DummySession()
    monkeypatch.setattr(billing_runtime, "_qualified_subtitle_settings_table", lambda _db: "app.subtitle_settings")
    monkeypatch.setattr(
        billing_runtime,
        "_subtitle_settings_column_names",
        lambda _db: {"semantic_split_default_enabled", "subtitle_split_enabled", "updated_at"},
    )

    changed = billing_runtime._backfill_subtitle_settings_values(dummy)
    assert changed is True
    assert dummy.commit_count >= 1

    bool_updates = [
        (sql, params)
        for sql, params in dummy.executed
        if sql.strip().upper().startswith("UPDATE")
        and ("semantic_split_default_enabled" in sql or "subtitle_split_enabled" in sql)
    ]
    assert bool_updates
    assert all("default_value" in params for _, params in bool_updates)
    assert all(isinstance(params["default_value"], bool) for _, params in bool_updates)
    assert all("= 0" not in sql and "= 1" not in sql for sql, _ in bool_updates)


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
            "semantic_split_timeout_seconds": 50,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["settings"]["semantic_split_default_enabled"] is True
    assert body["settings"]["semantic_split_timeout_seconds"] == 50
    assert body["settings"]["translation_batch_max_chars"] == 2600


def test_subtitle_settings_endpoints_self_heal_missing_columns(test_client):
    client, session_factory, monkeypatch = test_client
    from app import main as app_main

    _recreate_legacy_subtitle_settings(session_factory)

    probe_session = session_factory()
    try:
        probe_engine = probe_session.get_bind()
    finally:
        probe_session.close()

    monkeypatch.setattr(app_main, "engine", probe_engine)
    monkeypatch.setattr(app_main, "DATABASE_URL", str(probe_engine.url))
    monkeypatch.setattr(app_main, "SessionLocal", session_factory)

    ready_resp = client.get("/health/ready")
    assert ready_resp.status_code == 503
    assert ready_resp.json()["ok"] is False

    repair = session_factory()
    try:
        ensure_default_billing_rates(repair)
    finally:
        repair.close()

    ready_after_repair = client.get("/health/ready")
    assert ready_after_repair.status_code in {200, 503}
    assert ready_after_repair.json()["status"]["db_ready"] is True

    public_resp = client.get("/api/billing/rates")
    assert public_resp.status_code == 200
    assert public_resp.json()["subtitle_settings"]["semantic_split_default_enabled"] is False

    from app.api.deps.auth import get_admin_user as admin_dep

    client.app.dependency_overrides[admin_dep] = lambda: SimpleNamespace(id=1, email="admin@example.com")
    history_resp = client.get("/api/admin/subtitle-settings/history")
    assert history_resp.status_code == 200
    assert history_resp.json()["ok"] is True

    verify = session_factory()
    try:
        row = get_subtitle_settings(verify)
        assert int(row.semantic_split_timeout_seconds) == 40
        assert int(row.translation_batch_max_chars) == 2600
        column_names = {
            str(item["name"])
            for item in verify.execute(text("PRAGMA table_info(subtitle_settings)")).mappings().all()
        }
        assert "semantic_split_timeout_seconds" in column_names
        assert "translation_batch_max_chars" in column_names
    finally:
        verify.close()


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
    before_points = wallet_before.json()["balance_amount_cents"]

    redeem_ok = client.post("/api/wallet/redeem-code", headers=user_headers, json={"code": generated_codes[0]})
    assert redeem_ok.status_code == 200
    assert redeem_ok.json()["redeemed_amount_cents"] == 66
    assert redeem_ok.json()["balance_amount_cents"] == before_points + 66

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


def test_generate_lesson_self_heals_legacy_subtitle_settings_columns(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="legacy-subtitle@example.com")

    _recreate_legacy_subtitle_settings(session_factory)

    from app.services import lesson_service as lesson_service_module

    asr_payload = {
        "transcripts": [
            {
                "sentences": [{"text": "Hello world", "begin_time": 0, "end_time": 1000}],
                "words": [_word_entry("Hello", 0, 500), _word_entry("world", 500, 1000)],
            }
        ]
    }

    monkeypatch.setattr(
        lesson_service_module,
        "extract_audio_for_asr",
        lambda source_path, opus_path: opus_path.write_bytes(b"opus"),
    )
    monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda opus_path: 1000)
    monkeypatch.setattr(
        lesson_service_module,
        "translate_sentences_to_zh",
        lambda texts, api_key, progress_callback=None: _translation_batch_result(["你好"] * len(texts), total_tokens=12),
    )
    monkeypatch.setattr(lesson_service_module, "estimate_duration_ms", lambda payload, sentences: 1000)
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: {"asr_payload": asr_payload, "usage_seconds": 1},
    )

    source_path = tmp_path / "legacy_subtitle.mp4"
    req_dir = tmp_path / "req_legacy_subtitle"
    source_path.write_bytes(b"source")
    req_dir.mkdir(parents=True, exist_ok=True)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "legacy-subtitle@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        session.add(account)
        session.commit()

        lesson = lesson_service_module.LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="legacy_subtitle.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
        )

        session.refresh(account)
        repaired_settings = get_subtitle_settings(session)
        stored = session.query(LessonSentence).filter(LessonSentence.lesson_id == lesson.id).order_by(LessonSentence.idx.asc()).all()

        assert lesson.id > 0
        assert stored[0].text_en == "Hello world"
        assert stored[0].text_zh == "你好"
        assert int(repaired_settings.semantic_split_timeout_seconds) == 40
        assert int(repaired_settings.translation_batch_max_chars) == 2600
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
    from app.services.billing_service import (
        get_or_create_wallet_account,
        get_subtitle_settings,
    )

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


def test_generate_lesson_uses_asr_sentences_when_semantic_disabled(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="semantic-disabled@example.com")

    from app.services import lesson_service as lesson_service_module
    from app.services.billing_service import get_or_create_wallet_account

    asr_payload = {
        "transcripts": [
            {
                "sentences": [
                    {"text": "Alpha beta", "begin_time": 0, "end_time": 1200},
                    {"text": "Gamma delta", "begin_time": 1200, "end_time": 2600},
                ],
                "words": [
                    _word_entry("Alpha", 0, 500),
                    _word_entry("beta", 500, 1200),
                    _word_entry("Gamma", 1200, 1800),
                    _word_entry("delta", 1800, 2600),
                ],
            }
        ]
    }

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
    monkeypatch.setattr(lesson_service_module, "estimate_duration_ms", lambda payload, sentences: 2600)

    def _unexpected_rule_split(*args, **kwargs):
        raise AssertionError("semantic_split_enabled=False should not call build_lesson_sentences")

    monkeypatch.setattr(lesson_service_module, "build_lesson_sentences", _unexpected_rule_split)
    monkeypatch.setattr(
        lesson_service_module,
        "extract_word_items",
        lambda payload: [
            _word_entry("Alpha", 0, 500),
            _word_entry("beta", 500, 1200),
            _word_entry("Gamma", 1200, 1800),
            _word_entry("delta", 1800, 2600),
        ],
    )
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: {"asr_payload": asr_payload, "usage_seconds": None},
    )

    source_path = tmp_path / "semantic_disabled.mp4"
    req_dir = tmp_path / "req_semantic_disabled"
    source_path.write_bytes(b"source")
    req_dir.mkdir(parents=True, exist_ok=True)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "semantic-disabled@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        session.add(account)
        session.commit()

        lesson = lesson_service_module.LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="semantic_disabled.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
            semantic_split_enabled=False,
        )

        stored = session.query(LessonSentence).filter(LessonSentence.lesson_id == lesson.id).order_by(LessonSentence.idx.asc()).all()
        assert [item.text_en for item in stored] == ["Alpha beta", "Gamma delta"]
        assert [item.begin_ms for item in stored] == [0, 1200]
        assert [item.end_ms for item in stored] == [1200, 2600]
        assert lesson.subtitle_cache_seed["semantic_split_enabled"] is False
        assert lesson.subtitle_cache_seed["split_mode"] == "asr_sentences"
        assert lesson.subtitle_cache_seed["strategy_version"] == 2
    finally:
        session.close()


def test_generate_lesson_semantic_split_failure_falls_back_to_rule_split(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="semantic-fallback@example.com")

    from app.services import lesson_service as lesson_service_module
    from app.services.billing_service import (
        get_or_create_wallet_account,
        get_subtitle_settings,
    )
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
