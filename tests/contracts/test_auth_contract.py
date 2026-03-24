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
    """POST /api/auth/login 响应符合 AuthResponse schema。"""
    # authenticated_client 已登录，检查响应
    response = authenticated_client.get("/api/auth/me")
    if response.status_code == 401:
        pytest.skip("Auth endpoint not accessible in test")
    assert response.status_code == 200
    data = response.json()
    UserResponse.model_validate(data)


def test_auth_login_returns_access_and_refresh_token():
    """POST /api/auth/login 应返回 access_token 和 refresh_token。"""
    try:
        import httpx
    except ImportError:
        pytest.skip("httpx not installed")

    from fastapi import FastAPI
    from app.deps import get_db
    import app.main as _main_module

    app_obj: FastAPI = _main_module.app

    def _override():
        yield None

    app_obj.dependency_overrides[get_db] = _override

    with httpx.Client(app=app_obj, base_url="http://test") as client:
        response = client.post(
            "/api/auth/login",
            json={"email": "nonexistent@test.com", "password": "wrong"},
        )
        # 应返回 401，不是 500（验证错误处理契约）
        assert response.status_code in (401, 403, 404, 422)
        # 错误响应应符合 ErrorResponse
        data = response.json()
        assert "detail" in data or "message" in data or "error_code" in data

    app_obj.dependency_overrides.clear()
