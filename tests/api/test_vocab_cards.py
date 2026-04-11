from __future__ import annotations

from unittest.mock import MagicMock, patch


def _usage():
    return MagicMock(prompt_tokens=50, completion_tokens=10)


def test_generate_vocab_cards_accepts_wrapped_cards_payload(authenticated_client):
    with patch("app.api.routers.vocab_cards._require_api_key", return_value="fake-key"):
        with patch("app.api.routers.llm.ensure_default_billing_rates"):
            with patch("app.api.routers.llm.get_model_rate", return_value=None):
                with patch("app.api.routers.llm.call_deepseek") as mock_call:
                    mock_call.return_value = (
                        (
                            '{"cards":[{"word":"ubiquitous","definition":"present everywhere",'
                            '"definition_zh":"无处不在","example_sentence":"Smartphones are ubiquitous in daily life."}]}'
                        ),
                        _usage(),
                    )

                    response = authenticated_client.post(
                        "/api/vocab-cards/generate",
                        json={
                            "words": [
                                {
                                    "word": "ubiquitous",
                                    "cefr_level": "C1",
                                    "context_sentence": "Smartphones are ubiquitous in daily life.",
                                }
                            ],
                            "target_level": "B1",
                            "context_text": "Smartphones are ubiquitous in daily life.",
                        },
                    )

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["cards"] == [
        {
            "word": "ubiquitous",
            "cefr_level": "C1",
            "definition": "present everywhere\n无处不在",
            "example_sentence": "Smartphones are ubiquitous in daily life.",
            "image_url": None,
        }
    ]


def test_generate_vocab_cards_returns_502_for_invalid_llm_payload(authenticated_client):
    with patch("app.api.routers.vocab_cards._require_api_key", return_value="fake-key"):
        with patch("app.api.routers.llm.ensure_default_billing_rates"):
            with patch("app.api.routers.llm.get_model_rate", return_value=None):
                with patch("app.api.routers.llm.call_deepseek") as mock_call:
                    mock_call.return_value = ("not valid json", _usage())

                    response = authenticated_client.post(
                        "/api/vocab-cards/generate",
                        json={
                            "words": [{"word": "ubiquitous", "cefr_level": "C1"}],
                            "target_level": "B1",
                            "context_text": "Smartphones are ubiquitous in daily life.",
                        },
                    )

    assert response.status_code == 502
    assert response.json()["detail"] == "Card generation returned invalid JSON"
