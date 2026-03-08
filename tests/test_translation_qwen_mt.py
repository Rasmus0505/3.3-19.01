from __future__ import annotations

import logging
from types import SimpleNamespace

from app.infra import translation_qwen_mt


class _FakeRetryableError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 429):
        super().__init__(message)
        self.status_code = status_code


class _FakePermanentError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _completion(content: str, *, finish_reason: str = "stop"):
    return SimpleNamespace(
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


def test_translate_to_zh_retries_retryable_errors(monkeypatch):
    client, completions = _fake_client(
        [
            _FakeRetryableError("rate limit"),
            _FakeRetryableError("gateway timeout", status_code=504),
            _completion("你好"),
        ]
    )
    monkeypatch.setattr(translation_qwen_mt, "_client", lambda api_key: client)
    monkeypatch.setattr(translation_qwen_mt.time, "sleep", lambda seconds: None)

    result = translation_qwen_mt.translate_to_zh("Hello world", "test-key")

    assert result == "你好"
    assert len(completions.calls) == 3


def test_translate_sentences_to_zh_logs_partial_failures(monkeypatch, caplog):
    client, completions = _fake_client(
        [
            _completion("第一句"),
            _FakePermanentError("bad request", status_code=400),
            _completion("第三句"),
        ]
    )
    progress: list[tuple[int, int]] = []
    monkeypatch.setattr(translation_qwen_mt, "_client", lambda api_key: client)
    monkeypatch.setattr(translation_qwen_mt.time, "sleep", lambda seconds: None)

    with caplog.at_level(logging.WARNING):
        output, failed = translation_qwen_mt.translate_sentences_to_zh(
            ["first line", "second line", "third line"],
            "test-key",
            progress_callback=lambda done, total: progress.append((done, total)),
        )

    assert output == ["第一句", "", "第三句"]
    assert failed == 1
    assert progress == [(1, 3), (2, 3), (3, 3)]
    assert "[DEBUG] qwen_mt.batch.item_failed" in caplog.text
    assert "[DEBUG] qwen_mt.batch.partial_failed" in caplog.text
    assert len(completions.calls) == 3


def test_translate_to_zh_logs_finish_reason_length(monkeypatch, caplog):
    client, _ = _fake_client([_completion("截断内容", finish_reason="length")])
    monkeypatch.setattr(translation_qwen_mt, "_client", lambda api_key: client)

    with caplog.at_level(logging.WARNING):
        result = translation_qwen_mt.translate_to_zh("A fairly long subtitle line", "test-key")

    assert result == "截断内容"
    assert "[DEBUG] qwen_mt.translate.finish_length" in caplog.text
