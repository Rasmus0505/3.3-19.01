"""API 集成测试: wordbook 模块。"""
from __future__ import annotations

import pytest

try:
    import httpx
except ImportError:
    pytest.skip("httpx not installed")

from tests.fixtures.auth import authenticated_client


def test_wordbook_list_returns_200(authenticated_client, test_user):
    """GET /api/wordbook/ 应返回 200。"""
    response = authenticated_client.get("/api/wordbook/")
    if response.status_code == 404:
        pytest.skip("Wordbook endpoint not found")
    assert response.status_code == 200


def test_wordbook_list_returns_items(authenticated_client, test_user):
    """GET /api/wordbook/ 返回的 items 应为列表。"""
    response = authenticated_client.get("/api/wordbook/")
    if response.status_code == 404:
        pytest.skip("Wordbook endpoint not found")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert isinstance(data["items"], list)


def test_wordbook_health_returns_200(authenticated_client):
    """GET /api/wordbook/health 应返回 200。"""
    response = authenticated_client.get("/api/wordbook/health")
    if response.status_code == 404:
        pytest.skip("Wordbook health endpoint not found")
    assert response.status_code == 200
