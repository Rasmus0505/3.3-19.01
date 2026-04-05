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
        assert "parse" in data["detail"].lower() or "Failed to parse" in data["detail"]

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
