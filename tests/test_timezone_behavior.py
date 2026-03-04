from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.timezone import now_shanghai_naive, to_shanghai_aware
from app.db import Base, get_db
from app.main import create_app
from app.models import Lesson, LessonProgress, User, WalletAccount, WalletLedger
from app.services.billing_service import ensure_default_billing_rates


@pytest.fixture()
def timezone_client(tmp_path, monkeypatch):
    db_file = tmp_path / "timezone_test.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False}, future=True)
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
    register = client.post("/api/auth/register", json={"email": email, "password": password})
    assert register.status_code == 200 or (
        register.status_code == 400 and register.json().get("error_code") == "EMAIL_EXISTS"
    )
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    return login.json()["access_token"]


def _assert_plus_eight(iso_value: str) -> None:
    parsed = datetime.fromisoformat(iso_value)
    assert parsed.tzinfo is not None
    assert parsed.utcoffset() == timedelta(hours=8)


def test_new_data_written_as_shanghai_naive(timezone_client):
    client, session_factory, monkeypatch = timezone_client

    user_email = "tz-user@example.com"
    _register_and_login(client, user_email)

    session = session_factory()
    try:
        user = session.scalar(select(User).where(User.email == user_email))
        account = session.scalar(select(WalletAccount).where(WalletAccount.user_id == user.id))
        now = now_shanghai_naive()

        for dt in [user.created_at, account.created_at, account.updated_at]:
            assert dt.tzinfo is None
            assert abs((now - dt).total_seconds()) < 180
    finally:
        session.close()

    monkeypatch.setenv("ADMIN_EMAILS", "tz-admin@example.com")
    admin_token = _register_and_login(client, "tz-admin@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    users_resp = client.get("/api/admin/users", headers=admin_headers)
    assert users_resp.status_code == 200
    target_user = next(item for item in users_resp.json()["items"] if item["email"] == user_email)

    adjust_resp = client.post(
        f"/api/admin/users/{target_user['id']}/wallet-adjust",
        headers=admin_headers,
        json={"delta_points": 88, "reason": "timezone verification"},
    )
    assert adjust_resp.status_code == 200

    session = session_factory()
    try:
        latest_ledger = session.scalar(
            select(WalletLedger).where(WalletLedger.user_id == target_user["id"]).order_by(WalletLedger.id.desc())
        )
        now = now_shanghai_naive()
        assert latest_ledger is not None
        assert latest_ledger.created_at.tzinfo is None
        assert abs((now - latest_ledger.created_at).total_seconds()) < 180
    finally:
        session.close()


def test_api_time_fields_use_plus_eight_offset(timezone_client):
    client, session_factory, monkeypatch = timezone_client
    monkeypatch.setenv("ADMIN_EMAILS", "tz-admin2@example.com")

    user_email = "tz-api-user@example.com"
    register_resp = client.post("/api/auth/register", json={"email": user_email, "password": "123456"})
    assert register_resp.status_code == 200
    _assert_plus_eight(register_resp.json()["user"]["created_at"])

    user_token = _register_and_login(client, user_email)
    admin_token = _register_and_login(client, "tz-admin2@example.com")
    user_headers = {"Authorization": f"Bearer {user_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    wallet_resp = client.get("/api/wallet/me", headers=user_headers)
    assert wallet_resp.status_code == 200
    _assert_plus_eight(wallet_resp.json()["updated_at"])

    rates_resp = client.get("/api/billing/rates")
    assert rates_resp.status_code == 200
    assert rates_resp.json()["rates"]
    _assert_plus_eight(rates_resp.json()["rates"][0]["updated_at"])

    users_resp = client.get("/api/admin/users", headers=admin_headers)
    assert users_resp.status_code == 200
    target_user = next(item for item in users_resp.json()["items"] if item["email"] == user_email)
    _assert_plus_eight(target_user["created_at"])

    adjust_resp = client.post(
        f"/api/admin/users/{target_user['id']}/wallet-adjust",
        headers=admin_headers,
        json={"delta_points": 30, "reason": "api offset check"},
    )
    assert adjust_resp.status_code == 200

    logs_resp = client.get("/api/admin/wallet-logs", headers=admin_headers, params={"user_email": user_email})
    assert logs_resp.status_code == 200
    assert logs_resp.json()["items"]
    _assert_plus_eight(logs_resp.json()["items"][0]["created_at"])

    session = session_factory()
    try:
        user = session.scalar(select(User).where(User.email == user_email))
        lesson = Lesson(
            user_id=user.id,
            title="timezone lesson",
            source_filename="timezone.mp4",
            asr_model="paraformer-v2",
            duration_ms=1000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
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

    lessons_resp = client.get("/api/lessons", headers=user_headers)
    assert lessons_resp.status_code == 200
    matching = next(item for item in lessons_resp.json() if item["id"] == lesson_id)
    _assert_plus_eight(matching["created_at"])

    progress_resp = client.get(f"/api/lessons/{lesson_id}/progress", headers=user_headers)
    assert progress_resp.status_code == 200
    _assert_plus_eight(progress_resp.json()["updated_at"])


def test_wallet_logs_filters_accept_plus_eight_and_naive(timezone_client):
    client, session_factory, monkeypatch = timezone_client
    monkeypatch.setenv("ADMIN_EMAILS", "tz-admin3@example.com")

    user_email = "tz-filter-user@example.com"
    user_token = _register_and_login(client, user_email)
    admin_token = _register_and_login(client, "tz-admin3@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    users_resp = client.get("/api/admin/users", headers=admin_headers)
    assert users_resp.status_code == 200
    target_user = next(item for item in users_resp.json()["items"] if item["email"] == user_email)

    adjust_resp = client.post(
        f"/api/admin/users/{target_user['id']}/wallet-adjust",
        headers=admin_headers,
        json={"delta_points": 12, "reason": "date filter check"},
    )
    assert adjust_resp.status_code == 200

    session = session_factory()
    try:
        ledger = session.scalar(
            select(WalletLedger).where(WalletLedger.user_id == target_user["id"]).order_by(WalletLedger.id.desc())
        )
        assert ledger is not None
        from_plus8 = to_shanghai_aware(ledger.created_at - timedelta(minutes=1)).isoformat()
        to_plus8 = to_shanghai_aware(ledger.created_at + timedelta(minutes=1)).isoformat()
        from_naive = (ledger.created_at - timedelta(minutes=1)).isoformat(timespec="seconds")
        to_naive = (ledger.created_at + timedelta(minutes=1)).isoformat(timespec="seconds")
        ledger_id = ledger.id
    finally:
        session.close()

    plus8_resp = client.get(
        "/api/admin/wallet-logs",
        headers=admin_headers,
        params={
            "user_email": user_email,
            "date_from": from_plus8,
            "date_to": to_plus8,
            "page_size": 50,
        },
    )
    assert plus8_resp.status_code == 200
    assert any(item["id"] == ledger_id for item in plus8_resp.json()["items"])

    naive_resp = client.get(
        "/api/admin/wallet-logs",
        headers=admin_headers,
        params={
            "user_email": user_email,
            "date_from": from_naive,
            "date_to": to_naive,
            "page_size": 50,
        },
    )
    assert naive_resp.status_code == 200
    assert any(item["id"] == ledger_id for item in naive_resp.json()["items"])

    wallet_resp = client.get("/api/wallet/me", headers={"Authorization": f"Bearer {user_token}"})
    assert wallet_resp.status_code == 200
