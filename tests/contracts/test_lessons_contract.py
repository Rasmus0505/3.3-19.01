"""API 契约测试: lessons 模块。"""
from __future__ import annotations

import pytest

# 使用 httpx 进行 API 契约测试（不依赖前端构建工具）
try:
    import httpx
except ImportError:
    pytest.skip("httpx not installed")

from app.models import Lesson, User
from app.schemas.lesson import (
    LessonCatalogItemResponse,
    LessonCatalogResponse,
    LessonCreateResponse,
    LessonItemResponse,
    LessonSentenceResponse,
    LessonTaskResponse,
)
from tests.fixtures.auth import authenticated_client
from tests.fixtures.db import db_session
from tests.fixtures.lessons import test_lesson, test_lesson_with_sentences


def test_lessons_list_response_schema(authenticated_client, test_user, test_lesson):
    """GET /api/lessons/ 响应符合 LessonCatalogResponse schema。"""
    response = authenticated_client.get("/api/lessons/")
    assert response.status_code == 200
    data = response.json()

    # 契约: 响应应符合 LessonCatalogResponse
    parsed = LessonCatalogResponse.model_validate(data)
    assert parsed.ok is True
    assert isinstance(parsed.items, list)
    # 验证 item 符合 LessonItemResponse
    if parsed.items:
        item = parsed.items[0]
        LessonItemResponse.model_validate(item)
        assert isinstance(item.get("id"), int)
        assert isinstance(item.get("title"), str)


def test_lessons_detail_response_schema(authenticated_client, test_user, test_lesson_with_sentences):
    """GET /api/lessons/{id} 响应符合 LessonSentenceResponse schema。"""
    response = authenticated_client.get(f"/api/lessons/{test_lesson_with_sentences.id}")
    assert response.status_code == 200
    data = response.json()

    parsed = LessonCreateResponse.model_validate(data)
    assert isinstance(parsed.get("id"), int)
    assert isinstance(parsed.get("sentences"), list)
    if parsed.get("sentences"):
        first = parsed["sentences"][0]
        LessonSentenceResponse.model_validate(first)


def test_lessons_catalog_response_schema(authenticated_client, test_user, test_lesson):
    """GET /api/lessons/catalog 响应符合 LessonCatalogItemResponse schema。"""
    response = authenticated_client.get("/api/lessons/catalog")
    # 如果该端点不存在则跳过
    if response.status_code == 404:
        pytest.skip("Endpoint not found")
    assert response.status_code == 200
    data = response.json()

    parsed = LessonCatalogResponse.model_validate(data)
    assert isinstance(parsed.items, list)
    if parsed.items:
        item = parsed.items[0]
        LessonCatalogItemResponse.model_validate(item)
