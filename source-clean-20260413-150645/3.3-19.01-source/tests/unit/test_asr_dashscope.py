from __future__ import annotations

from types import SimpleNamespace

from app.infra import asr_dashscope


def test_create_task_enables_oss_resolution_header_for_oss_url(monkeypatch):
    captured: dict[str, object] = {}

    def fake_async_call(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(output={"task_id": "task-001"})

    monkeypatch.setattr(asr_dashscope.QwenTranscription, "async_call", fake_async_call)

    asr_dashscope._create_task("qwen3-asr-flash-filetrans", "oss://dashscope-instant/demo.mp4")

    assert captured["headers"] == {"X-DashScope-OssResourceResolve": "enable"}


def test_create_task_skips_oss_resolution_header_for_https_url(monkeypatch):
    captured: dict[str, object] = {}

    def fake_async_call(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(output={"task_id": "task-002"})

    monkeypatch.setattr(asr_dashscope.QwenTranscription, "async_call", fake_async_call)

    asr_dashscope._create_task("qwen3-asr-flash-filetrans", "https://oss.example.com/demo.mp4?token=abc")

    assert captured["headers"] is None
