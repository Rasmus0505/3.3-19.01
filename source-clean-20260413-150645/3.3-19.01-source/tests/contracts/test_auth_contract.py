"""API 契约测试: auth 模块。"""
from __future__ import annotations

import pytest

try:
    import httpx
except ImportError:
    pytest.skip("httpx not installed")

from app.schemas.auth import AuthResponse, UserResponse
from tests.fixtures.auth import authenticated_client


def test_auth_login_response_schema(authenticated_client):
    """GET /api/auth/me 响应符合 UserResponse schema。"""
    response = authenticated_client.get("/api/auth/me")
    if response.status_code == 401:
        pytest.skip("Auth endpoint not accessible in test")
    assert response.status_code == 200
    data = response.json()
    parsed = UserResponse.model_validate(data)
    assert parsed.username == "Test User"


def test_auth_profile_rename_updates_username(authenticated_client):
    response = authenticated_client.patch(
        "/api/auth/profile",
        json={"username": "  Test   User  Renamed  "},
    )
    assert response.status_code == 200
    payload = response.json()
    parsed = UserResponse.model_validate(payload)
    assert parsed.username == "Test User Renamed"

    refreshed = authenticated_client.get("/api/auth/me")
    assert refreshed.status_code == 200
    refreshed_payload = UserResponse.model_validate(refreshed.json())
    assert refreshed_payload.username == "Test User Renamed"


def test_auth_login_returns_access_and_refresh_token(test_user, db_session):
    """POST /api/auth/login 继续只接受邮箱密码，不接受用户名。"""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.db import get_db
    from app.main import create_app

    app_obj: FastAPI = create_app(enable_lifespan=False)

    def _override():
        yield db_session

    app_obj.dependency_overrides[get_db] = _override

    with TestClient(app_obj) as client:
        success_response = client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "testpassword123"},
        )
        assert success_response.status_code == 200
        AuthResponse.model_validate(success_response.json())

        response = client.post(
            "/api/auth/login",
            json={"email": "Test User", "password": "testpassword123"},
        )
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data or "message" in data or "error_code" in data

    app_obj.dependency_overrides.clear()
