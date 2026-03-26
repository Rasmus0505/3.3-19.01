from __future__ import annotations

from types import SimpleNamespace

import pytest

import app.infra.dashscope_storage as dashscope_storage


def test_normalize_dashscope_file_url_encodes_non_ascii_path_without_touching_query():
    normalized = dashscope_storage.normalize_dashscope_file_url(
        "https://oss.example.com/dashscope-instant/2026-03-27/测试.mp4?Signature=abc%2B123&Expires=1"
    )

    assert normalized == "https://oss.example.com/dashscope-instant/2026-03-27/%E6%B5%8B%E8%AF%95.mp4?Signature=abc%2B123&Expires=1"


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


def test_get_file_signed_url_normalizes_non_ascii_url_from_meta(monkeypatch):
    monkeypatch.setattr(dashscope_storage.dashscope, "api_key", "test-api-key")
    monkeypatch.setattr(
        dashscope_storage.Files,
        "get",
        lambda file_id, request_timeout=30: SimpleNamespace(
            output={"url": f"https://oss.example.com/{file_id}?token=abc123"}
        ),
    )

    signed_url = dashscope_storage.get_file_signed_url("dashscope-instant/2026-03-27/测试.mp4")
    assert signed_url == "https://oss.example.com/dashscope-instant/2026-03-27/%E6%B5%8B%E8%AF%95.mp4?token=abc123"


def test_get_file_signed_url_uses_flattened_output_when_needed(monkeypatch):
    monkeypatch.setattr(dashscope_storage.dashscope, "api_key", "test-api-key")

    def fake_get(file_id, request_timeout=30, **kwargs):
        if kwargs.get("flattened_output"):
            return {"download_url": "https://example.com/from-flattened"}
        return SimpleNamespace(output={})

    monkeypatch.setattr(dashscope_storage.Files, "get", fake_get)

    signed_url = dashscope_storage.get_file_signed_url("uploads/2026/demo.mp4")
    assert signed_url == "https://example.com/from-flattened"


def test_get_file_signed_url_accepts_http_input_without_meta_lookup(monkeypatch):
    monkeypatch.setattr(dashscope_storage.dashscope, "api_key", "test-api-key")

    def fake_get(*_args, **_kwargs):
        raise AssertionError("Files.get should not be called when file_id is already an URL")

    monkeypatch.setattr(dashscope_storage.Files, "get", fake_get)

    signed_url = dashscope_storage.get_file_signed_url("https://oss.example.com/uploads/2026/demo.mp4")
    assert signed_url == "https://oss.example.com/uploads/2026/demo.mp4"


def test_get_file_signed_url_raises_when_missing_signed_url(monkeypatch):
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

    with pytest.raises(dashscope_storage.AsrError) as exc_info:
        dashscope_storage.get_file_signed_url("dashscope-instant/session-abc123/demo.mp4")

    assert exc_info.value.code == "DASHSCOPE_STORAGE_SIGNED_URL_MISSING"


def test_get_file_signed_url_requires_file_id(monkeypatch):
    monkeypatch.setattr(dashscope_storage.dashscope, "api_key", "test-api-key")

    with pytest.raises(dashscope_storage.AsrError) as exc_info:
        dashscope_storage.get_file_signed_url("")

    assert exc_info.value.code == "DASHSCOPE_STORAGE_INVALID_FILE_ID"
