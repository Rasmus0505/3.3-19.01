from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.infra.ocr import dashscope_ocr
from app.infra.ocr.base import OCRConfig


def test_extract_ocr_calls_dashscope_with_expected_arguments(monkeypatch):
    captured: dict[str, object] = {}

    def fake_call(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(
            status_code=200,
            request_id="ocr-req-1",
            code="",
            message="",
            output={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "role": "assistant",
                            "content": [
                                {
                                    "text": "第一行\n第二行",
                                    "ocr_result": {
                                        "kv_result": {"标题": "测试票据"},
                                        "words_info": [
                                            {
                                                "text": "第一行",
                                                "location": [1, 2, 3, 4, 5, 6, 7, 8],
                                                "rotate_rect": [4, 5, 6, 7, 0],
                                            }
                                        ],
                                    },
                                }
                            ],
                        },
                    }
                ]
            },
            usage={
                "input_tokens": 120,
                "output_tokens": 20,
                "total_tokens": 140,
                "image_tokens": 64,
            },
        )

    monkeypatch.setattr(dashscope_ocr.dashscope.MultiModalConversation, "call", fake_call)

    result = dashscope_ocr.extract_ocr(
        "https://example.com/test.png",
        api_key="test-key",
        config=OCRConfig(
            model_name="qwen-vl-ocr-latest",
            prompt="请提取全部文字。",
            min_pixels=3072,
            max_pixels=8388608,
            enable_rotate=True,
        ),
    )

    assert captured["api_key"] == "test-key"
    assert captured["model"] == "qwen-vl-ocr-latest"
    assert captured["messages"][0]["content"][0]["image"] == "https://example.com/test.png"
    assert captured["messages"][0]["content"][0]["enable_rotate"] is True
    assert captured["messages"][0]["content"][1]["text"] == "请提取全部文字。"
    assert result.request_id == "ocr-req-1"
    assert result.text == "第一行\n第二行"
    assert result.structured_result == {"标题": "测试票据"}
    assert result.words_info[0].text == "第一行"
    assert result.image_tokens == 64


def test_extract_ocr_rejects_unsupported_model():
    with pytest.raises(dashscope_ocr.OCRError) as exc_info:
        dashscope_ocr.extract_ocr(
            "https://example.com/test.png",
            api_key="test-key",
            config=OCRConfig(model_name="unsupported-model"),
        )

    assert exc_info.value.code == "OCR_MODEL_UNSUPPORTED"


def test_extract_ocr_raises_on_provider_error(monkeypatch):
    def fake_call(**kwargs):
        return SimpleNamespace(
            status_code=400,
            request_id="ocr-req-err",
            code="InvalidParameter",
            message="bad request",
        )

    monkeypatch.setattr(dashscope_ocr.dashscope.MultiModalConversation, "call", fake_call)

    with pytest.raises(dashscope_ocr.OCRError) as exc_info:
        dashscope_ocr.extract_ocr(
            "https://example.com/test.png",
            api_key="test-key",
            config=OCRConfig(model_name="qwen-vl-ocr-latest"),
        )

    assert exc_info.value.code == "InvalidParameter"
