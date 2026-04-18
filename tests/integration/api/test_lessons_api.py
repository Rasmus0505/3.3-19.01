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
    response = authenticated_client.get("/api/lessons")
    assert response.status_code == 200


def test_lessons_list_returns_items(authenticated_client, test_user, test_lesson):
    """GET /api/lessons/ 返回的 items 应包含测试课程。"""
    response = authenticated_client.get("/api/lessons")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    lesson_ids = [item["id"] for item in data]
    assert test_lesson.id in lesson_ids


def test_lessons_detail_returns_correct_sentence_count(authenticated_client, test_user, test_lesson_with_sentences):
    """GET /api/lessons/{id} 返回的 sentences 应为 5 条。"""
    response = authenticated_client.get(f"/api/lessons/{test_lesson_with_sentences.id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data.get("sentences", [])) == 5


def test_lessons_detail_includes_generation_status_defaults(authenticated_client, test_user, test_lesson_with_sentences):
    response = authenticated_client.get(f"/api/lessons/{test_lesson_with_sentences.id}")
    assert response.status_code == 200
    data = response.json()

    assert data["requested_generation_options"]["core_subtitles"] is True
    assert data["effective_generation_options"]["core_subtitles"] is True
    assert "generated_content_status" in data
    assert set(data["generated_content_status"].keys()) == {
        "core_subtitles",
        "zh_translation",
        "vocabulary_annotation",
        "word_explanation",
    }


def test_lessons_detail_404_for_nonexistent(authenticated_client, test_user):
    """GET /api/lessons/99999 应返回 404。"""
    response = authenticated_client.get("/api/lessons/99999")
    assert response.status_code == 404


def test_vocabulary_extract_from_sentences():
    """测试从句子中提取 Collins 词汇信息"""
    from app.services.lesson_service import extract_vocabulary_analysis_from_sentences

    sentences = [
        "The subsequent transformation of urban landscapes continues.",
        "The cat is on the table."
    ]

    results = extract_vocabulary_analysis_from_sentences(sentences, "3")

    # 第一个句子应该有 subsequent (C2 > 3) 和 transformation (3 not > 3)
    assert results[0]["needs_explanation"] is True
    assert any(w["word"] == "subsequent" for w in results[0]["words_above"])

    # 第二个句子没有高于 3 的词
    assert results[1]["needs_explanation"] is False


