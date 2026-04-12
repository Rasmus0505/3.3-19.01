"""Tests for LLM rewrite endpoints (Phase 34: Prompt Optimization)."""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch

try:
    from httpx import AsyncClient
    from fastapi.testclient import TestClient
except ImportError:
    pytest.skip("httpx not installed")


# ── Fixtures ──────────────────────────────────────────────────────────────

@pytest.fixture
def mock_user():
    user = MagicMock()
    user.id = 1
    return user


@pytest.fixture
def client(mock_user):
    """返回已认证的同步 TestClient。"""
    from app.main import create_app
    from app.db import get_db
    from app.models import User
    from app.security import hash_password
    from app.repositories.user import canonicalize_username, normalize_username

    app = create_app(enable_lifespan=False)

    # 创建一个测试用户
    from sqlalchemy.orm import Session
    def _get_test_db():
        from tests.fixtures.db import db_engine
        from sqlalchemy.orm import sessionmaker
        connection = db_engine.__enter__()
        transaction = connection.begin()
        SessionLocal = sessionmaker(bind=connection)
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()
            transaction.rollback()
            connection.close()

    # Override auth to return mock user for simplicity
    def _override_auth():
        return mock_user

    from app.api.deps.auth import get_current_user
    app.dependency_overrides[get_current_user] = _override_auth

    with TestClient(app) as tc:
        yield tc

    app.dependency_overrides.clear()


# ── /estimate-tokens tests ─────────────────────────────────────────────────

class TestEstimateTokens:
    def test_returns_estimated_tokens(self, client):
        """GET /api/llm/estimate-tokens 应返回估算值。"""
        with patch("app.api.routers.llm.get_model_rate") as mock_rate:
            mock_rate.return_value = MagicMock(points_per_1k_tokens=5)
            response = client.get("/api/llm/estimate-tokens", params={"text": "Hello world"})
            assert response.status_code == 200
            data = response.json()
            assert data["ok"] is True
            assert "estimated_tokens" in data
            assert "estimated_charge_cents" in data
            assert "estimated_charge_yuan" in data
            assert data["char_count"] == 11

    def test_requires_auth(self):
        """未认证请求应返回 403（中间件默认行为）。"""
        from app.main import create_app
        app = create_app(enable_lifespan=False)
        with TestClient(app) as tc:
            response = tc.get("/api/llm/estimate-tokens", params={"text": "test"})
            assert response.status_code in (401, 403)


# ── /extract-lemmas tests ────────────────────────────────────────────────

class TestExtractLemmas:
    def test_falls_back_to_local_lemmatizer_when_llm_returns_invalid_json(self, client):
        """POST /api/llm/extract-lemmas 在模型返回脏格式时应使用本地还原兜底。"""
        with patch("app.api.routers.llm.ensure_default_billing_rates"):
            with patch("app.api.routers.llm.get_model_rate") as mock_rate:
                mock_rate.return_value = MagicMock(points_per_1k_tokens=5)
                with patch("app.api.routers.llm._require_api_key", return_value="fake-key"):
                    with patch("app.api.routers.llm.call_deepseek") as mock_call:
                        mock_call.return_value = (
                            "running -> run\ncommuting -> commute",
                            MagicMock(
                                prompt_tokens=40, completion_tokens=10,
                                reasoning_tokens=0, total_tokens=50,
                            ),
                        )
                        with patch("app.services.llm_usage_service.log_llm_usage"):
                            response = client.post(
                                "/api/llm/extract-lemmas",
                                json={
                                    "sentence": "Running keeps commuting habits expensive.",
                                    "words": ["running", "commuting"],
                                },
                            )
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["lemmas"] == ["run", "commute"]

    def test_repairs_count_mismatch_with_local_fallback(self, client):
        """当 lemmas 数量不足时，接口应补齐本地还原结果而不是返回 502。"""
        with patch("app.api.routers.llm.ensure_default_billing_rates"):
            with patch("app.api.routers.llm.get_model_rate") as mock_rate:
                mock_rate.return_value = MagicMock(points_per_1k_tokens=5)
                with patch("app.api.routers.llm._require_api_key", return_value="fake-key"):
                    with patch("app.api.routers.llm.call_deepseek") as mock_call:
                        mock_call.return_value = (
                            '{"lemmas": ["run"]}',
                            MagicMock(
                                prompt_tokens=40, completion_tokens=10,
                                reasoning_tokens=0, total_tokens=50,
                            ),
                        )
                        with patch("app.services.llm_usage_service.log_llm_usage"):
                            response = client.post(
                                "/api/llm/extract-lemmas",
                                json={
                                    "sentence": "Running keeps commuting habits expensive.",
                                    "words": ["running", "commuting"],
                                },
                            )
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["lemmas"] == ["run", "commute"]


# ── /simplify-words tests ─────────────────────────────────────────────────

class TestSimplifyWords:
    def test_returns_ordered_array(self, client):
        """POST /api/llm/simplify-words 应返回有序简化词数组。"""
        with patch("app.api.routers.llm.ensure_default_billing_rates"):
            with patch("app.api.routers.llm.get_model_rate") as mock_rate:
                mock_rate.return_value = MagicMock(points_per_1k_tokens=5)
                with patch("app.api.routers.llm._require_api_key", return_value="fake-key"):
                    with patch("app.api.routers.llm.call_deepseek") as mock_call:
                        mock_call.return_value = (
                            '["hate", "avoid", "carefully reading"]',
                            MagicMock(
                                prompt_tokens=50, completion_tokens=10,
                                reasoning_tokens=0, total_tokens=60,
                            ),
                        )
                        with patch("app.api.routers.llm.consume_points"):
                            with patch("app.services.llm_usage_service.log_llm_usage"):
                                response = client.post(
                                    "/api/llm/simplify-words",
                                    json={
                                        "sentence": "I used to loathe and eschew perusing English.",
                                        "words": ["loathe", "eschew", "perusing"],
                                        "target_level": "B1",
                                        "enable_thinking": False,
                                    },
                                )
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["simplified_words"] == ["hate", "avoid", "carefully reading"]
        assert data["input_words"] == ["loathe", "eschew", "perusing"]
        assert data["trace_id"] is not None
        assert "usage" in data
        assert data["usage"]["total_tokens"] == 60

    def test_invalid_target_level_returns_422(self, client):
        """无效 target_level 应返回 422。"""
        with patch("app.api.routers.llm.ensure_default_billing_rates"):
            response = client.post(
                "/api/llm/simplify-words",
                json={
                    "sentence": "Hello world.",
                    "words": ["hello"],
                    "target_level": "INVALID",
                    "enable_thinking": False,
                },
            )
        assert response.status_code == 422

    def test_empty_words_returns_422(self, client):
        """空 words 列表应返回 422。"""
        with patch("app.api.routers.llm.ensure_default_billing_rates"):
            response = client.post(
                "/api/llm/simplify-words",
                json={
                    "sentence": "Hello world.",
                    "words": [],
                    "target_level": "B1",
                    "enable_thinking": False,
                },
            )
        assert response.status_code == 422

    def test_sentence_too_long_returns_422(self, client):
        """超过 2000 字符的句子应返回 422（Pydantic 验证器触发）。"""
        with patch("app.api.routers.llm.ensure_default_billing_rates"):
            long_sentence = "a" * 2001
            response = client.post(
                "/api/llm/simplify-words",
                json={
                    "sentence": long_sentence,
                    "words": ["test"],
                    "target_level": "B1",
                    "enable_thinking": False,
                },
            )
        # Pydantic validator 触发 → 422
        assert response.status_code == 422

    def test_parse_error_returns_502(self, client):
        """模型返回非 JSON 时应返回 502。"""
        with patch("app.api.routers.llm.ensure_default_billing_rates"):
            with patch("app.api.routers.llm.get_model_rate") as mock_rate:
                mock_rate.return_value = MagicMock(points_per_1k_tokens=5)
                with patch("app.api.routers.llm._require_api_key", return_value="fake-key"):
                    with patch("app.api.routers.llm.call_deepseek") as mock_call:
                        mock_call.return_value = (
                            "This is not JSON",
                            MagicMock(
                                prompt_tokens=50, completion_tokens=10,
                                reasoning_tokens=0, total_tokens=60,
                            ),
                        )
                        with patch("app.api.routers.llm.consume_points"):
                            with patch("app.services.llm_usage_service.log_llm_usage"):
                                response = client.post(
                                    "/api/llm/simplify-words",
                                    json={
                                        "sentence": "Hello world.",
                                        "words": ["hello"],
                                        "target_level": "B1",
                                        "enable_thinking": False,
                                    },
                                )
        assert response.status_code == 502
        data = response.json()
        assert data["detail"] == "模型响应格式错误，请稍后重试"

    def test_recovers_fenced_json_object(self, client):
        """模型返回 fenced JSON object 时应成功恢复。"""
        with patch("app.api.routers.llm.ensure_default_billing_rates"):
            with patch("app.api.routers.llm.get_model_rate") as mock_rate:
                mock_rate.return_value = MagicMock(points_per_1k_tokens=5)
                with patch("app.api.routers.llm._require_api_key", return_value="fake-key"):
                    with patch("app.api.routers.llm.call_deepseek") as mock_call:
                        mock_call.return_value = (
                            '```json\n{"simplified_words": ["avoid"], "word_levels": {"eschew": "C1"}}\n```',
                            MagicMock(
                                prompt_tokens=50, completion_tokens=10,
                                reasoning_tokens=0, total_tokens=60,
                            ),
                        )
                        with patch("app.api.routers.llm.consume_points"):
                            with patch("app.services.llm_usage_service.log_llm_usage"):
                                response = client.post(
                                    "/api/llm/simplify-words",
                                    json={
                                        "sentence": "I eschew that idea.",
                                        "words": ["eschew"],
                                        "target_level": "B1",
                                        "enable_thinking": False,
                                    },
                                )
        assert response.status_code == 200
        data = response.json()
        assert data["simplified_words"] == ["avoid"]
        assert data["word_levels"] == {"eschew": "C1"}

    def test_recovers_json_with_explanatory_text(self, client):
        """模型返回解释文字包裹的 JSON 时应成功恢复。"""
        with patch("app.api.routers.llm.ensure_default_billing_rates"):
            with patch("app.api.routers.llm.get_model_rate") as mock_rate:
                mock_rate.return_value = MagicMock(points_per_1k_tokens=5)
                with patch("app.api.routers.llm._require_api_key", return_value="fake-key"):
                    with patch("app.api.routers.llm.call_deepseek") as mock_call:
                        mock_call.return_value = (
                            'Here is the result:\n{"simplified_words": ["reading"], "word_levels": {"perusing": "B2"}}\nThanks.',
                            MagicMock(
                                prompt_tokens=50, completion_tokens=10,
                                reasoning_tokens=0, total_tokens=60,
                            ),
                        )
                        with patch("app.api.routers.llm.consume_points"):
                            with patch("app.services.llm_usage_service.log_llm_usage"):
                                response = client.post(
                                    "/api/llm/simplify-words",
                                    json={
                                        "sentence": "I enjoy perusing newspapers.",
                                        "words": ["perusing"],
                                        "target_level": "B1",
                                        "enable_thinking": False,
                                    },
                                )
        assert response.status_code == 200
        data = response.json()
        assert data["simplified_words"] == ["reading"]
        assert data["word_levels"] == {"perusing": "B2"}

    def test_blank_fenced_content_returns_502(self, client):
        """模型只返回空白 fenced 内容时应给出业务化错误。"""
        with patch("app.api.routers.llm.ensure_default_billing_rates"):
            with patch("app.api.routers.llm.get_model_rate") as mock_rate:
                mock_rate.return_value = MagicMock(points_per_1k_tokens=5)
                with patch("app.api.routers.llm._require_api_key", return_value="fake-key"):
                    with patch("app.api.routers.llm.call_deepseek") as mock_call:
                        mock_call.return_value = (
                            "```json\n\n```",
                            MagicMock(
                                prompt_tokens=50, completion_tokens=10,
                                reasoning_tokens=0, total_tokens=60,
                            ),
                        )
                        with patch("app.api.routers.llm.consume_points"):
                            with patch("app.services.llm_usage_service.log_llm_usage"):
                                response = client.post(
                                    "/api/llm/simplify-words",
                                    json={
                                        "sentence": "Hello world.",
                                        "words": ["hello"],
                                        "target_level": "B1",
                                        "enable_thinking": False,
                                    },
                                )
        assert response.status_code == 502
        assert response.json()["detail"] == "模型返回了空白内容，请稍后重试"

    def test_non_array_json_returns_502(self, client):
        """模型返回非数组 JSON 时应返回 502。"""
        with patch("app.api.routers.llm.ensure_default_billing_rates"):
            with patch("app.api.routers.llm.get_model_rate") as mock_rate:
                mock_rate.return_value = MagicMock(points_per_1k_tokens=5)
                with patch("app.api.routers.llm._require_api_key", return_value="fake-key"):
                    with patch("app.api.routers.llm.call_deepseek") as mock_call:
                        mock_call.return_value = (
                            '{"foo": "bar"}',
                            MagicMock(
                                prompt_tokens=50, completion_tokens=10,
                                reasoning_tokens=0, total_tokens=60,
                            ),
                        )
                        with patch("app.api.routers.llm.consume_points"):
                            with patch("app.services.llm_usage_service.log_llm_usage"):
                                response = client.post(
                                    "/api/llm/simplify-words",
                                    json={
                                        "sentence": "Hello world.",
                                        "words": ["hello"],
                                        "target_level": "B1",
                                        "enable_thinking": False,
                                    },
                                )
        assert response.status_code == 502
        assert response.json()["detail"] == "模型响应结构无效，请稍后重试"

    def test_invalid_word_levels_type_returns_502(self, client):
        """word_levels 不是对象时应返回结构错误。"""
        with patch("app.api.routers.llm.ensure_default_billing_rates"):
            with patch("app.api.routers.llm.get_model_rate") as mock_rate:
                mock_rate.return_value = MagicMock(points_per_1k_tokens=5)
                with patch("app.api.routers.llm._require_api_key", return_value="fake-key"):
                    with patch("app.api.routers.llm.call_deepseek") as mock_call:
                        mock_call.return_value = (
                            '{"simplified_words": ["read"], "word_levels": ["B2"]}',
                            MagicMock(
                                prompt_tokens=50, completion_tokens=10,
                                reasoning_tokens=0, total_tokens=60,
                            ),
                        )
                        with patch("app.api.routers.llm.consume_points"):
                            with patch("app.services.llm_usage_service.log_llm_usage"):
                                response = client.post(
                                    "/api/llm/simplify-words",
                                    json={
                                        "sentence": "I enjoy perusing newspapers.",
                                        "words": ["perusing"],
                                        "target_level": "B1",
                                        "enable_thinking": False,
                                    },
                                )
        assert response.status_code == 502
        assert response.json()["detail"] == "模型响应结构无效，请稍后重试"

    def test_simplified_words_matching_input_count(self, client):
        """简化词数量应与输入词数量匹配。"""
        with patch("app.api.routers.llm.ensure_default_billing_rates"):
            with patch("app.api.routers.llm.get_model_rate") as mock_rate:
                mock_rate.return_value = MagicMock(points_per_1k_tokens=5)
                with patch("app.api.routers.llm._require_api_key", return_value="fake-key"):
                    with patch("app.api.routers.llm.call_deepseek") as mock_call:
                        mock_call.return_value = (
                            '["hate", "avoid", "reading"]',
                            MagicMock(
                                prompt_tokens=50, completion_tokens=10,
                                reasoning_tokens=0, total_tokens=60,
                            ),
                        )
                        with patch("app.api.routers.llm.consume_points"):
                            with patch("app.services.llm_usage_service.log_llm_usage"):
                                response = client.post(
                                    "/api/llm/simplify-words",
                                    json={
                                        "sentence": "Test sentence.",
                                        "words": ["word1", "word2", "word3"],
                                        "target_level": "B1",
                                        "enable_thinking": False,
                                    },
                                )
        assert response.status_code == 200
        data = response.json()
        assert len(data["simplified_words"]) == 3
        assert data["input_words"] == ["word1", "word2", "word3"]

    def test_mismatched_simplified_word_count_returns_502(self, client):
        """数量不匹配时应返回稳定的业务错误。"""
        with patch("app.api.routers.llm.ensure_default_billing_rates"):
            with patch("app.api.routers.llm.get_model_rate") as mock_rate:
                mock_rate.return_value = MagicMock(points_per_1k_tokens=5)
                with patch("app.api.routers.llm._require_api_key", return_value="fake-key"):
                    with patch("app.api.routers.llm.call_deepseek") as mock_call:
                        mock_call.return_value = (
                            '["avoid"]',
                            MagicMock(
                                prompt_tokens=50, completion_tokens=10,
                                reasoning_tokens=0, total_tokens=60,
                            ),
                        )
                        with patch("app.api.routers.llm.consume_points"):
                            with patch("app.services.llm_usage_service.log_llm_usage"):
                                response = client.post(
                                    "/api/llm/simplify-words",
                                    json={
                                        "sentence": "I loathe and eschew it.",
                                        "words": ["loathe", "eschew"],
                                        "target_level": "B1",
                                        "enable_thinking": False,
                                    },
                                )
        assert response.status_code == 502
        assert response.json()["detail"] == "模型响应数量与输入不一致，请稍后重试"
