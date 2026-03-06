from __future__ import annotations

import io
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base, create_database_engine, get_db
from app.main import create_app
from app.models import Lesson, LessonProgress, LessonSentence, User
from app.services.billing_service import ensure_default_billing_rates


@pytest.fixture()
def e2e_client(tmp_path, monkeypatch):
    db_file = tmp_path / "e2e_app.db"
    engine = create_database_engine(f"sqlite:///{db_file}")
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, future=True)

    Base.metadata.create_all(bind=engine)

    seed = testing_session()
    try:
        ensure_default_billing_rates(seed)
    finally:
        seed.close()

    app = create_app(enable_lifespan=False)

    def override_get_db():
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as client:
        yield client, testing_session, monkeypatch


def _register_and_login(client: TestClient, email: str, password: str = "123456") -> str:
    reg = client.post("/api/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 200
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    return login.json()["access_token"]


def _stub_lesson_generation(monkeypatch):
    from app.api.routers import lessons as lesson_router

    def fake_generate(upload_file, req_dir, owner_id, asr_model, db):
        lesson = Lesson(
            user_id=owner_id,
            title="e2e lesson",
            source_filename="e2e.mp4",
            asr_model=asr_model,
            duration_ms=1000,
            media_storage="client_indexeddb",
            source_duration_ms=1000,
            status="ready",
        )
        db.add(lesson)
        db.flush()
        db.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=800,
                text_en="hello world",
                text_zh="你好 世界",
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
        return lesson

    monkeypatch.setattr(lesson_router.LessonService, "generate_from_upload", fake_generate)


def test_e2e_login_create_lesson_practice_progress(e2e_client):
    client, _, monkeypatch = e2e_client
    _stub_lesson_generation(monkeypatch)

    token = _register_and_login(client, email="learner-e2e@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    create_resp = client.post(
        "/api/lessons",
        headers=headers,
        files={"video_file": ("demo.mp4", io.BytesIO(b"dummy"), "video/mp4")},
        data={"asr_model": "paraformer-v2"},
    )
    assert create_resp.status_code == 200
    lesson = create_resp.json()["lesson"]
    lesson_id = lesson["id"]
    assert lesson["title"] == "e2e lesson"
    assert lesson["media_storage"] == "client_indexeddb"
    assert lesson["source_duration_ms"] == 1000
    assert lesson["sentences"][0]["audio_url"] is None

    check_resp = client.post(
        f"/api/lessons/{lesson_id}/check",
        headers=headers,
        json={"sentence_index": 0, "user_tokens": ["hello", "world"]},
    )
    assert check_resp.status_code == 200
    assert check_resp.json()["passed"] is True

    update_resp = client.post(
        f"/api/lessons/{lesson_id}/progress",
        headers=headers,
        json={"current_sentence_index": 0, "completed_sentence_indexes": [0], "last_played_at_ms": 750},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["completed_sentence_indexes"] == [0]

    get_resp = client.get(f"/api/lessons/{lesson_id}/progress", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["completed_sentence_indexes"] == [0]


def test_e2e_admin_adjust_wallet_and_logs(e2e_client):
    client, _, monkeypatch = e2e_client
    monkeypatch.setenv("ADMIN_EMAILS", "admin-e2e@example.com")

    learner_token = _register_and_login(client, email="wallet-user@example.com")
    admin_token = _register_and_login(client, email="admin-e2e@example.com")
    learner_headers = {"Authorization": f"Bearer {learner_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    wallet_before = client.get("/api/wallet/me", headers=learner_headers)
    assert wallet_before.status_code == 200
    before_points = wallet_before.json()["balance_points"]

    users_resp = client.get("/api/admin/users", headers=admin_headers)
    assert users_resp.status_code == 200
    learner = next(item for item in users_resp.json()["items"] if item["email"] == "wallet-user@example.com")

    adjust_resp = client.post(
        f"/api/admin/users/{learner['id']}/wallet-adjust",
        headers=admin_headers,
        json={"delta_points": 120, "reason": "e2e topup"},
    )
    assert adjust_resp.status_code == 200
    assert adjust_resp.json()["balance_points"] == before_points + 120

    wallet_after = client.get("/api/wallet/me", headers=learner_headers)
    assert wallet_after.status_code == 200
    assert wallet_after.json()["balance_points"] == before_points + 120

    logs_resp = client.get("/api/admin/wallet-logs", params={"user_email": "wallet-user@example.com"}, headers=admin_headers)
    assert logs_resp.status_code == 200
    assert logs_resp.json()["total"] >= 1
    assert any(item["event_type"] == "manual_adjust" and item["delta_points"] == 120 for item in logs_resp.json()["items"])


def test_e2e_admin_update_rate_visible_in_public_api(e2e_client):
    client, _, monkeypatch = e2e_client
    monkeypatch.setenv("ADMIN_EMAILS", "admin-rate@example.com")

    admin_token = _register_and_login(client, email="admin-rate@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    update_resp = client.put(
        "/api/admin/billing-rates/paraformer-v2",
        headers=admin_headers,
        json={"points_per_minute": 222, "is_active": True},
    )
    assert update_resp.status_code == 200
    rate = update_resp.json()["rates"][0]
    assert rate["model_name"] == "paraformer-v2"
    assert rate["points_per_minute"] == 222

    public_resp = client.get("/api/billing/rates")
    assert public_resp.status_code == 200
    target = next(item for item in public_resp.json()["rates"] if item["model_name"] == "paraformer-v2")
    assert target["points_per_minute"] == 222
    assert target["is_active"] is True


def test_e2e_redeem_batch_pause_blocks_redeem(e2e_client):
    client, _, monkeypatch = e2e_client
    monkeypatch.setenv("ADMIN_EMAILS", "admin-redeem@example.com")

    admin_token = _register_and_login(client, email="admin-redeem@example.com")
    user_token = _register_and_login(client, email="redeem-e2e-user@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    user_headers = {"Authorization": f"Bearer {user_token}"}

    now = datetime.utcnow()
    create_resp = client.post(
        "/api/admin/redeem-batches",
        headers=admin_headers,
        json={
            "batch_name": "e2e_redeem_batch",
            "face_value_points": 88,
            "generate_quantity": 1,
            "active_from": now.isoformat(),
            "expire_at": (now + timedelta(days=1)).isoformat(),
        },
    )
    assert create_resp.status_code == 200
    data = create_resp.json()
    batch_id = data["batch"]["id"]
    code = data["generated_codes"][0]

    pause_resp = client.post(f"/api/admin/redeem-batches/{batch_id}/pause", headers=admin_headers)
    assert pause_resp.status_code == 200
    assert pause_resp.json()["batch"]["status"] == "paused"

    redeem_resp = client.post("/api/wallet/redeem-code", headers=user_headers, json={"code": code})
    assert redeem_resp.status_code == 400
    assert redeem_resp.json()["error_code"] == "REDEEM_CODE_DISABLED"
