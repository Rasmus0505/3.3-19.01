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
from app.models import Lesson, LessonProgress, LessonSentence, MediaAsset, User, WalletLedger
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
            asr_model="paraformer-v2",
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
            asr_model="paraformer-v2",
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
            model_name="paraformer-v2",
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
        return lesson

    monkeypatch.setattr(lesson_router.LessonService, "generate_from_upload", fake_generate)

    files = {"video_file": ("demo.mp4", io.BytesIO(b"dummy"), "video/mp4")}
    data = {"asr_model": "paraformer-v2"}
    resp = client.post("/api/lessons", headers=headers, files=files, data=data)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["lesson"]["title"] == "fake lesson"
    assert body["lesson"]["media_storage"] == "client_indexeddb"
    assert body["lesson"]["source_duration_ms"] == 1234
    assert body["lesson"]["sentences"][0]["audio_url"] is None


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
            asr_model="paraformer-v2",
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
