"""API 集成测试: lessons 模块。"""
from __future__ import annotations

import pytest

try:
    import httpx
except ImportError:
    pytest.skip("httpx not installed")

from app.models import Lesson
from tests.fixtures.auth import authenticated_client
from tests.fixtures.lessons import test_lesson, test_lesson_with_sentences


def test_lessons_list_returns_200(authenticated_client, test_user, test_lesson):
    """GET /api/lessons/ 应返回 200。"""
    response = authenticated_client.get("/api/lessons/")
    assert response.status_code == 200


def test_lessons_list_returns_items(authenticated_client, test_user, test_lesson):
    """GET /api/lessons/ 返回的 items 应包含测试课程。"""
    response = authenticated_client.get("/api/lessons/")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    lesson_ids = [item["id"] for item in data["items"]]
    assert test_lesson.id in lesson_ids


def test_lessons_detail_returns_correct_sentence_count(authenticated_client, test_user, test_lesson_with_sentences):
    """GET /api/lessons/{id} 返回的 sentences 应为 5 条。"""
    response = authenticated_client.get(f"/api/lessons/{test_lesson_with_sentences.id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data.get("sentences", [])) == 5


def test_lessons_detail_404_for_nonexistent(authenticated_client, test_user):
    """GET /api/lessons/99999 应返回 404。"""
    response = authenticated_client.get("/api/lessons/99999")
    assert response.status_code == 404
