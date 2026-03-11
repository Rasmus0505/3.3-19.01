from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base, create_database_engine, get_db
from app.main import create_app
from app.models import AdminOperationLog, User
from app.security import hash_password
from app.services.billing_service import ensure_default_billing_rates
from app.services.query_cache import clear_query_caches


@pytest.fixture()
def sql_console_client(tmp_path, monkeypatch):
    clear_query_caches()
    db_file = tmp_path / "sql_console.db"
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

    clear_query_caches()


def _register_and_login(client: TestClient, email: str = "sql-admin@example.com", password: str = "123456") -> str:
    reg = client.post("/api/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 200
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    return login.json()["access_token"]


def test_admin_sql_console_select_returns_rows_and_audits(sql_console_client):
    client, session_factory, monkeypatch = sql_console_client
    monkeypatch.setenv("ADMIN_EMAILS", "sql-admin@example.com")
    token = _register_and_login(client, email="sql-admin@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    prepare_resp = client.post("/api/admin/sql-console/prepare", headers=headers, json={"sql": "SELECT id, email FROM users ORDER BY id"})
    assert prepare_resp.status_code == 200
    prepare_payload = prepare_resp.json()
    assert prepare_payload["statement_mode"] == "read"
    assert prepare_payload["requires_confirmation"] is False

    execute_resp = client.post("/api/admin/sql-console/execute", headers=headers, json={"sql": "SELECT id, email FROM users ORDER BY id"})
    assert execute_resp.status_code == 200
    execute_payload = execute_resp.json()
    assert execute_payload["statement_mode"] == "read"
    assert execute_payload["row_count"] >= 1
    assert [item["name"] for item in execute_payload["columns"]] == ["id", "email"]
    assert execute_payload["rows"][0]["email"] == "sql-admin@example.com"

    session = session_factory()
    try:
        action_types = [row.action_type for row in session.scalars(select(AdminOperationLog).order_by(AdminOperationLog.id.asc())).all()]
    finally:
        session.close()

    assert action_types == ["sql_console_prepare", "sql_console_execute"]


def test_admin_sql_console_rejects_multi_statement_and_ddl(sql_console_client):
    client, session_factory, monkeypatch = sql_console_client
    monkeypatch.setenv("ADMIN_EMAILS", "sql-admin@example.com")
    token = _register_and_login(client, email="sql-admin@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    multi_resp = client.post("/api/admin/sql-console/prepare", headers=headers, json={"sql": "SELECT 1; SELECT 2"})
    assert multi_resp.status_code == 400
    assert multi_resp.json()["error_code"] == "INVALID_SQL"

    ddl_resp = client.post("/api/admin/sql-console/prepare", headers=headers, json={"sql": "DROP TABLE users"})
    assert ddl_resp.status_code == 400
    assert ddl_resp.json()["error_code"] == "INVALID_SQL"

    session = session_factory()
    try:
        logs = session.scalars(select(AdminOperationLog).order_by(AdminOperationLog.id.asc())).all()
    finally:
        session.close()

    assert len(logs) == 2
    assert all(item.action_type == "sql_console_prepare" for item in logs)


def test_admin_sql_console_requires_admin(sql_console_client):
    client, _, _ = sql_console_client
    token = _register_and_login(client, email="normal-user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.post("/api/admin/sql-console/prepare", headers=headers, json={"sql": "SELECT 1"})
    assert resp.status_code == 403


def test_admin_sql_console_write_requires_prepare_confirmation(sql_console_client):
    client, session_factory, monkeypatch = sql_console_client
    monkeypatch.setenv("ADMIN_EMAILS", "sql-admin@example.com")
    token = _register_and_login(client, email="sql-admin@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        session.add(User(email="target-user@example.com", password_hash=hash_password("123456")))
        session.commit()
    finally:
        session.close()

    execute_resp = client.post(
        "/api/admin/sql-console/execute",
        headers=headers,
        json={"sql": "UPDATE users SET email = 'target-user-2@example.com' WHERE email = 'target-user@example.com'"},
    )
    assert execute_resp.status_code == 400
    assert execute_resp.json()["error_code"] == "SQL_CONFIRMATION_REQUIRED"


def test_admin_sql_console_write_with_returning_executes_and_audits(sql_console_client):
    client, session_factory, monkeypatch = sql_console_client
    monkeypatch.setenv("ADMIN_EMAILS", "sql-admin@example.com")
    token = _register_and_login(client, email="sql-admin@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        session.add(User(email="writer-target@example.com", password_hash=hash_password("123456")))
        session.commit()
    finally:
        session.close()

    sql = "UPDATE users SET email = 'writer-target-updated@example.com' WHERE email = 'writer-target@example.com' RETURNING id, email"
    prepare_resp = client.post("/api/admin/sql-console/prepare", headers=headers, json={"sql": sql})
    assert prepare_resp.status_code == 200
    prepare_payload = prepare_resp.json()
    assert prepare_payload["statement_mode"] == "write"
    assert prepare_payload["requires_confirmation"] is True
    assert prepare_payload["confirm_token"]
    assert prepare_payload["confirm_text"] == "EXECUTE"

    execute_resp = client.post(
        "/api/admin/sql-console/execute",
        headers=headers,
        json={
            "sql": sql,
            "confirm_token": prepare_payload["confirm_token"],
            "confirm_text": prepare_payload["confirm_text"],
        },
    )
    assert execute_resp.status_code == 200
    execute_payload = execute_resp.json()
    assert execute_payload["statement_mode"] == "write"
    assert execute_payload["affected_rows"] == 1
    assert execute_payload["row_count"] == 1
    assert execute_payload["rows"][0]["email"] == "writer-target-updated@example.com"

    session = session_factory()
    try:
        updated = session.scalar(select(User).where(User.email == "writer-target-updated@example.com"))
        assert updated is not None
        logs = session.scalars(select(AdminOperationLog).order_by(AdminOperationLog.id.asc())).all()
    finally:
        session.close()

    assert [item.action_type for item in logs] == ["sql_console_prepare", "sql_console_execute"]
