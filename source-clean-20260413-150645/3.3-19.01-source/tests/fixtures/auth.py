"""pytest fixtures: 认证相关。"""
from __future__ import annotations

from typing import Generator

import pytest
from sqlalchemy.orm import Session

from app.repositories.user import canonicalize_username, normalize_username
from app.security import hash_password


@pytest.fixture(scope="function")
def test_user(db_session: Session):
    """创建测试普通用户（每次测试后自动回滚）。"""
    from app.models import User

    user = User(
        email="test@example.com",
        username=canonicalize_username("Test User"),
        username_normalized=normalize_username("Test User"),
        password_hash=hash_password("testpassword123"),
        is_admin=False,
    )
    db_session.add(user)
    db_session.flush()
    return user


@pytest.fixture(scope="function")
def admin_user(db_session: Session):
    """创建测试管理员用户（每次测试后自动回滚）。"""
    from app.models import User

    user = User(
        email="admin@example.com",
        username=canonicalize_username("Admin User"),
        username_normalized=normalize_username("Admin User"),
        password_hash=hash_password("adminpassword123"),
        is_admin=True,
    )
    db_session.add(user)
    db_session.flush()
    return user


@pytest.fixture(scope="function")
def authenticated_client(db_session: Session, test_user) -> Generator:
    """返回已认证的 httpx ASGI Client（绕过 app.main 顶层导入）。"""
    def _override_get_db():
        yield db_session

    # 动态导入并配置 app，避免顶层 import app.main 触发循环导入
    from fastapi import FastAPI
    from app.db import get_db
    from fastapi.testclient import TestClient

    from app.main import create_app

    app_obj: FastAPI = create_app(enable_lifespan=False)
    app_obj.dependency_overrides[get_db] = _override_get_db

    with TestClient(app_obj) as client:
        response = client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "testpassword123"},
        )
        if response.status_code == 200:
            token = response.json().get("access_token", "")
            client.headers["Authorization"] = f"Bearer {token}"
        yield client

    app_obj.dependency_overrides.clear()
