"""API 集成测试: LLM 句子讲解端点。"""
from __future__ import annotations

from unittest.mock import patch


def test_explain_sentence_endpoint(authenticated_client, db_session, test_user):
    """测试讲解生成端点"""
    with patch("app.services.cefr_explain_service.CefrExplainService.generate_explanation") as mock_generate:
        mock_generate.return_value = {
            "simplified_sentence": "The changing of urban areas continues.",
            "key_explanations": [
                {"original_word": "transformation", "explanation": "the process of changing"},
                {"original_word": "urban", "explanation": "related to cities"},
            ],
            "listen_tips": "Focus on the overall meaning rather than individual words.",
        }

        payload = {
            "sentence": "The transformation of urban landscapes continues.",
            "words_above": [
                {"word": "transformation", "level": "C1"},
                {"word": "urban", "level": "B2"},
                {"word": "landscapes", "level": "C1"},
            ],
            "target_level": "B1",
        }

        response = authenticated_client.post(
            "/api/llm/explain-sentence",
            json=payload,
        )

        assert response.status_code == 200
        data = response.json()

        assert "simplified_sentence" in data
        assert "key_explanations" in data
        assert "listen_tips" in data
        # 简化句应该比原句更简单
        assert len(data["simplified_sentence"]) > 0
        assert len(data["key_explanations"]) > 0


def test_explain_sentence_no_high_level(authenticated_client, db_session, test_user):
    """测试没有高等级词汇的句子"""
    with patch("app.services.cefr_explain_service.CefrExplainService.generate_explanation") as mock_generate:
        mock_generate.return_value = {
            "simplified_sentence": "The cat is sleeping on the bed.",
            "key_explanations": [],
            "listen_tips": "",
        }

        payload = {
            "sentence": "The cat is sleeping on the bed.",
            "words_above": [],
            "target_level": "B1",
        }

        response = authenticated_client.post(
            "/api/llm/explain-sentence",
            json=payload,
        )

        assert response.status_code == 200
        data = response.json()
        # 没有高等级词汇时应返回原句
        assert data["simplified_sentence"] == payload["sentence"]


def test_explain_sentence_invalid_level(authenticated_client, db_session, test_user):
    """测试无效的 CEFR 等级"""
    payload = {
        "sentence": "The transformation of urban landscapes continues.",
        "words_above": [{"word": "transformation", "level": "C1"}],
        "target_level": "INVALID",
    }

    response = authenticated_client.post(
        "/api/llm/explain-sentence",
        json=payload,
    )

    assert response.status_code == 422


def test_explain_sentence_too_long(authenticated_client, db_session, test_user):
    """测试句子过长"""
    payload = {
        "sentence": "A" * 4000,
        "words_above": [],
        "target_level": "B1",
    }

    response = authenticated_client.post(
        "/api/llm/explain-sentence",
        json=payload,
    )

    assert response.status_code == 422
