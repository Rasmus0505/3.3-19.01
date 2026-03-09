from __future__ import annotations

import json
import logging
from types import SimpleNamespace

import pytest

from app.infra import translation_qwen_mt


class _FakePermanentError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int = 400,
        request_id: str = "req_error",
        body: dict | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.request_id = request_id
        self.body = body


def _completion_json(
    items: list[str],
    *,
    finish_reason: str = "stop",
    request_id: str = "req_demo",
    prompt_tokens: int = 12,
    completion_tokens: int = 5,
    total_tokens: int = 17,
):
    return SimpleNamespace(
        id="chatcmpl-demo",
        _request_id=request_id,
        choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(items, ensure_ascii=False)), finish_reason=finish_reason)],
        usage=SimpleNamespace(prompt_tokens=prompt_tokens, completion_tokens=completion_tokens, total_tokens=total_tokens),
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


@pytest.fixture(autouse=True)
def _translation_defaults(monkeypatch):
    monkeypatch.setattr(translation_qwen_mt, "MT_BATCH_MAX_SENTENCES", 8)
    monkeypatch.setattr(translation_qwen_mt, "MT_BATCH_MAX_CHARS", 1400)
    monkeypatch.setattr(translation_qwen_mt, "MT_MIN_REQUEST_INTERVAL_MS", 0)
    monkeypatch.setattr(translation_qwen_mt, "MT_RETRY_MAX_ATTEMPTS", 3)
    monkeypatch.setattr(translation_qwen_mt, "_LAST_REQUEST_AT", 0.0)


def test_translate_to_zh_returns_content_for_single_success(monkeypatch):
    client, completions = _fake_client([_completion_json(["你好世界"], request_id="req_single")])
    monkeypatch.setattr(translation_qwen_mt, "_client", lambda api_key: client)

    result = translation_qwen_mt.translate_to_zh("Hello world", "test-key")

    assert result == "你好世界"
    assert len(completions.calls) == 1
    assert completions.calls[0]["timeout"] == translation_qwen_mt.MT_TIMEOUT_SECONDS
    assert "Input JSON" in completions.calls[0]["messages"][-1]["content"]


def test_translate_sentences_to_zh_batches_by_sentence_limit(monkeypatch):
    monkeypatch.setattr(translation_qwen_mt, "MT_BATCH_MAX_SENTENCES", 2)
    client, completions = _fake_client(
        [
            _completion_json(["中1", "中2"], request_id="req_1"),
            _completion_json(["中3", "中4"], request_id="req_2"),
            _completion_json(["中5"], request_id="req_3"),
        ]
    )
    progress: list[tuple[int, int]] = []
    monkeypatch.setattr(translation_qwen_mt, "_client", lambda api_key: client)

    result = translation_qwen_mt.translate_sentences_to_zh(
        ["a", "b", "c", "d", "e"],
        "test-key",
        progress_callback=lambda done, total: progress.append((done, total)),
    )

    assert result.texts == ["中1", "中2", "中3", "中4", "中5"]
    assert result.failed_count == 0
    assert result.total_requests == 3
    assert result.success_request_count == 3
    assert progress == [(1, 5), (2, 5), (3, 5), (4, 5), (5, 5)]
    assert len(completions.calls) == 3


def test_translate_sentences_to_zh_splits_batch_when_output_count_mismatches(monkeypatch):
    client, completions = _fake_client(
        [
            _completion_json(["第一句"], request_id="req_bad"),
            _completion_json(["第一句"], request_id="req_left"),
            _completion_json(["第二句"], request_id="req_right"),
        ]
    )
    progress: list[tuple[int, int]] = []
    monkeypatch.setattr(translation_qwen_mt, "_client", lambda api_key: client)

    result = translation_qwen_mt.translate_sentences_to_zh(
        ["first line", "second line"],
        "test-key",
        progress_callback=lambda done, total: progress.append((done, total)),
    )

    assert result.texts == ["第一句", "第二句"]
    assert result.failed_count == 0
    assert result.total_requests == 3
    assert result.success_request_count == 2
    assert result.latest_error_summary == ""
    assert progress == [(1, 2), (2, 2)]
    assert result.attempt_records[0]["success"] is False
    assert result.attempt_records[0]["error_code"] == "INVALID_BATCH_COUNT"


def test_translate_sentences_to_zh_retries_rate_limit_then_succeeds(monkeypatch):
    sleeps: list[float] = []
    client, completions = _fake_client(
        [
            _FakePermanentError("rate denied", status_code=429, request_id="req_429", body={"message": "Too Many Requests"}),
            _completion_json(["第一句", "第二句"], request_id="req_ok", prompt_tokens=20, completion_tokens=10, total_tokens=30),
        ]
    )
    progress: list[tuple[int, int]] = []
    monkeypatch.setattr(translation_qwen_mt, "_client", lambda api_key: client)
    monkeypatch.setattr(translation_qwen_mt.time, "sleep", lambda seconds: sleeps.append(seconds))

    result = translation_qwen_mt.translate_sentences_to_zh(
        ["first line", "second line"],
        "test-key",
        progress_callback=lambda done, total: progress.append((done, total)),
    )

    assert result.texts == ["第一句", "第二句"]
    assert result.failed_count == 0
    assert result.total_requests == 2
    assert result.success_request_count == 1
    assert result.success_total_tokens == 30
    assert progress == [(1, 2), (2, 2)]
    assert sleeps and sleeps[0] > 0
    assert len(completions.calls) == 2


def test_translate_sentences_to_zh_collects_final_failures(monkeypatch, caplog):
    client, _ = _fake_client(
        [
            _FakePermanentError("bad request", status_code=400, request_id="req_fail", body={"message": "invalid"}),
        ]
    )
    progress: list[tuple[int, int]] = []
    monkeypatch.setattr(translation_qwen_mt, "_client", lambda api_key: client)

    with caplog.at_level(logging.WARNING):
        result = translation_qwen_mt.translate_sentences_to_zh(
            ["first line"],
            "test-key",
            progress_callback=lambda done, total: progress.append((done, total)),
        )

    assert result.texts == [""]
    assert result.failed_count == 1
    assert result.total_requests == 1
    assert result.success_request_count == 0
    assert result.latest_error_summary.startswith("第1句失败：REQUEST_FAILED")
    assert progress == [(1, 1)]
    assert "[DEBUG] qwen_mt.batch.item_failed" in caplog.text
    assert "[DEBUG] qwen_mt.batch.partial_failed" in caplog.text
