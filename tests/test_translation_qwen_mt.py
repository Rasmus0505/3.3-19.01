from __future__ import annotations

import logging
from types import SimpleNamespace

import pytest

from app.infra import translation_qwen_mt


class _FakePermanentError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _completion(content: str, *, finish_reason: str = "stop", request_id: str = "req_demo"):
    return SimpleNamespace(
        id="chatcmpl-demo",
        _request_id=request_id,
        choices=[SimpleNamespace(message=SimpleNamespace(content=content), finish_reason=finish_reason)],
        usage=SimpleNamespace(prompt_tokens=12, completion_tokens=5, total_tokens=17),
    )


class _FakeCompletions:
    def __init__(self, scripted: list[object]):
        self.scripted = list(scripted)
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        current = self.scripted.pop(0)
        if isinstance(current, Exception):
            raise current
        return current


def _fake_client(scripted: list[object]):
    completions = _FakeCompletions(scripted)
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    return client, completions


def test_translate_to_zh_returns_content_for_single_success(monkeypatch):
    client, completions = _fake_client([_completion("你好", request_id="req_single")])
    monkeypatch.setattr(translation_qwen_mt, "_client", lambda api_key: client)

    result = translation_qwen_mt.translate_to_zh("Hello world", "test-key")

    assert result == "你好"
    assert len(completions.calls) == 1
    assert completions.calls[0]["timeout"] == translation_qwen_mt.MT_TIMEOUT_SECONDS


def test_translate_sentences_to_zh_collects_usage_and_failures(monkeypatch, caplog):
    client, completions = _fake_client(
        [
            _completion("第一句", request_id="req_1"),
            _FakePermanentError("bad request", status_code=400),
            _completion("第三句", finish_reason="length", request_id="req_3"),
        ]
    )
    progress: list[tuple[int, int]] = []
    monkeypatch.setattr(translation_qwen_mt, "_client", lambda api_key: client)

    with caplog.at_level(logging.WARNING):
        result = translation_qwen_mt.translate_sentences_to_zh(
            ["first line", "second line", "third line"],
            "test-key",
            progress_callback=lambda done, total: progress.append((done, total)),
        )

    assert result.texts == ["第一句", "", "第三句"]
    assert result.failed_count == 1
    assert result.total_requests == 3
    assert result.success_request_count == 2
    assert result.success_prompt_tokens == 24
    assert result.success_completion_tokens == 10
    assert result.success_total_tokens == 34
    assert "第2句失败" in result.latest_error_summary
    assert progress == [(1, 3), (2, 3), (3, 3)]
    assert result.attempt_records[0]["provider_request_id"] == "req_1"
    assert result.attempt_records[1]["success"] is False
    assert result.attempt_records[2]["finish_reason"] == "length"
    assert "[DEBUG] qwen_mt.batch.item_failed" in caplog.text
    assert "[DEBUG] qwen_mt.batch.partial_failed" in caplog.text
    assert "[DEBUG] qwen_mt.translate.finish_length" in caplog.text
    assert len(completions.calls) == 3


def test_translate_to_zh_raises_when_sentence_fails(monkeypatch):
    client, _ = _fake_client([_FakePermanentError("rate denied", status_code=429)])
    monkeypatch.setattr(translation_qwen_mt, "_client", lambda api_key: client)

    with pytest.raises(translation_qwen_mt.TranslationError):
        translation_qwen_mt.translate_to_zh("A failed line", "test-key")
