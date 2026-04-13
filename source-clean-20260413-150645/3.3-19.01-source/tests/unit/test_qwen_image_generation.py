from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.infra.image_generation import qwen_image
from app.infra.image_generation.base import ImageGenerationConfig


def test_generate_image_calls_dashscope_with_expected_arguments(monkeypatch):
    captured: dict[str, object] = {}

    def fake_call(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(
            status_code=200,
            request_id="req-123",
            code="",
            message="",
            output={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "role": "assistant",
                            "content": [
                                {"image": "https://example.com/test-image.png"},
                            ],
                        },
                    }
                ]
            },
            usage={"width": 512, "height": 512, "image_count": 1},
        )

    monkeypatch.setattr(qwen_image.dashscope.MultiModalConversation, "call", fake_call)

    result = qwen_image.generate_image(
        "一只坐在木桌上的红苹果，写实摄影风格。",
        api_key="test-key",
        config=ImageGenerationConfig(
            model_name="qwen-image-2.0-pro",
            size="512*512",
            image_count=1,
            prompt_extend=False,
            watermark=False,
            negative_prompt="模糊，低清晰度",
            seed=123,
        ),
    )

    assert captured["api_key"] == "test-key"
    assert captured["model"] == "qwen-image-2.0-pro"
    assert captured["result_format"] == "message"
    assert captured["stream"] is False
    assert captured["size"] == "512*512"
    assert captured["n"] == 1
    assert captured["prompt_extend"] is False
    assert captured["negative_prompt"] == "模糊，低清晰度"
    assert captured["seed"] == 123
    assert result.request_id == "req-123"
    assert result.width == 512
    assert result.height == 512
    assert len(result.images) == 1
    assert result.images[0].url == "https://example.com/test-image.png"


def test_generate_image_rejects_invalid_image_count():
    with pytest.raises(qwen_image.ImageGenerationError) as exc_info:
        qwen_image.generate_image(
            "test prompt",
            api_key="test-key",
            config=ImageGenerationConfig(model_name="qwen-image-2.0-pro", size="512*512", image_count=7),
        )

    assert exc_info.value.code == "IMAGE_INVALID_COUNT"


def test_generate_image_raises_on_provider_error(monkeypatch):
    def fake_call(**kwargs):
        return SimpleNamespace(
            status_code=400,
            request_id="req-err",
            code="InvalidParameter",
            message="bad request",
        )

    monkeypatch.setattr(qwen_image.dashscope.MultiModalConversation, "call", fake_call)

    with pytest.raises(qwen_image.ImageGenerationError) as exc_info:
        qwen_image.generate_image(
            "test prompt",
            api_key="test-key",
            config=ImageGenerationConfig(model_name="qwen-image-2.0-pro", size="512*512", image_count=1),
        )

    assert exc_info.value.code == "InvalidParameter"
