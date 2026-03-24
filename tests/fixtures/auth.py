"""pytest fixtures: 认证相关。"""
from __future__ import annotations

import hashlib
import secrets
from typing import Generator

import pytest
from sqlalchemy.orm import Session


def _hash_password(password: str) -> str:
    """测试用密码哈希（兼容 app/security.py 格式）。"""
    salt = secrets.token_hex(16)
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000).hex() + "$" + salt


@pytest.fixture(scope="function")
def test_user(db_session: Session):
    """创建测试普通用户（每次测试后自动回滚）。"""
    from app.models import User

    user = User(
        email="test@example.com",
        password_hash=_hash_password("testpassword123"),
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
        password_hash=_hash_password("adminpassword123"),
        is_admin=True,
    )
    db_session.add(user)
    db_session.flush()
    return user


@pytest.fixture(scope="function")
def authenticated_client(db_session: Session, test_user) -> Generator:
    """返回已认证的 httpx ASGI Client（绕过 app.main 顶层导入）。"""
    try:
        import httpx
    except ImportError:
        pytest.skip("httpx not installed")

    def _override_get_db():
        yield db_session

    # 动态导入并配置 app，避免顶层 import app.main 触发循环导入
    from fastapi import FastAPI
    from app.deps import get_db

    import app.main as _main_module

    app_obj: FastAPI = _main_module.app
    app_obj.dependency_overrides[get_db] = _override_get_db

    with httpx.Client(app=app_obj, base_url="http://test") as client:
        response = client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "testpassword123"},
        )
        if response.status_code == 200:
            token = response.json().get("access_token", "")
            client.headers["Authorization"] = f"Bearer {token}"
        yield client

    app_obj.dependency_overrides.clear()
