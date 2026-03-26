from __future__ import annotations

from types import SimpleNamespace

import pytest

import app.infra.dashscope_storage as dashscope_storage


def test_get_file_signed_url_returns_direct_url(monkeypatch):
    monkeypatch.setattr(dashscope_storage.dashscope, "api_key", "test-api-key")
    monkeypatch.setattr(
        dashscope_storage.Files,
        "get",
        lambda file_id, request_timeout=30: SimpleNamespace(output={"url": "https://example.com/signed-url"}),
    )

    signed_url = dashscope_storage.get_file_signed_url("uploads/2026/demo.mp4")
    assert signed_url == "https://example.com/signed-url"


def test_get_file_signed_url_reads_url_from_response_data(monkeypatch):
    monkeypatch.setattr(dashscope_storage.dashscope, "api_key", "test-api-key")
    monkeypatch.setattr(
        dashscope_storage.Files,
        "get",
        lambda file_id, request_timeout=30: SimpleNamespace(
            output={},
            to_dict=lambda: {"data": {"url": "https://example.com/from-data-url"}},
        ),
    )

    signed_url = dashscope_storage.get_file_signed_url("uploads/2026/demo.mp4")
    assert signed_url == "https://example.com/from-data-url"


def test_get_file_signed_url_uses_flattened_output_when_needed(monkeypatch):
    monkeypatch.setattr(dashscope_storage.dashscope, "api_key", "test-api-key")

    def fake_get(file_id, request_timeout=30, **kwargs):
        if kwargs.get("flattened_output"):
            return {"download_url": "https://example.com/from-flattened"}
        return SimpleNamespace(output={})

    monkeypatch.setattr(dashscope_storage.Files, "get", fake_get)

    signed_url = dashscope_storage.get_file_signed_url("uploads/2026/demo.mp4")
    assert signed_url == "https://example.com/from-flattened"


def test_get_file_signed_url_falls_back_to_oss_when_missing_signed_url(monkeypatch):
    monkeypatch.setattr(dashscope_storage.dashscope, "api_key", "test-api-key")
    monkeypatch.setattr(
        dashscope_storage.Files,
        "get",
        lambda file_id, request_timeout=30: SimpleNamespace(
            output={
                "id": file_id,
                "name": "demo.mp4",
                "status": "READY",
            }
        ),
    )

    file_id = "dashscope-instant/session-abc123/demo.mp4"
    signed_url = dashscope_storage.get_file_signed_url(file_id)
    assert signed_url == f"oss://{file_id}"


def test_get_file_signed_url_requires_file_id(monkeypatch):
    monkeypatch.setattr(dashscope_storage.dashscope, "api_key", "test-api-key")

    with pytest.raises(dashscope_storage.AsrError) as exc_info:
        dashscope_storage.get_file_signed_url("")

    assert exc_info.value.code == "DASHSCOPE_STORAGE_INVALID_FILE_ID"
