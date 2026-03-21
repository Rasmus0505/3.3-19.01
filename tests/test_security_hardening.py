from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base, create_database_engine, get_db
from app.core.config import resolve_database_url
from app.main import create_app
from app.models import User


def _build_test_client(tmp_path):
    db_file = tmp_path / "security_hardening.db"
    engine = create_database_engine(f"sqlite:///{db_file}")
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, future=True)

    app = create_app(enable_lifespan=False)

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app), session_factory, engine


def _register_and_login(client: TestClient, *, email: str, password: str = "123456") -> str:
    register_resp = client.post("/api/auth/register", json={"email": email, "password": password})
    assert register_resp.status_code == 200
    login_resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login_resp.status_code == 200
    return str(login_resp.json()["access_token"])


def test_register_response_defaults_to_non_admin(tmp_path, monkeypatch):
    client, _, engine = _build_test_client(tmp_path)
    try:
        resp = client.post("/api/auth/register", json={"email": "user@example.com", "password": "123456"})
        assert resp.status_code == 200
        assert resp.json()["user"]["is_admin"] is False
    finally:
        client.close()
        engine.dispose()


def test_production_runtime_disables_admin_email_fallback(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ADMIN_EMAILS", "prod-admin@example.com")
    monkeypatch.setenv("DATABASE_URL", "postgresql://root:password@db.example.com:5432/app")

    client, _, engine = _build_test_client(tmp_path)
    try:
        token = _register_and_login(client, email="prod-admin@example.com")
        resp = client.get("/api/admin/users", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403
    finally:
        client.close()
        engine.dispose()


def test_security_status_and_admin_role_changes(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "bootstrap-admin@example.com")
    monkeypatch.setenv("REDEEM_CODE_EXPORT_CONFIRM_TEXT", "Grant-Admin-Confirm-2026!")

    client, session_factory, engine = _build_test_client(tmp_path)
    try:
        admin_token = _register_and_login(client, email="bootstrap-admin@example.com")
        user_token = _register_and_login(client, email="member@example.com")

        session = session_factory()
        try:
            admin_user = session.query(User).filter(User.email == "bootstrap-admin@example.com").one()
            target_user = session.query(User).filter(User.email == "member@example.com").one()
            admin_user.is_admin = True
            session.add(admin_user)
            session.commit()
            admin_user_id = int(admin_user.id)
            target_user_id = int(target_user.id)
        finally:
            session.close()

        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        user_headers = {"Authorization": f"Bearer {user_token}"}

        status_resp = client.get("/api/admin/security/status", headers=admin_headers)
        assert status_resp.status_code == 200
        status_payload = status_resp.json()
        assert status_payload["database"]["sqlite_in_use"] is True
        assert status_payload["export_protection"]["confirm_text_strong"] is True
        assert status_payload["admin_access"]["runtime_authorization_mode"] == "db_role"

        forbidden_before = client.get("/api/admin/users", headers=user_headers)
        assert forbidden_before.status_code == 403

        grant_resp = client.post(
            f"/api/admin/users/{target_user_id}/grant-admin",
            headers=admin_headers,
            json={
                "confirm_text": "Grant-Admin-Confirm-2026!",
                "confirm_email": "member@example.com",
                "reason": "security test",
            },
        )
        assert grant_resp.status_code == 200
        assert grant_resp.json()["is_admin"] is True

        elevated_resp = client.get("/api/admin/users", headers=user_headers)
        assert elevated_resp.status_code == 200

        revoke_resp = client.post(
            f"/api/admin/users/{target_user_id}/revoke-admin",
            headers=admin_headers,
            json={
                "confirm_text": "Grant-Admin-Confirm-2026!",
                "confirm_email": "member@example.com",
                "reason": "security test",
            },
        )
        assert revoke_resp.status_code == 200
        assert revoke_resp.json()["is_admin"] is False

        last_admin_resp = client.post(
            f"/api/admin/users/{admin_user_id}/revoke-admin",
            headers=admin_headers,
            json={
                "confirm_text": "Grant-Admin-Confirm-2026!",
                "confirm_email": "bootstrap-admin@example.com",
                "reason": "should fail",
            },
        )
        assert last_admin_resp.status_code == 400
        assert last_admin_resp.json()["error_code"] == "LAST_ADMIN_PROTECTED"
    finally:
        client.close()
        engine.dispose()


def test_resolve_database_url_requires_external_db_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./app.db")
    try:
        resolve_database_url()
    except RuntimeError as exc:
        assert "sqlite" in str(exc).lower()
    else:
        raise AssertionError("expected resolve_database_url to reject sqlite in production")
