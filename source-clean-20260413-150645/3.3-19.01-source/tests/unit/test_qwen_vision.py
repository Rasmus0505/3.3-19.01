from __future__ import annotations

from pathlib import Path

import pytest

from app.infra.vision import qwen_vl
from app.infra.vision.base import VisionConfig


class _FakeResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def model_dump(self) -> dict:
        return self._payload


class _FakeClient:
    def __init__(self, on_create):
        self.chat = type(
            "FakeChat",
            (),
            {
                "completions": type(
                    "FakeCompletions",
                    (),
                    {
                        "create": staticmethod(on_create),
                    },
                )()
            },
        )()


def test_analyze_image_calls_openai_compatible_api_with_expected_arguments(monkeypatch):
    captured: dict[str, object] = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        return _FakeResponse(
            {
                "id": "chatcmpl-test-1",
                "model": "qwen3-vl-flash",
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "图片中是一位女孩和一只小狗在海边互动。",
                        }
                    }
                ],
                "usage": {
                    "prompt_tokens": 123,
                    "completion_tokens": 18,
                    "total_tokens": 141,
                    "prompt_tokens_details": {
                        "image_tokens": 96,
                    },
                },
            }
        )

    monkeypatch.setattr(qwen_vl, "_client", lambda api_key, base_url: _FakeClient(fake_create))

    result = qwen_vl.analyze_image(
        "https://example.com/test.png",
        api_key="test-key",
        config=VisionConfig(
            model_name="qwen3-vl-flash",
            prompt="请描述图片主体。",
            min_pixels=65536,
            max_pixels=2621440,
            enable_thinking=False,
            vl_high_resolution_images=True,
            max_tokens=300,
            seed=123,
        ),
    )

    assert captured["model"] == "qwen3-vl-flash"
    assert captured["temperature"] == 0.01
    assert captured["top_p"] == 0.001
    assert captured["max_tokens"] == 300
    assert captured["seed"] == 123
    assert captured["extra_body"] == {
        "enable_thinking": False,
        "vl_high_resolution_images": True,
    }
    messages = captured["messages"]
    assert messages[0]["content"][0]["type"] == "text"
    assert messages[0]["content"][0]["text"] == "请描述图片主体。"
    assert messages[0]["content"][1]["type"] == "image_url"
    assert messages[0]["content"][1]["image_url"]["url"] == "https://example.com/test.png"
    assert messages[0]["content"][1]["min_pixels"] == 65536
    assert messages[0]["content"][1]["max_pixels"] == 2621440
    assert result.text == "图片中是一位女孩和一只小狗在海边互动。"
    assert result.request_id == "chatcmpl-test-1"
    assert result.image_tokens == 96


def test_analyze_image_converts_local_file_to_data_url(monkeypatch, tmp_path: Path):
    captured: dict[str, object] = {}
    image_path = tmp_path / "sample.png"
    image_path.write_bytes(b"\x89PNG\r\n\x1a\n")

    def fake_create(**kwargs):
        captured.update(kwargs)
        return _FakeResponse(
            {
                "id": "chatcmpl-test-2",
                "model": "qwen3-vl-flash",
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "这是一张测试图片。",
                        }
                    }
                ],
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 5,
                    "total_tokens": 15,
                },
            }
        )

    monkeypatch.setattr(qwen_vl, "_client", lambda api_key, base_url: _FakeClient(fake_create))

    result = qwen_vl.analyze_image(str(image_path), api_key="test-key")

    image_url = captured["messages"][0]["content"][1]["image_url"]["url"]
    assert image_url.startswith("data:image/png;base64,")
    assert result.text == "这是一张测试图片。"


def test_analyze_image_raises_on_missing_api_key(monkeypatch):
    monkeypatch.setattr(qwen_vl, "DASHSCOPE_API_KEY", "")

    with pytest.raises(qwen_vl.VisionError) as exc_info:
        qwen_vl.analyze_image("https://example.com/test.png", api_key="")

    assert exc_info.value.code == "VISION_API_KEY_MISSING"


def test_analyze_image_rejects_unsupported_model():
    with pytest.raises(qwen_vl.VisionError) as exc_info:
        qwen_vl.analyze_image(
            "https://example.com/test.png",
            api_key="test-key",
            config=VisionConfig(model_name="unsupported-model"),
        )

    assert exc_info.value.code == "VISION_MODEL_UNSUPPORTED"


def test_analyze_image_raises_on_provider_error(monkeypatch):
    def fake_create(**kwargs):
        raise RuntimeError("upstream unavailable")

    monkeypatch.setattr(qwen_vl, "_client", lambda api_key, base_url: _FakeClient(fake_create))

    with pytest.raises(qwen_vl.VisionError) as exc_info:
        qwen_vl.analyze_image("https://example.com/test.png", api_key="test-key")

    assert exc_info.value.code == "VISION_REQUEST_FAILED"
