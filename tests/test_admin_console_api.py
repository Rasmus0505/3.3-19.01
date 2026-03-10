from __future__ import annotations

from datetime import datetime

from sqlalchemy import select

from app.models import Lesson, User
from test_regression_api import _register_and_login, test_client


def test_admin_overview_returns_metrics_and_recent_rows(test_client):
    client, _, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "admin-overview@example.com")

    admin_token = _register_and_login(client, email="admin-overview@example.com")
    user_token = _register_and_login(client, email="overview-user@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    user_headers = {"Authorization": f"Bearer {user_token}"}

    create_batch = client.post(
        "/api/admin/redeem-batches",
        headers=admin_headers,
        json={
            "batch_name": "overview_batch",
            "face_value_points": 88,
            "generate_quantity": 2,
            "active_from": "2026-03-09T10:00:00+08:00",
            "expire_at": "2026-04-09T10:00:00+08:00",
            "remark": "overview",
        },
    )
    assert create_batch.status_code == 200
    code = create_batch.json()["generated_codes"][0]

    redeem = client.post("/api/wallet/redeem-code", headers=user_headers, json={"code": code})
    assert redeem.status_code == 200

    overview = client.get("/api/admin/overview", headers=admin_headers)
    assert overview.status_code == 200
    data = overview.json()

    assert data["ok"] is True
    assert data["metrics"]["today_new_users"] >= 2
    assert data["metrics"]["today_redeem_points"] >= 88
    assert data["metrics"]["active_batches"] >= 1
    assert len(data["recent_batches"]) >= 1
    assert any(item["action_type"] == "redeem_batch_create" for item in data["recent_operations"])


def test_admin_operation_logs_and_user_summary(test_client):
    client, session_factory, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "admin-console@example.com")

    admin_token = _register_and_login(client, email="admin-console@example.com")
    user_token = _register_and_login(client, email="console-user@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    user_headers = {"Authorization": f"Bearer {user_token}"}

    create_batch = client.post(
        "/api/admin/redeem-batches",
        headers=admin_headers,
        json={
            "batch_name": "console_batch",
            "face_value_points": 66,
            "generate_quantity": 1,
            "active_from": "2026-03-09T10:00:00+08:00",
            "expire_at": "2026-04-09T10:00:00+08:00",
            "remark": "console",
        },
    )
    assert create_batch.status_code == 200
    batch_id = create_batch.json()["batch"]["id"]
    code = create_batch.json()["generated_codes"][0]

    pause_batch = client.post(f"/api/admin/redeem-batches/{batch_id}/pause", headers=admin_headers)
    assert pause_batch.status_code == 200

    redeem_fail = client.post("/api/wallet/redeem-code", headers=user_headers, json={"code": code})
    assert redeem_fail.status_code == 400

    learner_id = None
    session = session_factory()
    try:
        learner = session.scalar(select(User).where(User.email == "console-user@example.com"))
        assert learner is not None
        learner_id = learner.id
        lesson = Lesson(
            user_id=learner.id,
            title="Console Lesson",
            source_filename="console.mp3",
            asr_model="qwen3-asr-flash-filetrans",
            duration_ms=1200,
            source_duration_ms=1200,
            status="ready",
            created_at=datetime(2026, 3, 9, 12, 0, 0),
        )
        session.add(lesson)
        session.commit()
    finally:
        session.close()

    operation_logs = client.get(
        "/api/admin/operation-logs",
        headers=admin_headers,
        params={"action_type": "redeem_batch_status_update"},
    )
    assert operation_logs.status_code == 200
    operation_data = operation_logs.json()
    assert operation_data["total"] >= 1
    assert any(item["action_type"] == "redeem_batch_status_update" for item in operation_data["items"])

    summary = client.get(f"/api/admin/users/{learner_id}/summary", headers=admin_headers)
    assert summary.status_code == 200
    summary_data = summary.json()["summary"]
    assert summary_data["lesson_count"] == 1
    assert summary_data["latest_lesson_created_at"] is not None
    assert summary_data["latest_wallet_event_at"] is None or isinstance(summary_data["latest_wallet_event_at"], str)


def test_admin_subtitle_settings_history_and_rollback(test_client):
    client, _, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "subtitle-history-admin@example.com")

    admin_token = _register_and_login(client, email="subtitle-history-admin@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    initial = client.get("/api/admin/subtitle-settings/history", headers=admin_headers)
    assert initial.status_code == 200
    initial_settings = initial.json()["current"]

    update_resp = client.put(
        "/api/admin/subtitle-settings",
        headers=admin_headers,
        json={
            "semantic_split_default_enabled": True,
            "subtitle_split_enabled": True,
            "subtitle_split_target_words": 15,
            "subtitle_split_max_words": 24,
            "semantic_split_max_words_threshold": 20,
            "semantic_split_timeout_seconds": 55,
            "translation_batch_max_chars": 2100,
        },
    )
    assert update_resp.status_code == 200

    history = client.get("/api/admin/subtitle-settings/history", headers=admin_headers)
    assert history.status_code == 200
    history_data = history.json()
    assert history_data["rollback_candidate"] is not None
    assert history_data["rollback_candidate"]["settings"]["subtitle_split_target_words"] == initial_settings["subtitle_split_target_words"]

    rollback = client.post("/api/admin/subtitle-settings/rollback-last", headers=admin_headers)
    assert rollback.status_code == 200
    rollback_settings = rollback.json()["settings"]
    assert rollback_settings["subtitle_split_target_words"] == initial_settings["subtitle_split_target_words"]
    assert rollback_settings["translation_batch_max_chars"] == initial_settings["translation_batch_max_chars"]
