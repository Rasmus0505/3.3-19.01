from __future__ import annotations

import pytest

from app.services import lesson_service as lesson_service_module
from app.services.asr_dashscope import AsrError


def test_resolve_dashscope_asr_source_url_prefers_signed_url_lookup(monkeypatch):
    monkeypatch.setattr(
        lesson_service_module,
        "get_file_signed_url",
        lambda file_id: f"https://signed.example.com/{file_id}?token=abc123",
    )

    resolved = lesson_service_module._resolve_dashscope_asr_source_url(
        dashscope_file_id="uploads/20260326/demo.mp4",
        dashscope_file_url="https://oss.example.com/uploads/20260326/demo.mp4",
    )

    assert resolved == "https://signed.example.com/uploads/20260326/demo.mp4?token=abc123"


def test_resolve_dashscope_asr_source_url_falls_back_to_client_url(monkeypatch):
    def fake_get_file_signed_url(_file_id: str) -> str:
        raise AsrError("DASHSCOPE_STORAGE_FILE_GET_FAILED", "查询 DashScope 文件失败", "boom")

    monkeypatch.setattr(lesson_service_module, "get_file_signed_url", fake_get_file_signed_url)

    resolved = lesson_service_module._resolve_dashscope_asr_source_url(
        dashscope_file_id="uploads/20260326/demo.mp4",
        dashscope_file_url="https://oss.example.com/uploads/20260326/demo.mp4",
    )

    assert resolved == "https://oss.example.com/uploads/20260326/demo.mp4"


def test_resolve_dashscope_asr_source_url_raises_without_file_id_or_url():
    with pytest.raises(lesson_service_module.MediaError) as exc_info:
        lesson_service_module._resolve_dashscope_asr_source_url(
            dashscope_file_id="",
            dashscope_file_url="",
        )

    assert exc_info.value.code == "DASHSCOPE_FILE_ID_REQUIRED"
