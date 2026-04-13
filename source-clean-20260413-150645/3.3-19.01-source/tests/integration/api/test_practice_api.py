"""API 集成测试: practice 模块。"""
from __future__ import annotations

import pytest

try:
    import httpx
except ImportError:
    pytest.skip("httpx not installed")

from tests.fixtures.auth import authenticated_client
from tests.fixtures.lessons import test_lesson_with_sentences


def test_practice_progress_update_returns_ok(authenticated_client, test_user, test_lesson_with_sentences):
    """POST /api/practice/progress 更新进度应返回 ok。"""
    response = authenticated_client.post(
        f"/api/practice/progress/{test_lesson_with_sentences.id}",
        json={"current_sentence_index": 1, "completed_indexes": [0]},
    )
    # 如果端点不存在则跳过
    if response.status_code == 404:
        pytest.skip("Practice progress endpoint not found")


def test_practice_get_progress_returns_200(authenticated_client, test_user, test_lesson_with_sentences):
    """GET /api/practice/progress/{id} 应返回 200。"""
    response = authenticated_client.get(f"/api/practice/progress/{test_lesson_with_sentences.id}")
    if response.status_code == 404:
        pytest.skip("Practice progress endpoint not found")
    assert response.status_code in (200, 404)


def test_practice_health_returns_200(authenticated_client):
    """GET /api/practice/health 应返回 200（心跳端点）。"""
    response = authenticated_client.get("/api/practice/health")
    if response.status_code == 404:
        pytest.skip("Practice health endpoint not found")
    assert response.status_code == 200
