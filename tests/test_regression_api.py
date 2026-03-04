from __future__ import annotations

import io
import os
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base, get_db
from app.main import create_app
from app.models import Lesson, LessonProgress, LessonSentence, MediaAsset, User
from app.services.billing_service import ensure_default_billing_rates


@pytest.fixture()
def test_client(tmp_path, monkeypatch):
    db_file = tmp_path / "test_app.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False}, future=True)
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

    users = client.get("/api/admin/users", headers=headers)
    assert users.status_code == 200
    assert "items" in users.json()

    logs = client.get("/api/admin/wallet-logs", headers=headers)
    assert logs.status_code == 200
    assert "items" in logs.json()


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
            asr_model="paraformer-v2",
            duration_ms=10000,
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


def test_create_lesson_endpoint_with_stubbed_service(test_client, monkeypatch):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="creator@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.api.routers import lessons as lesson_router

    def fake_generate(upload_file, req_dir, owner_id, asr_model, db):
        lesson = Lesson(
            user_id=owner_id,
            title="fake lesson",
            source_filename="fake.mp4",
            asr_model=asr_model,
            duration_ms=1000,
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
                audio_clip_path="/tmp/fake.opus",
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

    files = {"video_file": ("demo.mp4", io.BytesIO(b"dummy"), "video/mp4")}
    data = {"asr_model": "paraformer-v2"}
    resp = client.post("/api/lessons", headers=headers, files=files, data=data)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["lesson"]["title"] == "fake lesson"


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
            asr_model="paraformer-v2",
            duration_ms=5000,
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
